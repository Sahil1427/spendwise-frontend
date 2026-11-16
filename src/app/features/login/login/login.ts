import {
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Icon } from '../../../shared/icon/icon';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private static readonly STAT_TARGET = 428000;
  private statRaf: number | null = null;

  username = '';
  password = '';

  /** Count-up figure shown in the brand pane (requestAnimationFrame, no zone needed). */
  readonly statValue = signal(0);

  get statText(): string {
    return this.statValue().toLocaleString('en-IN');
  }

  constructor() {
    this.destroyRef.onDestroy(() =>
      this.statRaf !== null ? cancelAnimationFrame(this.statRaf) : undefined
    );
    this.startCountUp();
  }

  private startCountUp(): void {
    const duration = 1900;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.statValue.set(Math.round(Login.STAT_TARGET * eased));
      if (t < 1) {
        this.statRaf = requestAnimationFrame(tick);
      }
    };
    this.statRaf = requestAnimationFrame(tick);
  }
  /**
   * Signals, not plain fields: the timeout below resolves outside any
   * user event, and without zone-patched timers only a signal write
   * reliably re-renders the view.
   */
  readonly error = signal('');
  readonly busy = signal(false);

  onSubmit(): void {
    if (this.busy()) {
      return;
    }

    if (!this.username.trim() || !this.password) {
      this.error.set('Enter both username and password.');
      return;
    }

    this.busy.set(true);

    // Tiny delay so the button gives perceptible feedback.
    setTimeout(() => {
      if (this.auth.login(this.username, this.password)) {
        this.router.navigate(['/dashboard']);
      } else {
        this.error.set('Invalid username or password.');
        this.busy.set(false);
      }
    }, 250);
  }
}
