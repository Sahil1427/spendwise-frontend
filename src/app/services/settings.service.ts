import { Injectable, computed, signal } from '@angular/core';

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
  currency: string;
}

export interface SettingsPreferences {
  country: string;
  currency: string;
  /** Monthly saving target ("savings cap"); null when unset. */
  savingCap: number | null;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private static readonly SETTINGS_KEY = 'spendwise-settings';

  static readonly COUNTRIES: CountryOption[] = [
    { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'INR' },
    { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
    { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
    { code: 'EU', name: 'Euro Area', flag: '🇪🇺', currency: 'EUR' },
    { code: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'SGD' },
    { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', currency: 'AED' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'AUD' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦', currency: 'CAD' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵', currency: 'JPY' },
    { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', currency: 'BDT' },
    { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', currency: 'LKR' },
    { code: 'PK', name: 'Pakistan', flag: '🇵🇰', currency: 'PKR' },
    { code: 'MY', name: 'Malaysia', flag: '🇲🇾', currency: 'MYR' },
    { code: 'TH', name: 'Thailand', flag: '🇹🇭', currency: 'THB' },
    { code: 'PH', name: 'Philippines', flag: '🇵🇭', currency: 'PHP' },
    { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', currency: 'NZD' },
    { code: 'ZA', name: 'South Africa', flag: '🇿🇦', currency: 'ZAR' },
    { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', currency: 'SAR' },
  ];

  static readonly CURRENCIES: string[] = [
    'INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'CAD', 'JPY',
    'BDT', 'LKR', 'PKR', 'MYR', 'THB', 'PHP', 'NZD', 'ZAR', 'SAR',
    'CHF', 'CNY', 'KRW', 'VND',
  ];

  private readonly preferences = signal<SettingsPreferences>(this.load());

  readonly currency = computed(() => this.preferences().currency);
  readonly country = computed(() => this.preferences().country);
  readonly savingCap = computed(() => this.preferences().savingCap);

  private static defaultForCountry(code: string): string {
    const match = SettingsService.COUNTRIES.find(
      item => item.code === code
    );
    return match ? match.currency : 'INR';
  }

  private load(): SettingsPreferences {
    const fallback: SettingsPreferences = {
      country: 'IN',
      currency: 'INR',
      savingCap: null,
    };

    try {
      const saved = localStorage.getItem(SettingsService.SETTINGS_KEY);
      if (!saved) return fallback;

      const parsed = JSON.parse(saved) as Partial<SettingsPreferences>;
      const country =
        typeof parsed.country === 'string' && parsed.country
          ? parsed.country
          : 'IN';
      const currency =
        typeof parsed.currency === 'string' && parsed.currency
          ? parsed.currency.toUpperCase()
          : SettingsService.defaultForCountry(country);
      const savingCap =
        typeof parsed.savingCap === 'number' &&
        Number.isFinite(parsed.savingCap) &&
        parsed.savingCap > 0
          ? parsed.savingCap
          : null;

      return { country, currency, savingCap };
    } catch {
      return fallback;
    }
  }

  private persist(): void {
    localStorage.setItem(
      SettingsService.SETTINGS_KEY,
      JSON.stringify(this.preferences())
    );
  }

  // Choosing a country applies its default currency. Existing
  // transactions are never touched; only new records are affected.
  setCountry(code: string): void {
    this.preferences.update(current => ({
      ...current,
      country: code,
      currency: SettingsService.defaultForCountry(code),
    }));

    this.persist();
  }

  setCurrency(code: string): void {
    const clean = code.toUpperCase();

    this.preferences.update(current => ({
      ...current,
      currency: clean,
    }));

    this.persist();
  }

  /** Monthly saving target; pass null to clear it. */
  setSavingCap(value: number | null): void {
    this.preferences.update(current => ({
      ...current,
      savingCap: value,
    }));

    this.persist();
  }

  countryOption(code: string): CountryOption {
    return (
      SettingsService.COUNTRIES.find(item => item.code === code) ??
      SettingsService.COUNTRIES[0]
    );
  }

  symbolFor(code: string): string {
    try {
      const parts = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: code,
      }).formatToParts(1);

      return (
        parts.find(part => part.type === 'currency')?.value ?? code
      );
    } catch {
      return code;
    }
  }

  formatAmount(amount: number, currency?: string): string {
    const code = (currency ?? this.preferences().currency).toUpperCase();

    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: code,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${code} ${Math.round(amount).toLocaleString('en-IN')}`;
    }
  }
}
