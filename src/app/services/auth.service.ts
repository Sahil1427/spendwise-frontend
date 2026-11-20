import { Injectable, computed, signal } from '@angular/core';
import { MonthSelectionService } from './month-selection.service';

/** A single account that may sign in. */
export interface UserRecord {
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

  /** All users (built-in + added), in stable order. The admin page reads this. */
  readonly userList = computed(() => {
    void this.usersVersion();
    const stored = this.loadUsers();
    const keys = [
      ...Object.keys(AuthService.BUILTIN),
      ...Object.keys(stored).filter((k) => !(k in AuthService.BUILTIN)),
    ];
    return keys.map((k) => stored[k] ?? AuthService.BUILTIN[k]!);
  });

  /**
   * Per-user storage scope: the signed-in username, or "guest" when signed
   * out. Per-user data (transactions, settings) is namespaced under this so
   * two accounts on the same device never see each other's data.
   */
  dataScope(): string {
    return this.loadSession() ?? 'guest';
  }

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
    // Username has no character restrictions — only that it is unique.
    // Password: at least 5 characters, 1 capital, 1 number.
    if (password.length < 5) {
      return { ok: false, error: 'Password must be at least 5 characters.' };
    }
    if (!/[A-Z]/.test(password)) {
      return { ok: false, error: 'Password needs at least 1 capital letter.' };
    }
    if (!/[0-9]/.test(password)) {
      return { ok: false, error: 'Password needs at least 1 number.' };
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

  /**
   * Update an existing user's password or display name.
   * `newPassword` is optional — when omitted (or unchanged from the original)
   * the current password is kept and no validation is applied.
   */
  updateUser(
    username: string,
    newPassword?: string,
    displayName?: string
  ): { ok: boolean; error?: string } {
    const key = username.trim().toLowerCase();
    if (!key) return { ok: false, error: 'Enter a username.' };
    const existing = this.recordFor(key);
    if (!existing) return { ok: false, error: 'User not found.' };

    let pw = existing.password;
    if (newPassword !== undefined && newPassword !== '') {
      const pwErr = this.passwordError(newPassword);
      if (pwErr) return { ok: false, error: pwErr };
      pw = newPassword;
    }

    const users = this.loadUsers();
    users[key] = {
      ...existing,
      password: pw,
      displayName: displayName?.trim() || existing.displayName,
    };
    this.saveUsers(users);
    return { ok: true };
  }

  /** Delete a non-built-in user (sahil/admin cannot be removed). */
  deleteUser(username: string): { ok: boolean; error?: string } {
    const key = username.trim().toLowerCase();
    if (key in AuthService.BUILTIN) {
      return { ok: false, error: 'Built-in accounts cannot be deleted.' };
    }
    const users = this.loadUsers();
    if (!users[key]) return { ok: false, error: 'User not found.' };
    delete users[key];
    this.saveUsers(users);
    return { ok: true };
  }

  private passwordError(pw: string): string | null {
    if (pw.length < 5) return 'Password must be at least 5 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password needs at least 1 capital letter.';
    if (!/[0-9]/.test(pw)) return 'Password needs at least 1 number.';
    return null;
  }

  private saveUsers(users: Record<string, UserRecord>): void {
    try {
      localStorage.setItem(AuthService.USERS_KEY, JSON.stringify(users));
    } catch {
      /* storage unavailable */
    }
    this.usersVersion.update((v) => v + 1);
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
    return this.loadUsers()[key] ?? AuthService.BUILTIN[key];
  }

  /** True if the username is a built-in (sahil or admin) account. */
  isBuiltin(username: string): boolean {
    return username.trim().toLowerCase() in AuthService.BUILTIN;
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
