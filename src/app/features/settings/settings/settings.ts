import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CountryOption,
  SettingsService,
} from '../../../services/settings.service';
import { TransactionService } from '../../../services/transaction.service';
import { AssistantService } from '../../../services/assistant.service';
import { Icon } from '../../../shared/icon/icon';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon],
  styleUrl: './settings.scss',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly settingsService = inject(SettingsService);
  private readonly transactions = inject(TransactionService);

  /** Draft fields + save/clear actions for the AI assistant panel. */
  readonly assistant = inject(AssistantService);
  readonly aiSaved = signal(false);

  /** Live record count on this device (for the Local data panel). */
  readonly recordCount = computed(() => this.transactions.transactions().length);

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

  /** Flash shown right after loading the demo dataset (zoneless: signal,
   * not a plain field, because the timeout resolves outside any user event). */
  readonly demoLoaded = signal(false);

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

  /** Replace all records with the bundled Jan–Nov 2026 demo dataset. */
  loadDemoData(): void {
    this.transactions.loadDemoData();
    this.demoLoaded.set(true);
    setTimeout(() => this.demoLoaded.set(false), 2200);
  }

  saveAiSettings(): void {
    this.assistant.saveFromDrafts();
    this.aiSaved.set(true);
    setTimeout(() => this.aiSaved.set(false), 2200);
  }

  removeAiKey(): void {
    this.assistant.clearKey();
  }

  /** Wipe every record after an explicit confirm (presentation reset). */
  clearAllRecords(): void {
    if (this.recordCount() === 0) {
      return;
    }
    const ok = window.confirm(
      `Delete all ${this.recordCount()} records on this device?\nSettings and the savings cap are kept.`
    );
    if (ok) {
      this.transactions.clearDemoData();
    }
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
