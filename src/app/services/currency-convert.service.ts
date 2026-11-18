import { Injectable, inject, signal } from '@angular/core';
import { SettingsService } from './settings.service';

/**
 * Currency conversion with DAILY market refresh.
 *
 * Table layout: "1 unit of currency per 1 INR" (INR pivot because the app
 * defaults to India); conversion = amount / rate[from] * rate[to].
 *
 * Provenance ladder: LIVE (fetched once per local day from a free market
 * endpoint — ExchangeRate-API, no key; frankfurter.app as fallback)
 * → CACHED (last successful fetch, kept in localStorage so the app
 * still converts offline) → BUNDLED (Nov-2026 indicative table). The
 * UI always states which source is active (sourceLabel()).
 */

/** Bundled fallback, Nov-2026 indicative rates (1 foreign unit per 1 INR). */
const BUNDLED_RATES: Record<string, number> = {
  INR: 1,
  USD: 0.01202,
  EUR: 0.0111,
  GBP: 0.00961,
  SGD: 0.0162,
  AED: 0.04428,
  AUD: 0.01908,
  CAD: 0.01697,
  JPY: 1.919,
  BDT: 1.281,
  LKR: 37.95,
  PKR: 3.422,
  MYR: 0.05562,
  THB: 0.3929,
  PHP: 0.7905,
  NZD: 0.02035,
  ZAR: 0.2352,
  SAR: 0.04494,
  CHF: 0.01089,
  CNY: 0.08625,
  KRW: 16.9,
  VND: 305,
};

const BUNDLE_AS_OF = 'Nov 2026';
const CACHE_KEY = 'spendwise-rates';
const BASE_CODE = 'INR';
/** Primary: ExchangeRate-API v6 — no key, ~daily market updates, CORS-open. */
const PRIMARY_ENDPOINT = 'https://open.er-api.com/v6/latest';
/** Fallback: ECB-based daily rates via frankfurter.app — no key. */
const FALLBACK_ENDPOINT = 'https://api.frankfurter.app/v1/latest';

interface CachedRates {
  /** Local day (YYYY-MM-DD) the fetch happened — one refresh per day. */
  day: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CurrencyConvertService {
  private readonly settings = inject(SettingsService);

  /** Every currency the app can display (settings list). */
  readonly supported: readonly string[] = SettingsService.CURRENCIES;

  /** live = today's market fetch · cached = older fetch · bundle = bundled. */
  readonly source = signal<'live' | 'cached' | 'bundle'>('bundle');
  /** Human date the active table represents, e.g. "18 Nov 2026". */
  readonly asOf = signal(BUNDLE_AS_OF);

  /** One silent refresh attempt per local day. */
  private attemptedDay = '';
  private table: Record<string, number> = { ...BUNDLED_RATES };

  constructor() {
    // Synchronous: apply any existing cache so first paint is already
    // better than the bundle; the async refresh upgrades it if needed.
    const cached = this.readCache();
    if (cached) {
      this.applyTable(this.merge(cached.rates), this.formatDay(cached.day));
      this.source.set(cached.day === this.localDay() ? 'live' : 'cached');
    }
  }

  // ------------------------------------------------------------- public

  /**
   * Refresh to today's market rates. Safe to call often: at most one
   * attempt per local day, degrades silently (offline → cached → bundled).
   * Fire-and-forget — the UI re-renders through source/asOf signals.
   */
  async ensureFresh(): Promise<void> {
    const day = this.localDay();
    if (this.attemptedDay === day) {
      return;
    }
    this.attemptedDay = day;

    let table: Record<string, number> | null = null;

    try {
      const data = (await this.fetchJson(
        `${PRIMARY_ENDPOINT}/${BASE_CODE}`
      )) as { result?: string; rates?: Record<string, number> };
      if (data && data.result === 'success' && data.rates) {
        table = this.pickRates(data.rates);
      }
    } catch {
      // Fall through to the ECB-based fallback.
    }

    if (!table) {
      try {
        const data = (await this.fetchJson(
          `${FALLBACK_ENDPOINT}?base=${BASE_CODE}`
        )) as { base?: string; rates?: Record<string, number> };
        if (data && data.base === BASE_CODE && data.rates) {
          table = this.pickRates(data.rates);
        }
      } catch {
        // Offline — keep whatever table we already had.
      }
    }

    if (!table) {
      return;
    }

    this.applyTable(this.merge(table), this.formatDay(day));
    this.source.set('live');

    try {
      const cached: CachedRates = {
        day,
        rates: table,
        fetchedAt: new Date().toISOString(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch {
      // Storage unavailable — the session still has today's numbers.
    }
  }

  /**
   * Convert `amount` from one currency to another through the INR pivot.
   * Unknown codes fall back to the bundled table — a screen never crashes
   * over a missing rate.
   */
  convert(amount: number, from: string, to: string): number {
    if (!Number.isFinite(amount)) {
      return 0;
    }
    const f =
      this.table[from.toUpperCase()] ??
      BUNDLED_RATES[from.toUpperCase()] ??
      1;
    const t =
      this.table[to.toUpperCase()] ??
      BUNDLED_RATES[to.toUpperCase()] ??
      1;
    return (amount / (f || 1)) * (t || 1);
  }

  /** "1 USD = 83.19 INR" — the rate the result implied. */
  rateLine(from: string, to: string): string {
    const f = this.table[from.toUpperCase()] ?? BUNDLED_RATES[from.toUpperCase()] ?? 1;
    const t = this.table[to.toUpperCase()] ?? BUNDLED_RATES[to.toUpperCase()] ?? 1;
    const rate = t / f;
    const digits = rate >= 100 ? 2 : rate >= 1 ? 3 : 4;
    return `1 ${from.toUpperCase()} ≈ ${rate.toLocaleString('en-IN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })} ${to.toUpperCase()}`;
  }

  /**
   * Human value with adaptive precision: ₹8,320 · $0.0120 · ¥1,919.
   * Big numbers lose decimals; sub-unit keep 4 so "1 rupee in dollars"
   * stays meaningful (this is the popup's exact use case).
   */
  valueText(amount: number, code: string): string {
    if (!Number.isFinite(amount)) {
      return '—';
    }
    const sym = this.settings.symbolFor(code);
    const abs = Math.abs(amount);
    const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
    return `${sym}${amount.toLocaleString('en-IN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  }

  /** The currency of the country the user selected in Settings ("home"). */
  homeCurrency(): string {
    return this.settings.countryOption(this.settings.country()).currency;
  }

  /** One-line UI provenance — always honest about freshness. */
  sourceLabel(): string {
    switch (this.source()) {
      case 'live':
        return `Live market rates · updated ${this.asOf()}`;
      case 'cached':
        return `Market rates from ${this.asOf()} · device is offline, using the last fetched table`;
      default:
        return `Indicative bundled rates (${this.asOf()}) · market fetch unavailable`;
    }
  }

  // ----------------------------------------------------------- internal

  private localDay(): string {
    const now = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  private formatDay(yyyymmdd: string): string {
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    if (!y || !m || !d) {
      return yyyymmdd;
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[m - 1]} ${y}`;
  }

  /** Live numbers first; gaps back-filled from the bundle; INR is 1. */
  private merge(live: Record<string, number>): Record<string, number> {
    return { ...BUNDLED_RATES, ...live, INR: 1 };
  }

  private applyTable(table: Record<string, number>, asOf: string): void {
    this.table = table;
    this.asOf.set(asOf);
  }

  /** Keep sane, positive supported codes; null when the table is useless. */
  private pickRates(raw: Record<string, number>): Record<string, number> | null {
    const out: Record<string, number> = {};
    for (const code of this.supported) {
      const value = Number(raw[code]);
      if (Number.isFinite(value) && value > 0) {
        out[code] = value;
      }
    }
    return Object.keys(out).length >= 12 ? { ...out, INR: 1 } : null;
  }

  private readCache(): CachedRates | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as CachedRates;
      return typeof parsed.day === 'string' &&
        typeof parsed.rates === 'object' &&
        parsed.rates !== null
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}
