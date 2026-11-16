import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CountryOption,
  SettingsService,
} from '../../../services/settings.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  styleUrl: './settings.scss',
  templateUrl: './settings.html',
})
export class Settings {
  private readonly settingsService = inject(SettingsService);

  readonly countries: CountryOption[] = SettingsService.COUNTRIES;
  readonly currencies: string[] = SettingsService.CURRENCIES;

  readonly selectedCountry = this.settingsService.country;
  readonly selectedCurrency = this.settingsService.currency;

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
