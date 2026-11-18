import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  Transaction,
  TransactionType,
} from './transaction.service';
import type { SettingsPreferences } from './settings.service';

export type BackendStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface BackendPrefs {
  connected: boolean;
  baseUrl: string;
}

const PREFS_KEY = 'spendwise-backend';
const TIMEOUT_MS = 9000;

/**
 * HTTP client for the SpendWise Spring Boot backend (default
 * http://localhost:8080). Design: **local-first, server mirror** —
 *
 * - UI writes always hit the local signal + localStorage cache first
 *   (instant, works offline); when the connection is active the same
 *   operation is mirrored to the API in the background.
 * - "Connect" performs an initial sync: the server's records become the
 *   device's dataset (adopted by TransactionService), so switching on
 *   another device starts from the same numbers.
 * - On app start, if the persisted flag says "connected" the app quietly
 *   re-fetches and adopts the server state again (cross-device sync).
 *
 * The payloads are byte-identical to the client's own shapes — no mapping.
 */
@Injectable({ providedIn: 'root' })
export class BackendService {
  readonly status = signal<BackendStatus>('idle');
  readonly message = signal('');

  private readonly prefsKey = PREFS_KEY;
  private readonly prefs = this.loadPrefs();

  readonly baseUrl = signal(this.prefs.baseUrl);
  /** True once a health check succeeded; persisted across reloads. */
  readonly connected = computed(() => this.status() === 'connected');

  // ------------------------------------------------------------------
  // Connection lifecycle
  // ------------------------------------------------------------------

  /** Health-check the base URL; on success: status=connected + persist. */
  async connect(): Promise<boolean> {
    this.setStatus('connecting', 'Checking backend…');
    try {
      const health = await this.call<{ records?: number }>(
        '/health'
      ).then(h => h);
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
   * Called by the mirror helpers when a background write fails.
   * Surfaces the first failure per connect session in the panel without
   * re-toasting on every subsequent write while the backend is down.
   */
  reportMirrorError(err: unknown): void {
    if (this.status() !== 'connected') {
      return; // already flagged — keep it quiet
    }
    this.setStatus('error',
      `A change could not reach the backend — ${this.describeError(err)}. ` +
      `Changes are still saved on this device and will sync on the next start.`);
  }

  setBaseUrl(value: string): void {
    const clean = (value.trim() || 'http://localhost:8080').replace(/\/+$/, '');
    this.baseUrl.set(clean);
    this.persistPrefs(this.status() === 'connected');
  }

  /**
   * Quiet start-up sync: only when the persisted flag says we were
   * connected before. Returns true when the fetch succeeded.
   */
  async refreshIfConnected(): Promise<boolean> {
    if (!this.prefs.connected) {
      return false;
    }
    try {
      await this.call('/transactions');
      await this.call('/settings');
      this.setStatus('connected');
      return true;
    } catch (err) {
      // Keep the flag; the device cache remains authoritative meanwhile.
      this.setStatus('error', `Backend unreachable at start — using device cache. ${this.describeError(err)}`);
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Reads (used for adopt-on-connect / start-up sync)
  // ------------------------------------------------------------------

  fetchTransactions(): Promise<Transaction[]> {
    return this.call<Transaction[]>('/transactions');
  }

  fetchSettingsSettings(): Promise<SettingsPreferences | null> {
    return this.call<SettingsPreferences>('/settings');
  }

  // ------------------------------------------------------------------
  // Mirrors (fire-and-forget from the service layer)
  // ------------------------------------------------------------------

  create(tx: Transaction): Promise<Transaction> {
    return this.call<Transaction>('/transactions', {
      method: 'POST',
      body: tx,
    });
  }

  update(id: string, tx: Transaction): Promise<Transaction> {
    return this.call<Transaction>(`/transactions/${id}`, {
      method: 'PUT',
      body: tx,
    });
  }

  remove(id: string): Promise<void> {
    return this.call<void>(`/transactions/${id}`, { method: 'DELETE' });
  }

  clear(): Promise<{ cleared: number }> {
    return this.call<{ cleared: number }>('/transactions/clear', {
      method: 'DELETE',
    });
  }

  bulk(items: Transaction[], defaultCurrency?: string): Promise<{ count: number }> {
    const params = defaultCurrency
      ? `?defaultCurrency=${encodeURIComponent(defaultCurrency)}`
      : '';
    return this.call<{ count: number }>(`/transactions/bulk${params}`, {
      method: 'POST',
      body: items,
    });
  }

  seedDemo(): Promise<{ demoRecords: number }> {
    return this.call<{ demoRecords: number }>('/transactions/seed/demo', {
      method: 'POST',
      body: {},
    });
  }

  completePlanner(id: string): Promise<Transaction> {
    return this.call<Transaction>(`/transactions/${id}/complete`, {
      method: 'POST',
      body: {},
    });
  }

  reschedulePlanner(id: string, newDate: string): Promise<Transaction> {
    return this.call<Transaction>(`/transactions/${id}/reschedule`, {
      method: 'PUT',
      body: { newDate },
    });
  }

  saveSettings(prefs: SettingsPreferences): Promise<unknown> {
    return this.call('/settings', { method: 'PUT', body: prefs });
  }

  addCategory(type: TransactionType, name: string): Promise<unknown> {
    return this.call('/categories', { method: 'POST', body: { type, name } });
  }

  removeCategory(type: TransactionType, name: string): Promise<unknown> {
    return this.call(
      `/categories/${type}?name=${encodeURIComponent(name)}`,
      { method: 'DELETE' }
    );
  }

  // ------------------------------------------------------------------
  // Plumbing
  // ------------------------------------------------------------------

  private async call<T>(
    path: string,
    init?: { method?: string; body?: unknown }
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(this.base() + path, {
        method: init?.method ?? 'GET',
        signal: controller.signal,
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
      if (!response.ok) {
        const detail = await this.peekError(response);
        throw new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
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
      const data = (await response.json()) as { error?: string };
      return data.error ?? '';
    } catch {
      return '';
    }
  }

  private base(): string {
    return this.baseUrl().replace(/\/+$/, '') + '/api';
  }

  private describeError(err: unknown): string {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'timed out';
    }
    if (err instanceof TypeError) {
      return 'could not reach the URL (is the backend running?)';
    }
    return err instanceof Error ? err.message : String(err);
  }

  private setStatus(status: BackendStatus, message?: string): void {
    this.status.set(status);
    if (message !== undefined) {
      this.message.set(message);
    }
  }

  private persistPrefs(connected: boolean): void {
    const prefs = { connected, baseUrl: this.baseUrl() };
    localStorage.setItem(this.prefsKey, JSON.stringify(prefs));
  }

  private loadPrefs(): BackendPrefs {
    try {
      const saved = localStorage.getItem(this.prefsKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BackendPrefs>;
        return {
          connected: parsed.connected === true,
          baseUrl:
            typeof parsed.baseUrl === 'string' && parsed.baseUrl
              ? parsed.baseUrl
              : 'http://localhost:8080',
        };
      }
    } catch {
      /* fall through */
    }
    return { connected: false, baseUrl: 'http://localhost:8080' };
  }
}
