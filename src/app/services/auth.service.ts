import { Injectable, computed, signal } from '@angular/core';
import { MonthSelectionService } from './month-selection.service';

/** A single account that may sign in. */
interface UserRecord {
  /** Canonical lowercase key. */
  username: string;
  password: string;
  /** Friendly name shown across the app. */
  displayName: string;
  role: 'admin' | 'user';
}

/**
 * Client-side auth for this demo build.
 *
 * Accounts live in localStorage (`spendwise-users`). Two always exist:
 * the original `sahil / pass123` demo user, and `admin / admin` — the
 * admin can add further users (Settings → Users), each of which can then
 * sign in with its own username and password. The signed-in session is
 * remembered in localStorage so a page reload keeps the user signed in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly USER_KEY = 'spendwise-user';
  private static readonly USERS_KEY = 'spendwise-users';

  /** Every login snaps the app onto the CURRENT month. */
  constructor(private readonly months: MonthSelectionService) {}

  /** Accounts that always exist, whatever is stored locally. */
  private static readonly BUILTIN: Record<string, UserRecord> = {
    sahil: {
      username: 'sahil',
      password: 'pass123',
      displayName: 'Sahil',
      role: 'user',
    },
    admin: {
      username: 'admin',
      password: 'admin',
      displayName: 'Admin',
      role: 'admin',
    },
  };

  private readonly currentUsername = signal<string | null>(this.loadSession());

  readonly isAuthenticated = computed(() => this.currentUsername() !== null);
  readonly isAdmin = computed(() => this.currentRole() === 'admin');

  /** Bump whenever the stored user list changes (drives the admin's list). */
  private readonly usersVersion = signal(0);

  /** Friendly name of the signed-in user ("" when signed out). */
  readonly displayName = computed(() => {
    const key = this.currentUsername();
    if (!key) {
      return '';
    }
    return this.recordFor(key)?.displayName ?? AuthService.prettify(key);
  });

  /** Every user the admin has added (for the Users panel). */
  readonly userList = computed(() => {
    void this.usersVersion();
    return Object.values(this.loadUsers());
  });

  login(username: string, password: string): boolean {
    const key = username.trim().toLowerCase();
    const rec = this.recordFor(key);
    const ok = !!rec && rec.password === password;

    if (ok) {
      this.currentUsername.set(key);
      localStorage.setItem(AuthService.USER_KEY, key);
      // Always open on the running month, whatever was persisted before.
      this.months.resetToCurrentMonth();
    }

    return ok;
  }

  /**
   * Add a user who can then sign in on this device. Meant for the signed-in
   * admin; returns whether it succeeded plus a reason on failure.
   */
  addUser(
    username: string,
    password: string,
    displayName?: string
  ): { ok: boolean; error?: string } {
    const key = username.trim().toLowerCase();
    if (!key) {
      return { ok: false, error: 'Enter a username.' };
    }
    if (!/^[a-z0-9._-]+$/.test(key)) {
      return {
        ok: false,
        error: 'Use letters, numbers, dots, dashes or underscores.',
      };
    }
    if (password.length < 4) {
      return { ok: false, error: 'Password must be at least 4 characters.' };
    }
    if (this.recordFor(key)) {
      return { ok: false, error: 'That username already exists.' };
    }

    const record: UserRecord = {
      username: key,
      password,
      displayName: displayName?.trim() || AuthService.prettify(key),
      role: 'user',
    };

    const users = this.loadUsers();
    users[key] = record;
    try {
      localStorage.setItem(AuthService.USERS_KEY, JSON.stringify(users));
    } catch {
      // Storage unavailable (e.g. private mode) — still usable this session.
    }
    this.usersVersion.update((v) => v + 1);
    return { ok: true };
  }

  logout(): void {
    this.currentUsername.set(null);
    localStorage.removeItem(AuthService.USER_KEY);
  }

  private currentRole(): UserRecord['role'] {
    const key = this.currentUsername();
    if (!key) {
      return 'user';
    }
    return this.recordFor(key)?.role ?? 'user';
  }

  private loadSession(): string | null {
    try {
      const saved = localStorage.getItem(AuthService.USER_KEY);
      return typeof saved === 'string' && saved ? saved : null;
    } catch {
      return null;
    }
  }

  private recordFor(key: string): UserRecord | undefined {
    return AuthService.BUILTIN[key] ?? this.loadUsers()[key];
  }

  private loadUsers(): Record<string, UserRecord> {
    try {
      const raw = localStorage.getItem(AuthService.USERS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, UserRecord>)
        : {};
    } catch {
      return {};
    }
  }

  /** "john_doe" -> "John Doe" style pretty display name. */
  static prettify(raw: string): string {
    return raw
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
