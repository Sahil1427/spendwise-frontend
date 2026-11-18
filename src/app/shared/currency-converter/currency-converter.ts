import {
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../icon/icon';
import { SettingsService } from '../../services/settings.service';
import { CurrencyConvertService } from '../../services/currency-convert.service';

/**
 * Global currency converter pop-up (topbar "Convert" button).
 *
 * Amount + "from" (defaults to the active currency) + "to" (a dropdown of
 * every supported currency) → converted value with an indicative rate line.
 * Zoneless: plain signals; result derives through computed().
 */
@Component({
  selector: 'app-currency-converter',
  imports: [FormsModule, Icon],
  templateUrl: './currency-converter.html',
  styleUrl: './currency-converter.scss',
})
export class CurrencyConverter {
  // (import path fixed below — kept on its own for clarity)
  private readonly settings = inject(SettingsService);
  private readonly convert = inject(CurrencyConvertService);

  readonly open = signal(false);
  readonly amountText = signal('1');
  /** Records are stamped in the active currency, so start from it. */
  readonly from = signal(this.settings.currency());
  /** Default target: the home country's currency (else USD for INR users). */
  readonly to = signal(
    this.home() !== this.settings.currency()
      ? this.home()
      : this.settings.currency() === 'USD'
        ? 'INR'
        : 'USD'
  );

  readonly currencyOptions: { code: string; label: string }[] =
    this.convert.supported.map(code => ({
      code,
      label: `${this.settings.symbolFor(code)} ${code}`,
    }));

  private home(): string {
    return this.convert.homeCurrency();
  }

  private amountNum(): number {
    const n = Number(this.amountText());
    return Number.isFinite(n) ? n : 0;
  }

  readonly resultText = computed(() =>
    this.convert.valueText(
      this.convert.convert(this.amountNum(), this.from(), this.to()),
      this.to()
    )
  );

  readonly rateHint = computed(() =>
    this.from() === this.to()
      ? `Same currency on both sides.`
      : this.convert.rateLine(this.from(), this.to())
  );

  /** "Live market rates · updated …" / cached / bundle — always honest. */
  readonly sourceLabel = computed(() => this.convert.sourceLabel());

  openDialog(): void {
    // Nudge the daily refresh when the user actually cares (they opened
    // the pop-up). The shell already attempts it at start-up.
    void this.convert.ensureFresh();
    this.open.set(true);
  }

  closeDialog(): void {
    this.open.set(false);
  }

  swap(): void {
    const a = this.from();
    this.from.set(this.to());
    this.to.set(a);
  }

  /** ngModelChange setters (the template compiler rejects signal(value) as a call). */
  setAmount(value: string): void {
    this.amountText.set(String(value ?? ''));
  }

  setFrom(value: string): void {
    this.from.set(value);
  }

  setTo(value: string): void {
    this.to.set(value);
  }

  /** Backdrop click closes; clicks inside the card do not. */
  onBackdrop(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.cv-card')) {
      this.closeDialog();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDialog();
  }
}
