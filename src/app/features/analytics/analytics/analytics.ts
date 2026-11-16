import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonthSelector } from '../../../shared/month-selector/month-selector';
import { Icon } from '../../../shared/icon/icon';
import { TransactionService } from '../../../services/transaction.service';
import { SettingsService } from '../../../services/settings.service';
import { MonthSelectionService } from '../../../services/month-selection.service';

/**
 * Reports — the month-wise detail view.
 *
 * The user picks a month of the current year on ANY tab via the shared
 * month selector; Reports then shows everything about that month:
 * totals, previous-month comparison, itemised income & expense lists,
 * category breakdown and the 12-month comparison table for the year.
 */
@Component({
  selector: 'app-analytics',
  imports: [FormsModule, MonthSelector, Icon],
  templateUrl: './analytics.html',
  styleUrl: './analytics.scss',
})
export class Analytics {
  private readonly transactionService = inject(TransactionService);
  private readonly settingsService = inject(SettingsService);
  readonly monthSelection = inject(MonthSelectionService);

  readonly selectedFilter = signal<'all' | 'income' | 'expense'>('all');

  private monthPrefix(month: string): string {
    return `${this.monthSelection.currentYear}-${month}`;
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

  /** Previous month within the year for the comparison block. */
  readonly hasPreviousMonth = computed(
    () => this.monthSelection.selectedIndex() > 1
  );

  private previousMonthKey(): number {
    return this.monthSelection.selectedIndex() - 1; // 1-based prev
  }

  readonly previousMonthLabel = computed(() => {
    if (!this.hasPreviousMonth()) {
      return '';
    }

    const month = Number(String(this.previousMonthKey()).padStart(2, '0'));
    return new Intl.DateTimeFormat('en-IN', {
      month: 'long',
      year: 'numeric',
    }).format(
      new Date(this.monthSelection.currentYear, month - 1, 1)
    );
  });

  readonly previousIncome = computed(() =>
    this.hasPreviousMonth()
      ? this.transactionService
          .transactions()
          .filter(item =>
            item.date.startsWith(this.monthPrefix(String(this.previousMonthKey()).padStart(2, '0'))) &&
            item.type === 'income'
          )
          .reduce((sum, item) => sum + item.amount, 0)
      : 0
  );

  readonly previousExpense = computed(() =>
    this.hasPreviousMonth()
      ? this.transactionService
          .transactions()
          .filter(item =>
            item.date.startsWith(this.monthPrefix(String(this.previousMonthKey()).padStart(2, '0'))) &&
            item.type === 'expense'
          )
          .reduce((sum, item) => sum + item.amount, 0)
      : 0
  );

  changePercent(current: number, previous: number): string {
    if (previous <= 0) {
      return current > 0 ? 'New' : '—';
    }

    const delta = ((current - previous) / previous) * 100;
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  }

  readonly listed = computed(() => {
    const filter = this.selectedFilter();

    return this.monthTransactions().filter(
      item => filter === 'all' || item.type === filter
    );
  });

  readonly incomeList = computed(() =>
    this.monthTransactions().filter(item => item.type === 'income')
  );

  readonly expenseList = computed(() =>
    this.monthTransactions().filter(item => item.type === 'expense')
  );

  readonly categoryBreakdown = computed(() => {
    const totals = new Map<string, number>();

    this.monthTransactions()
      .filter(item => item.type === 'expense')
      .forEach(item =>
        totals.set(
          item.category,
          (totals.get(item.category) || 0) + item.amount
        )
      );

    const colors = [
      'var(--accent)',
      '#48b9a1',
      '#f2a65a',
      '#5b9bea',
      '#df83b5',
      '#8b9aa8',
      '#53cba0',
      '#a396ff',
    ];

    const total = this.expenseTotal();

    return Array.from(totals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .map((item, index) => ({
        name: item.name,
        amount: this.money(item.amount),
        share: total > 0 ? ((item.amount / total) * 100).toFixed(1) : '0.0',
        bar: Math.max(4, (item.amount / Math.max(1, ...Array.from(totals.values()))) * 100),
        color: colors[index % colors.length],
      }));
  });

  /** All twelve months of the current year at a glance. */
  readonly yearTable = computed(() => {
    const all = this.transactionService.transactions();
    const width = Math.max(
      1,
      ...Array.from({ length: 12 }, (_, index) => {
        const prefix = `${this.monthSelection.currentYear}-${String(index + 1).padStart(2, '0')}`;
        return all
          .filter(item => item.date.startsWith(prefix))
          .reduce(
            (sum, item) =>
              sum +
              (item.type === 'income' ? item.amount : -item.amount),
            0
          );
      })
    );

    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      const prefix = `${this.monthSelection.currentYear}-${month}`;
      const inMonth = all.filter(item => item.date.startsWith(prefix));

      const income = inMonth
        .filter(item => item.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0);
      const expense = inMonth
        .filter(item => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0);

      return {
        month,
        label: new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(
          new Date(this.monthSelection.currentYear, index, 1)
        ),
        hasData: inMonth.length > 0,
        income: this.money(income),
        expense: this.money(expense),
        net: this.money(income - expense),
        bar: ((income - expense) / width) * 50 + 50,
        selected: month === this.monthSelection.selectedMonth(),
      };
    });
  });

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

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(`${date}T00:00:00`));
  }
}
