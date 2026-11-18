import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthSelector } from '../../../shared/month-selector/month-selector';
import { Icon } from '../../../shared/icon/icon';
import { FileImport } from '../../../shared/file-import/file-import';
import {
  TransactionService,
} from '../../../services/transaction.service';
import { SettingsService } from '../../../services/settings.service';
import { MonthSelectionService } from '../../../services/month-selection.service';
import { AuthService } from '../../../services/auth.service';

/**
 * Dashboard — the user-friendly homepage, strictly month-wise.
 *
 * Shows everything about the shared selected month (summary cards,
 * a true pie chart of spending, recent records) plus the 12-month
 * money comparison for the whole current year.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MonthSelector, Icon, FileImport],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly transactionService = inject(TransactionService);
  private readonly settingsService = inject(SettingsService);
  private readonly authService = inject(AuthService);
  readonly monthSelection = inject(MonthSelectionService);

  /** Income / Expenses card popup state. */
  readonly listView = signal<'income' | 'expense' | null>(null);

  openList(kind: 'income' | 'expense'): void {
    this.listView.set(kind);
  }

  closeList(): void {
    this.listView.set(null);
  }

  /** “Import records” dialog state (CSV / Excel / PDF / image files). */
  readonly importOpen = signal(false);
  readonly importFlash = signal('');
  private importFlashTimer: number | null = null;

  openImport(): void {
    this.importOpen.set(true);
  }

  onImported(payload: { count: number; month: string }): void {
    // Jump the whole app onto the month the client records landed in, so
    // the user immediately sees them on the dashboard.
    this.monthSelection.setMonth(payload.month);
    this.importOpen.set(false);
    this.importFlash.set(
      `${payload.count} record${payload.count === 1 ? '' : 's'} imported into ${this.monthSelection.selectedLabel()}.`
    );
    if (this.importFlashTimer !== null) {
      window.clearTimeout(this.importFlashTimer);
    }
    this.importFlashTimer = window.setTimeout(
      () => this.importFlash.set(''),
      3400
    );
  }

  readonly listRows = computed(() => {
    const kind = this.listView();
    if (!kind) {
      return [] as {
        name: string;
        category: string;
        date: string;
        amount: string;
        currency?: string;
      }[];
    }

    return this.monthTransactions()
      .filter(item => item.type === kind)
      .map(item => ({
        name:
          item.name?.trim() ||
          item.description?.trim() ||
          (kind === 'income' ? 'Income record' : 'Expense record'),
        category: item.category,
        date: new Intl.DateTimeFormat('en-IN', {
          day: '2-digit',
          month: 'short',
        }).format(new Date(`${item.date}T00:00:00`)),
        amount: this.formatAmount(item.amount, kind, item.currency),
        currency: item.currency,
      }));
  });

  listKindLabel(): string {
    return this.listView() === 'income' ? 'Income' : 'Expenses';
  }

  /** Active settings currency — foreign records show a small chip. */
  get activeCurrencyCode(): string {
    return this.settingsService.currency();
  }

  listTotalLabel(): string {
    return this.listView() === 'income'
      ? this.money(this.incomeTotal())
      : this.money(this.expenseTotal());
  }

  readonly monthTransactions = computed(() => {
    const prefix = this.monthSelection.prefix();

    return this.transactionService
      .transactions()
      .filter(item => item.date.startsWith(prefix))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly incomeTotal = computed(
    () =>
      this.monthTransactions()
        .filter(item => item.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0)
  );

  readonly expenseTotal = computed(
    () =>
      this.monthTransactions()
        .filter(item => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0)
  );

  readonly netTotal = computed(
    () => this.incomeTotal() - this.expenseTotal()
  );

  readonly savingsRate = computed(() =>
    this.incomeTotal() > 0
      ? ((this.netTotal() / this.incomeTotal()) * 100).toFixed(1)
      : '0.0'
  );

  readonly recordCount = computed(() => this.monthTransactions().length);

  readonly summaryCards = computed(() => {
    const incomeCount = this.monthTransactions()
      .filter(i => i.type === 'income')
      .length;
    const expenseCount = this.monthTransactions()
      .filter(i => i.type === 'expense')
      .length;
    const cap = this.settingsService.savingCap();
    const net = this.netTotal();

    return [
      {
        label: 'Net balance',
        value: this.money(net),
        tone: net >= 0 ? 'neutral' : 'negative',
        icon: 'wallet',
        caption: this.monthSelection.selectedLabel(),
      },
      {
        label: 'Income',
        value: this.money(this.incomeTotal()),
        tone: 'positive',
        icon: 'trending-up',
        caption: `${incomeCount} record${incomeCount === 1 ? '' : 's'} · tap to view`,
        clickable: 'income' as const,
      },
      {
        label: 'Expenses',
        value: this.money(this.expenseTotal()),
        tone: 'negative',
        icon: 'trending-down',
        caption: `${expenseCount} record${expenseCount === 1 ? '' : 's'} · tap to view`,
        clickable: 'expense' as const,
      },
      {
        label: 'Savings rate',
        value: `${this.savingsRate()}%`,
        tone: 'neutral',
        icon: 'percent',
        caption: 'Kept of total income',
      },
      {
        label: 'Savings cap',
        value: cap ? this.money(Math.max(0, net)) : '—',
        tone: cap && net < 0 ? 'negative' : 'neutral',
        icon: 'target',
        caption: cap
          ? net >= cap
            ? `Cap of ${this.money(cap)} reached ✓`
            : `${this.money(Math.max(0, cap - net))} left of ${this.money(cap)}`
          : 'Set a monthly cap in Settings',
        progress:
          cap && net > 0 ? Math.min(100, (net / cap) * 100) : cap ? 0 : undefined,
      },
    ];
  });

  /** Green/red monthly status — positive or negative for the month. */
  readonly financeStatus = computed(() => {
    const net = this.netTotal();
    const month = this.monthSelection.selectedLabel();

    return net >= 0
      ? {
          positive: true,
          title: 'Positive',
          text: `You saved ${this.money(
            net
          )} in ${month} — income covered every expense.`,
        }
      : {
          positive: false,
          title: 'Negative',
          text: `Spending ran ${this.money(
            -net
          )} ahead of income in ${month}. Check Reports to see where.`,
        };
  });

  private static readonly PALETTE = [
    '#7568e8', '#48b9a1', '#f2a65a', '#5b9bea', '#df83b5',
    '#8b9aa8', '#53cba0', '#a396ff',
  ];

  /** Index of the pie slice under the cursor (or over the legend). */
  readonly pieActive = signal<number | null>(null);

  /** Colour a hex slice n% toward white — used for the lit hover state. */
  private static lighten(hex: string, t: number): string {
    const m = hex.replace('#', '');
    const n = parseInt(m, 16);
    if (m.length !== 6 || Number.isNaN(n)) {
      return hex;
    }
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const mix = (c: number) => Math.round(c + (255 - c) * t);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }

  /** Gradients with the hovered slice lit white (or plain when none). */
  readonly pieStyle = computed(() => {
    const { slices } = this.spendSlices();
    const active = this.pieActive();
    if (slices.length === 0) {
      return '';
    }
    const parts: string[] = [];
    slices.forEach((slice, index) => {
      const color = active === index
        ? Dashboard.lighten(slice.color, 0.22)
        : slice.color;
      parts.push(
        `${color} ${slice.fromPct.toFixed(2)}% ${slice.toPct.toFixed(2)}%`
      );
    });
    return `conic-gradient(${parts.join(', ')})`;
  });

  /** The slice being pointed at — drives the centre "what am I on?" readout. */
  readonly pieFocus = computed(() => {
    const active = this.pieActive();
    if (active === null) {
      return null;
    }
    return this.spendSlices().slices[active] ?? null;
  });

  /**
   * Maps cursor position on the donut to a slice index. The donut is a
   * pure CSS conic-gradient (no per-slice DOM), so the geometry is done
   * here: 0° is 12 o'clock, clockwise — the same space conic-gradient
   * uses. The hole (inset 27%) is dead space.
   */
  onPieMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement | null;
    const slices = this.spendSlices().slices;
    if (!el || slices.length === 0) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const radius = rect.width / 2;
    // Ring bounds: skip the centre hole (0.46 of the radius) and outside.
    if (dist > radius || dist < radius * 0.46) {
      this.pieActive.set(null);
      return;
    }
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const pct = ((deg + 360) % 360) / 3.6;
    const index = slices.findIndex(
      slice => pct >= slice.fromPct && pct < slice.toPct
    );
    this.pieActive.set(index);
  }

  onPieLeave(): void {
    this.pieActive.set(null);
  }

  /** Legend row hover mirrors the donut (bidirectional sync). */
  setPieActive(index: number | null): void {
    this.pieActive.set(index);
  }

  /** Pie slices for spending breakdown of the selected month. */
  readonly spendSlices = computed(() => {
    const totals = new Map<string, number>();

    this.monthTransactions()
      .filter(item => item.type === 'expense')
      .forEach(item =>
        totals.set(item.category, (totals.get(item.category) || 0) + item.amount)
      );

    const total = this.expenseTotal();
    const colors = Dashboard.PALETTE;

    const entries = Array.from(totals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const sliceList: {
      name: string;
      share: string;
      amount: string;
      color: string;
      fromPct: number;
      toPct: number;
    }[] = [];

    let cursor = 0;
    let gradient: string[] = [];

    entries.forEach((entry, index) => {
      const span = total > 0 ? (entry.amount / total) * 100 : 0;
      const from = cursor;
      const to = cursor + span;

      gradient.push(
        `${colors[index % colors.length]} ${from.toFixed(2)}% ${to.toFixed(2)}%`
      );

      sliceList.push({
        name: entry.name,
        share: `${span.toFixed(1)}%`,
        amount: this.money(entry.amount),
        color: colors[index % colors.length],
        fromPct: from,
        toPct: to,
      });

      cursor = to;
    });

    return {
      gradient:
        gradient.length > 0 ? `conic-gradient(${gradient.join(', ')})` : '',
      slices: sliceList,
    };
  });

  /** Money comparison across all twelve months of the current year. */
  readonly yearTrend = computed(() => {
    const all = this.transactionService.transactions();
    const width = this.monthSelection.currentYear;

    const months = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      const prefix = `${width}-${month}`;
      const inMonth = all.filter(item => item.date.startsWith(prefix));

      return {
        month,
        label: new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(
          new Date(width, index, 1)
        ),
        income: inMonth
          .filter(item => item.type === 'income')
          .reduce((sum, item) => sum + item.amount, 0),
        expense: inMonth
          .filter(item => item.type === 'expense')
          .reduce((sum, item) => sum + item.amount, 0),
      };
    });

    const max = Math.max(
      1,
      ...months.flatMap(item => [item.income, item.expense])
    );

    return months.map(item => ({
      ...item,
      incomeHeight: (item.income / max) * 100,
      expenseHeight: (item.expense / max) * 100,
      hasData: item.income > 0 || item.expense > 0,
      selected: item.month === this.monthSelection.selectedMonth(),
      incomeValue: this.money(item.income),
      expenseValue: this.money(item.expense),
    }));
  });

  readonly recent = computed(() =>
    this.monthTransactions().slice(0, 5).map(item => ({
      name:
        item.description?.trim() ||
        item.name?.trim() ||
        (item.type === 'income' ? 'Income' : 'Expense'),
      category: item.category,
      date: new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
      }).format(new Date(`${item.date}T00:00:00`)),
      amount: this.formatAmount(item.amount, item.type, item.currency),
      currency: item.currency,
      type: item.type,
      icon: item.type === 'income' ? 'trending-up' : 'trending-down',
    }))
  );

  greeting(): string {
    const hour = new Date().getHours();
    const part =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const name = this.authService.displayName() || 'there';

    return `Good ${part}, ${name} \u{1F44B}`;
  }

  money(amount: number): string {
    return this.settingsService.formatAmount(amount);
  }

  formatAmount(
    amount: number,
    type: 'income' | 'expense',
    currency?: string
  ): string {
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency ?? this.settingsService.currency(),
      maximumFractionDigits: 2,
    }).format(amount);

    return `${type === 'income' ? '+' : '-'}${formatted}`;
  }
}
