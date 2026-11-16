import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MonthSelector } from '../../../shared/month-selector/month-selector';
import { Icon } from '../../../shared/icon/icon';
import {
  TransactionService,
  Transaction,
} from '../../../services/transaction.service';
import { SettingsService } from '../../../services/settings.service';
import { MonthSelectionService } from '../../../services/month-selection.service';

/**
 * Dashboard — the user-friendly homepage, strictly month-wise.
 *
 * Shows everything about the shared selected month (summary cards,
 * a true pie chart of spending, recent records) plus the 12-month
 * money comparison for the whole current year.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MonthSelector, Icon],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly transactionService = inject(TransactionService);
  private readonly settingsService = inject(SettingsService);
  readonly monthSelection = inject(MonthSelectionService);

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

  readonly summaryCards = computed(() => [
    {
      label: 'Net balance',
      value: this.money(this.netTotal()),
      tone: this.netTotal() >= 0 ? 'neutral' : 'negative',
      icon: 'wallet',
      caption: this.monthSelection.selectedLabel(),
    },
    {
      label: 'Income',
      value: this.money(this.incomeTotal()),
      tone: 'positive',
      icon: 'trending-up',
      caption: `${this.monthTransactions().filter(i => i.type === 'income').length} records`,
    },
    {
      label: 'Expenses',
      value: this.money(this.expenseTotal()),
      tone: 'negative',
      icon: 'trending-down',
      caption: `${this.monthTransactions().filter(i => i.type === 'expense').length} records`,
    },
    {
      label: 'Savings rate',
      value: `${this.savingsRate()}%`,
      tone: 'neutral',
      icon: 'percent',
      caption: 'Kept of total income',
    },
  ]);

  private static readonly PALETTE = [
    '#7568e8', '#48b9a1', '#f2a65a', '#5b9bea', '#df83b5',
    '#8b9aa8', '#53cba0', '#a396ff',
  ];

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

    return `Good ${part}, Sahil 👋`;
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
