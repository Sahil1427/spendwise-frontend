
import { Injectable, inject, computed, signal } from '@angular/core';
import type {
  Transaction,
  TransactionType,
} from './transaction.service';
import type { SettingsPreferences } from './settings.service';
import { AuthService } from './auth.service';

export type BackendStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface BackendPrefs {
  connected: boolean;
  baseUrl: string;
}

const PREFS_KEY = 'spendwise-backend';
const TIMEOUT_MS = 9000;

/**
 * HTTP client for the SpendWise Spring Boot backend.
 *
 * Default behavior:
 * - Uses same-origin /api requests in production.
 * - Nginx proxies /api requests to the Spring Boot backend.
 * - Supports custom backend URLs through application settings.
 *
 * Design: local-first, server mirror.
 *
 * - UI writes always hit the local signal + localStorage cache first.
 * - When connected, the same operation is mirrored to the API.
 * - Connect performs an initial sync from the server.
 * - On app startup, a previously connected backend is checked again.
 *
 * The payloads remain identical to the client's own shapes.
 */
@Injectable({ providedIn: 'root' })
export class BackendService {
  readonly status = signal<BackendStatus>('idle');
  readonly message = signal('');

  private readonly prefsKey = PREFS_KEY;
  private readonly prefs = this.loadPrefs();

  /**
   * All backend data is per-user on the server: every request carries the
   * signed-in account name so syncs and mirrors only ever touch that
   * user's own records (a new user starts from an empty ledger).
   */
  private readonly scope = inject(AuthService).dataScope();
  private userParam(): string {
    return `user=${encodeURIComponent(this.scope)}`;
  }

  /**
   * Empty URL means same-origin requests.
   * Example: /api/health
   */
  readonly baseUrl = signal(this.prefs.baseUrl);

  /** True once a health check succeeded. */
  readonly connected = computed(() => this.status() === 'connected');

  // ------------------------------------------------------------------
  // Connection lifecycle
  // ------------------------------------------------------------------

  async connect(): Promise<boolean> {
    this.setStatus('connecting', 'Checking backend...');

    try {
      const health = await this.call<{ records?: number }>(
        `/health?${this.userParam()}`
      );

      this.setStatus(
        'connected',
        `Connected · ${health.records ?? 0} records on server`
      );

      this.persistPrefs(true);
      return true;
    } catch (err) {
      this.setStatus('error', this.describeError(err));
      return false;
    }
  }

  disconnect(): void {
    this.setStatus('idle', '');
    this.persistPrefs(false);
  }

  /**
   * Reports the first background mirror failure
   * without repeatedly notifying the user.
   */
  reportMirrorError(err: unknown): void {
    if (this.status() !== 'connected') {
      return;
    }

    this.setStatus(
      'error',
      `A change could not reach the backend — ${this.describeError(err)}. ` +
      'Changes are still saved on this device and will sync on the next start.'
    );
  }

  /**
   * Configure a custom backend URL.
   *
   * Empty value means same-origin /api requests.
   */
  setBaseUrl(value: string): void {
    const clean = value.trim().replace(/\/+$/, '');

    this.baseUrl.set(clean);
    this.persistPrefs(this.status() === 'connected');
  }

  /**
   * Automatically checks the backend on startup.
   * If unavailable, the application remains local-first.
   */
  async autoConnect(): Promise<boolean> {
    this.setStatus('connecting', 'Connecting to the backend...');

    try {
      const health = await this.call<{ records?: number }>(
        `/health?${this.userParam()}`
      );

      this.setStatus(
        'connected',
        `Backend connected · ${health.records ?? 0} records`
      );

      this.persistPrefs(true);
      return true;
    } catch {
      this.setStatus('idle', '');
      this.persistPrefs(false);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  fetchTransactions(): Promise<Transaction[]> {
    return this.call<Transaction[]>(`/transactions?${this.userParam()}`);
  }

  fetchSettingsSettings(): Promise<SettingsPreferences | null> {
    return this.call<SettingsPreferences>(`/settings?${this.userParam()}`);
  }

  // ------------------------------------------------------------------
  // Mirrors
  // ------------------------------------------------------------------

  create(tx: Transaction): Promise<Transaction> {
    return this.call<Transaction>(`/transactions?${this.userParam()}`, {
      method: 'POST',
      body: tx,
    });
  }

  update(id: string, tx: Transaction): Promise<Transaction> {
    return this.call<Transaction>(`/transactions/${id}?${this.userParam()}`, {
      method: 'PUT',
      body: tx,
    });
  }

  remove(id: string): Promise<void> {
    return this.call<void>(`/transactions/${id}?${this.userParam()}`, {
      method: 'DELETE',
    });
  }

  clear(): Promise<{ cleared: number }> {
    return this.call<{ cleared: number }>(
      `/transactions/clear?${this.userParam()}`,
      { method: 'DELETE' }
    );
  }

  bulk(
    items: Transaction[],
    defaultCurrency?: string
  ): Promise<{ count: number }> {
    const params = `?${this.userParam()}` +
      (defaultCurrency
        ? `&defaultCurrency=${encodeURIComponent(defaultCurrency)}`
        : '');

    return this.call<{ count: number }>(`/transactions/bulk${params}`, {
      method: 'POST',
      body: items,
    });
  }

  seedDemo(): Promise<{ demoRecords: number }> {
    return this.call<{ demoRecords: number }>(
      `/transactions/seed/demo?${this.userParam()}`,
      { method: 'POST', body: {} }
    );
  }

  completePlanner(id: string): Promise<Transaction> {
    return this.call<Transaction>(
      `/transactions/${id}/complete?${this.userParam()}`,
      { method: 'POST', body: {} }
    );
  }

  reschedulePlanner(
    id: string,
    newDate: string
  ): Promise<Transaction> {
    return this.call<Transaction>(
      `/transactions/${id}/reschedule?${this.userParam()}`,
      { method: 'PUT', body: { newDate } }
    );
  }

  saveSettings(prefs: SettingsPreferences): Promise<unknown> {
    return this.call(`/settings?${this.userParam()}`, {
      method: 'PUT',
      body: prefs,
    });
  }

  addCategory(
    type: TransactionType,
    name: string
  ): Promise<unknown> {
    return this.call('/categories', {
      method: 'POST',
      body: { type, name },
    });
  }

  removeCategory(
    type: TransactionType,
    name: string
  ): Promise<unknown> {
    return this.call(
      `/categories/${type}?name=${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
  }

  // ------------------------------------------------------------------
  // HTTP plumbing
  // ------------------------------------------------------------------

  private async call<T>(
    path: string,
    init?: {
      method?: string;
      body?: unknown;
    }
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS
    );

    try {
      const response = await fetch(this.base() + path, {
        method: init?.method ?? 'GET',
        signal: controller.signal,
        headers: init?.body
          ? { 'Content-Type': 'application/json' }
          : undefined,
        body: init?.body
          ? JSON.stringify(init.body)
          : undefined,
      });

      if (!response.ok) {
        const detail = await this.peekError(response);

        throw new Error(
          `${response.status} ${response.statusText}` +
          `${detail ? ` — ${detail}` : ''}`
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async peekError(response: Response): Promise<string> {
    try {
      const data = (await response.json()) as {
        error?: string;
      };

      return data.error ?? '';
    } catch {
      return '';
    }
  }

  /**
   * Empty base URL:
   *   /api
   *
   * Custom base URL:
   *   https://backend.example.com/api
   */
  private base(): string {
    const configuredUrl = this.baseUrl().trim().replace(/\/+$/, '');

    return configuredUrl
      ? `${configuredUrl}/api`
      : '/api';
  }

  private describeError(err: unknown): string {
    if (
      err instanceof DOMException &&
      err.name === 'AbortError'
    ) {
      return 'timed out';
    }

    if (err instanceof TypeError) {
      return 'could not reach the URL (is the backend running?)';
    }

    return err instanceof Error
      ? err.message
      : String(err);
  }

  private setStatus(
    status: BackendStatus,
    message?: string
  ): void {
    this.status.set(status);

    if (message !== undefined) {
      this.message.set(message);
    }
  }

  private persistPrefs(connected: boolean): void {
    const prefs = {
      connected,
      baseUrl: this.baseUrl(),
    };

    localStorage.setItem(
      this.prefsKey,
      JSON.stringify(prefs)
    );
  }

  /**
   * Loads saved preferences.
   *
   * Migrates the previous localhost default to same-origin
   * access, while preserving any custom backend URL.
   */
  private loadPrefs(): BackendPrefs {
    try {
      const saved = localStorage.getItem(this.prefsKey);

      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BackendPrefs>;

        let savedBaseUrl =
          typeof parsed.baseUrl === 'string'
            ? parsed.baseUrl.trim()
            : '';

        // Migrate the old default.
        if (
          savedBaseUrl === 'http://localhost:8080' ||
          savedBaseUrl === 'http://127.0.0.1:8080'
        ) {
          savedBaseUrl = '';
        }

        return {
          connected: parsed.connected === true,
          baseUrl: savedBaseUrl.replace(/\/+$/, ''),
        };
      }
    } catch {
      // Use default preferences.
    }

    return {
      connected: false,
      baseUrl: '',
    };
  }
}
