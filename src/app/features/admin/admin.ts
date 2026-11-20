import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, UserRecord } from '../../services/auth.service';

/**
 * Standalone admin page — only the admin account can reach this route
 * (enforced by adminGuard in app.routes.ts).
 *
 * Shows the full user list with Add / Edit / Delete controls.
 * Admin never sees the spending app; sign-out returns to /login.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // ── Add-user form fields ────────────────────────────────────────────
  newUsername = '';
  newPassword = '';
  newDisplayName = '';
  readonly addFlash = signal<{ ok: boolean; msg: string }>({ ok: false, msg: '' });

  // ── Edit state ─────────────────────────────────────────────────────
  readonly editing = signal<string | null>(null);
  editDisplay = '';
  editPassword = '';
  private editOriginalPassword = '';
  readonly editFlash = signal<{ ok: boolean; msg: string }>({ ok: false, msg: '' });

  allUsers(): UserRecord[] {
    return this.auth.userList();
  }

  // ── Add user ─────────────────────────────────────────────────────────
  addUser(): void {
    if (!this.newUsername.trim()) {
      this.addFlash.set({ ok: false, msg: 'Username is required.' });
      return;
    }
    const uname = this.newUsername.trim();
    const res = this.auth.addUser(uname, this.newPassword, this.newDisplayName);
    if (res.ok) {
      this.addFlash.set({ ok: true, msg: `"${uname}" added — they can sign in now.` });
      this.newUsername = '';
      this.newPassword = '';
      this.newDisplayName = '';
      setTimeout(() => this.addFlash.set({ ok: false, msg: '' }), 4500);
    } else {
      this.addFlash.set({ ok: false, msg: res.error ?? 'Could not add user.' });
    }
  }

  // ── Edit user ────────────────────────────────────────────────────────
  startEdit(u: UserRecord): void {
    this.editing.set(u.username);
    this.editDisplay = u.displayName;
    this.editPassword = u.password;
    this.editOriginalPassword = u.password;
    this.editFlash.set({ ok: false, msg: '' });
  }

  saveEdit(): void {
    const uname = this.editing();
    if (!uname) return;

    // Only pass the password to the service if it was actually changed;
    // otherwise the original (which may not meet the 5-cap-num rules for
    // e.g. sahil/pass123) is preserved without re-validation.
    const pwChanged = this.editPassword !== this.editOriginalPassword;
    const res = this.auth.updateUser(uname, pwChanged ? this.editPassword : undefined, this.editDisplay);

    if (res.ok) {
      this.editFlash.set({ ok: true, msg: 'Saved.' });
      this.editing.set(null);
      setTimeout(() => this.editFlash.set({ ok: false, msg: '' }), 3500);
    } else {
      this.editFlash.set({ ok: false, msg: res.error ?? 'Could not save.' });
    }
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.editFlash.set({ ok: false, msg: '' });
  }

  // ── Delete user ──────────────────────────────────────────────────────
  removeUser(username: string): void {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    const res = this.auth.deleteUser(username);
    if (!res.ok && res.error) window.alert(res.error);
  }

  signOut(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
