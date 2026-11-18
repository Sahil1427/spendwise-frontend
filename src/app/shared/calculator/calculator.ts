import {
  Component,
  HostListener,
  signal,
} from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * The little on-demand calculator that hangs off the topbar "calc" button.
 *
 * Classic immediate-execution arithmetic: one accumulator, four operators,
 * percent and sign toggle. No expression history — the point is a two-second
 * mental check, not a spreadsheet.
 */
@Component({
  selector: 'app-calculator',
  imports: [Icon],
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
})
export class Calculator {
  readonly open = signal(false);
  readonly display = signal('0');
  readonly exprText = signal('');
  /** Which operator key is held pending (for the pressed-key highlight). */
  readonly pendingOp = signal('');

  private acc: number | null = null;
  private op: '÷' | '×' | '−' | '+' | null = null;
  /** Display is showing the accumulator, awaiting a right-operand. */
  private waiting = false;
  /** After '=': the next digit starts a brand-new number. */
  private fresh = false;

  // ------------------------------------------------------------ lifecycle

  /** Opens the pop-up; the topbar button (app-layout) calls this. */
  openDialog(): void {
    this.open.set(true);
  }

  closeDialog(): void {
    this.open.set(false);
    this.hardReset();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDialog();
  }

  /** Backdrop click (the pop-up itself stops propagation in the DOM). */
  onBackdrop(event: MouseEvent): void {
    if (!(event.target as HTMLElement).closest('.calc-pop')) {
      this.closeDialog();
    }
  }

  // --------------------------------------------------------------- keys

  digit(d: string): void {
    if (this.fresh) {
      this.hardReset();
    }
    if (this.waiting) {
      this.waiting = false;
      this.display.set(d === '.' ? '0.' : d);
      return;
    }

    const text = this.display();

    if (d === '.') {
      if (!text.includes('.')) {
        this.display.set(text === '0' ? '0.' : `${text}.`);
      }
      return;
    }

    if (text.replace(/-/g, '').length >= 12) {
      return; // plenty of precision for a quick check
    }
    this.display.set(text === '0' ? d : text + d);
  }

  clear(): void {
    this.hardReset();
  }

  hardReset(): void {
    this.acc = null;
    this.op = null;
    this.waiting = false;
    this.fresh = false;
    this.display.set('0');
    this.exprText.set('');
    this.pendingOp.set('');
  }

  back(): void {
    if (this.waiting || this.fresh) {
      return;
    }
    const text = this.display();
    const next = text.length > 1 ? text.slice(0, -1) : '';
    this.display.set(next === '-' || next === '' ? '0' : next);
  }

  toggleSign(): void {
    const text = this.display();
    if (text === '0' || !/^-?[\d.]/.test(text)) {
      return;
    }
    this.display.set(text.startsWith('-') ? text.slice(1) : `-${text}`);
  }

  percent(): void {
    const v = this.parse();
    const result =
      this.acc !== null && this.op ? (this.acc * v) / 100 : v / 100;
    this.acc = null;
    this.op = null;
    this.pendingOp.set('');
    this.exprText.set(`${this.fmt(v)} %`);
    this.display.set(this.fmt(result));
    this.waiting = true;
  }

  operator(next: '÷' | '×' | '−' | '+'): void {
    const v = this.parse();

    if (this.waiting) {
      // Chained operators just swap the pending one out.
      this.op = next;
      this.pendingOp.set(next);
      this.exprText.set(
        this.acc !== null ? `${this.fmt(this.acc)} ${next}` : ''
      );
      return;
    }

    if (this.op && this.acc !== null) {
      const result = this.apply(this.op, this.acc, v);
      if (result === null) {
        return; // "cannot divide by zero" already displayed
      }
      this.acc = result;
      this.display.set(this.fmt(result));
    } else {
      this.acc = v;
    }

    this.op = next;
    this.waiting = true;
    this.pendingOp.set(next);
    this.exprText.set(`${this.display()} ${next}`);
  }

  equals(): void {
    if (!this.op || this.acc === null) {
      return;
    }
    const op = this.op;
    const a = this.acc;
    const v = this.parse();
    const result = this.apply(op, a, v);
    if (result === null) {
      return;
    }
    this.hardReset();
    this.exprText.set(`${this.fmt(a)} ${op} ${this.fmt(v)} =`);
    this.display.set(this.fmt(result));
    this.fresh = true;
  }

  // ------------------------------------------------------------- engine

  private parse(): number {
    return parseFloat(this.display().replace(/,/g, '')) || 0;
  }

  /** Apply an operator; null signals "cannot divide by zero" (shown). */
  private apply(
    op: '÷' | '×' | '−' | '+',
    a: number,
    b: number
  ): number | null {
    switch (op) {
      case '÷':
        if (b === 0) {
          this.hardReset();
          this.display.set('÷0');
          this.exprText.set('Cannot divide by zero');
          return null;
        }
        return a / b;
      case '×':
        return a * b;
      case '−':
        return a - b;
      default:
        return a + b;
    }
  }

  private fmt(n: number): string {
    if (!Number.isFinite(n)) {
      return 'Error';
    }
    const rounded = Math.round(n * 1e10) / 1e10;
    return rounded.toLocaleString('en-IN', { maximumFractionDigits: 10 });
  }
}
