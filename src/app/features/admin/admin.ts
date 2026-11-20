import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, UserRecord } from '../../services/auth.service';
import { Icon } from '../../shared/icon/icon';

/**
 * Admin Console — standalone page reached at /admin (adminGuard).
 *
 * Professional console layout: sidebar + header + stat cards + a
 * "New / Edit user" panel beside a searchable user table.
 * The admin does not see the spending app.
 */
@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, Icon],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  private readonly auth = inject(AuthService);

  /** null = "New user" mode; a username = editing that account. */
  readonly editingUser = signal<string | null>(null);
  username = '';
  password = '';
  displayName = '';
  readonly formFlash = signal<{ ok: boolean; msg: string }>({
    ok: false,
    msg: '',
  });

  readonly search = signal('');

  private flashTimer: number | null = null;

  // ── Derived lists / stats ─────────────────────────────────────────
  filteredUsers = computed(() => {
    const q = this.search().trim().toLowerCase();
    const all = this.auth.userList();
    return q
      ? all.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            u.displayName.toLowerCase().includes(q)
        )
      : all;
  });

  totalUsers = computed(() => this.auth.userList().length);

  adminCount = computed(
    () => this.auth.userList().filter((u) => u.role === 'admin').length
  );

  regularCount = computed(
    () => this.totalUsers() - this.adminCount()
  );

  isEdit = computed(() => this.editingUser() !== null);

  // ── Form actions ─────────────────────────────────────────────────
  startEdit(user: UserRecord): void {
    this.editingUser.set(user.username);
    this.username = user.username;
    // Blank = "keep current password" (legacy credentials may predate
    // the strength rules, so they are not re-validated when untouched).
    this.password = '';
    this.displayName = user.displayName;
    this.clearFlash();
  }

  resetForm(): void {
    this.editingUser.set(null);
    this.username = '';
    this.password = '';
    this.displayName = '';
    this.clearFlash();
  }

  submit(): void {
    if (this.isEdit()) {
      this.saveEdit();
      return;
    }

    if (!this.username.trim()) {
      this.flash('Enter a username first.', false);
      return;
    }

    const res = this.auth.addUser(
      this.username,
      this.password,
      this.displayName
    );
    if (res.ok) {
      this.flash(`“${this.username.trim()}” can sign in now.`, true);
      this.username = '';
      this.password = '';
      this.displayName = '';
    } else {
      this.flash(res.error ?? 'Could not add the user.', false);
    }
  }

  saveEdit(): void {
    const original = this.editingUser();
    if (!original) {
      return;
    }

    if (!this.username.trim()) {
      this.flash('Enter a username first.', false);
      return;
    }

    const res = this.auth.updateUser(
      this.username,
      this.password ? this.password : undefined,
      this.displayName
    );
    if (res.ok) {
      this.flash('Changes saved.', true);
      this.resetForm();
    } else {
      this.flash(res.error ?? 'Could not save changes.', false);
    }
  }

  removeUser(user: UserRecord): void {
    if (!window.confirm(`Delete user “${user.username}”? This cannot be undone.`)) {
      return;
    }
    const res = this.auth.deleteUser(user.username);
    if (!res.ok && res.error) {
      window.alert(res.error);
    }
  }

  signOut(): void {
    this.auth.logout();
    window.location.assign('/login');
  }

  // ── Helpers ────────────────────────────────────────────────────────
  private flash(msg: string, ok: boolean): void {
    this.formFlash.set({ ok, msg });
    if (this.flashTimer !== null) {
      window.clearTimeout(this.flashTimer);
    }
    this.flashTimer = window.setTimeout(() => this.clearFlash(), 4500);
  }

  private clearFlash(): void {
    this.formFlash.set({ ok: false, msg: '' });
  }
}
