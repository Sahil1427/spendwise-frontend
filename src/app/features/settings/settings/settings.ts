import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CountryOption,
  SettingsService,
} from '../../../services/settings.service';
import { Icon } from '../../../shared/icon/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon],
  styleUrl: './settings.scss',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly settingsService = inject(SettingsService);

  readonly countries: CountryOption[] = SettingsService.COUNTRIES;
  readonly currencies: string[] = SettingsService.CURRENCIES;

  readonly selectedCountry = this.settingsService.country;
  readonly selectedCurrency = this.settingsService.currency;
  readonly savingCap = this.settingsService.savingCap;

  /** Draft for the savings-cap input. A type="number" ngModel emits a
   * number, or null when cleared — so keep the union and coerce on save. */
  capDraft: string | number | null = this.settingsService.savingCap()
    ? String(this.settingsService.savingCap())
    : '';
  /** Signals: the saved-flash timeout resolves outside a user event, and
   * without zone-patched timers only a signal write re-renders the view. */
  readonly capError = signal('');
  readonly capSaved = signal(false);

  get capValueText(): string | null {
    return this.savingCap()
      ? this.settingsService.formatAmount(this.savingCap()!)
      : null;
  }

  private flashSaved(): void {
    this.capSaved.set(true);
    setTimeout(() => {
      this.capSaved.set(false);
    }, 2200);
  }

  saveCap(): void {
    const raw = String(this.capDraft ?? '').trim();

    if (raw === '') {
      this.settingsService.setSavingCap(null);
      this.capError.set('');
      this.flashSaved();
      return;
    }

    const value = Number(raw);

    if (!Number.isFinite(value) || value <= 0) {
      this.capError.set('Enter a positive amount, or remove it to clear the cap.');
      return;
    }

    this.settingsService.setSavingCap(value);
    this.capError.set('');
    this.flashSaved();
  }

  clearCap(): void {
    this.capDraft = '';
    this.settingsService.setSavingCap(null);
    this.capError.set('');
  }

  readonly countryName = computed(() =>
    this.settingsService.countryOption(this.selectedCountry()).name
  );

  readonly countryFlag = computed(() =>
    this.settingsService.countryOption(this.selectedCountry()).flag
  );

  readonly currencySymbol = computed(() =>
    this.settingsService.symbolFor(this.selectedCurrency())
  );

  // Existing records are never modified: only new transactions
  // use the currently selected currency.
  onCountryChange(code: string): void {
    this.settingsService.setCountry(code);
  }

  onCurrencyChange(code: string): void {
    this.settingsService.setCurrency(code);
  }
}
