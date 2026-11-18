import { Injectable, computed, signal } from '@angular/core';
import { MonthSelectionService } from './month-selection.service';

/**
 * Client-side auth for this demo build.
 *
 * The single account is sahil / pass123; the session is remembered in
 * localStorage so a page reload keeps the user signed in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly USER_KEY = 'spendwise-user';

  /** Every login snaps the app onto the CURRENT month. */
  constructor(private readonly months: MonthSelectionService) {}

  /** Demo credentials for this build. */
  static readonly CREDENTIALS = {
    username: 'sahil',
    password: 'pass123',
  };

  private readonly user = signal<string | null>(this.loadUser());

  readonly isAuthenticated = computed(() => this.user() !== null);

  /** "sahil" -> "Sahil" for display. */
  readonly displayName = computed(() => {
    const raw = this.user();
    if (!raw) {
      return '';
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  });

  login(username: string, password: string): boolean {
    const ok =
      username.trim().toLowerCase() ===
        AuthService.CREDENTIALS.username.toLowerCase() &&
      password === AuthService.CREDENTIALS.password;

    if (ok) {
      const name = username.trim().toLowerCase();
      this.user.set(name);
      localStorage.setItem(AuthService.USER_KEY, name);
      // Always open on the running month, whatever was persisted before.
      this.months.resetToCurrentMonth();
    }

    return ok;
  }

  logout(): void {
    this.user.set(null);
    localStorage.removeItem(AuthService.USER_KEY);
  }

  private loadUser(): string | null {
    try {
      const saved = localStorage.getItem(AuthService.USER_KEY);
      return typeof saved === 'string' && saved ? saved : null;
    } catch {
      return null;
    }
  }
}
