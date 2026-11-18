import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TransactionForm } from '../../../shared/transaction-form/transaction-form';
import { MonthSelector } from '../../../shared/month-selector/month-selector';
import { Icon } from '../../../shared/icon/icon';
import {
  TransactionService,
  TransactionType,
  Transaction,
  AddPayload,
} from '../../../services/transaction.service';
import { SettingsService } from '../../../services/settings.service';
import { MonthSelectionService } from '../../../services/month-selection.service';
import { CurrencyConvertService } from '../../../services/currency-convert.service';

/**
 * History — the month-wise record list.
 *
 * Shows exactly the records belonging to the shared selected month,
 * with search + type filters, per-row edit (reuses the flat form) and
 * delete. No year or day filters: the application is month-wise in a
 * single current year.
 */
@Component({
  selector: 'app-transactions',
  imports: [FormsModule, RouterLink, TransactionForm, MonthSelector, Icon],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
})
export class Transactions {
  private readonly transactionService = inject(TransactionService);
  private readonly settingsService = inject(SettingsService);
  private readonly convert = inject(CurrencyConvertService);
  readonly monthSelection = inject(MonthSelectionService);

  /** Per-row conversion target: transactionId → currency code ('' = off). */
  readonly conversionChoices = signal<Record<string, string>>({});
  readonly conversionCurrencies: readonly string[] = this.convert.supported;

  readonly selectedFilter = signal<'all' | 'income' | 'expense'>('all');
  readonly searchTerm = signal('');

  readonly editing = signal<Transaction | null>(null);

  readonly monthTransactions = computed(() => {
    const prefix = this.monthSelection.prefix();

    return this.transactionService
      .transactions()
      .filter(item => item.date.startsWith(prefix))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly monthlyIncome = computed(
    () =>
      this.monthTransactions()
        .filter(item => item.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0)
  );

  readonly monthlyExpenses = computed(
    () =>
      this.monthTransactions()
        .filter(item => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0)
  );

  readonly monthlyNet = computed(
    () => this.monthlyIncome() - this.monthlyExpenses()
  );

  readonly filteredTransactions = computed(() => {
    // Re-render the table whenever the active rate source changes, so an
    // open conversion refreshes to today's market number automatically.
    this.convert.source();
    this.convert.asOf();

    const search = this.searchTerm().trim().toLowerCase();
    const filterType = this.selectedFilter();

    return this.monthTransactions().filter(item => {
      const matchesType =
        filterType === 'all' || item.type === filterType;

      const searchableText = [
        item.category,
        item.name,
        item.description,
        item.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return matchesType && (!search || searchableText.includes(search));
    });
  });

  categoryIcons: Record<string, string> = {
    'Salary': '💼',
    'Business': '✦',
    'Business Earnings': '🏢',
    'Freelance': '💻',
    'Investments': '📈',
    'Rental Income': '🏠',
    'Interest': '🏦',
    'Gifts Received': '🎁',
    'Groceries': '🛒',
    'Rent': '🏠',
    'Home EMI': '🏡',
    'Car EMI': '🚗',
    'Utilities': '💡',
    'Transportation': '🚕',
    'Fuel': '⛽',
    'Shopping': '🛍️',
    'Food & Dining': '🍽️',
    'Healthcare': '🏥',
    'Education': '📚',
    'Insurance': '🛡️',
    'Entertainment': '🎬',
    'Travel': '✈️',
    'Subscriptions': '📱',
    'Personal Care': '🧴',
    'Family & Household': '👨‍👩‍👧',
  };

  get activeCurrency(): string {
    return this.settingsService.currency();
  }

  money(amount: number): string {
    return this.settingsService.formatAmount(amount);
  }

  isCustomCategory(item: Transaction): boolean {
    return this.transactionService
      .customCategories()[item.type]
      .includes(item.category);
  }

  // NAME column: the record's own name; custom categories fall back to
  // the category name so a custom entry always shows its label.
  nameDisplay(item: Transaction): string {
    if (item.name) {
      return item.name;
    }

    return this.isCustomCategory(item) ? item.category : '—';
  }

  canEditTransaction(item: Transaction): boolean {
    return Boolean(item.date) && item.date >= this.getToday();
  }

  openEdit(item: Transaction): void {
    if (!this.canEditTransaction(item)) {
      window.alert('Past-dated transactions cannot be edited. You can still delete them.');
      return;
    }

    this.editing.set(item);
  }

  onEditSaved(
    payload: AddPayload
  ): void {
    const target = this.editing();

    if (target) {
      this.transactionService.updateTransaction(target.id, payload);
    }

    this.editing.set(null);
  }

  onEditDeleted(id: string): void {
    if (
      window.confirm(
        'Delete this transaction? This cannot be undone.'
      )
    ) {
      this.transactionService.deleteTransaction(id);
    }

    this.editing.set(null);
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  onDelete(id: string): void {
    if (window.confirm('Delete this transaction?')) {
      this.transactionService.deleteTransaction(id);
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeEdit();
    }
  }

  setConversionChoice(id: string, currency: string): void {
    const next = { ...this.conversionChoices() };
    if (currency) {
      next[id] = currency;
    } else {
      delete next[id];
    }
    this.conversionChoices.set(next);
  }

  /**
   * CONVERT column: the record's amount re-expressed in the row's chosen
   * target currency, e.g. ₹400 → "≈ $4.81" once USD is selected.
   */
  conversionDisplay(item: Transaction): string | null {
    const target = this.conversionChoices()[item.id];
    if (!target) {
      return null;
    }

    const from = (item.currency || this.activeCurrency).toUpperCase();
    const value = this.convert.convert(item.amount, from, target);

    return `≈ ${new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: target,
      maximumFractionDigits: 2,
    }).format(value)}`;
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
  }

  formatAmount(
    amount: number,
    type: TransactionType,
    currency?: string
  ): string {
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency ?? this.activeCurrency,
      maximumFractionDigits: 2,
    }).format(amount);

    return `${type === 'income' ? '+' : '-'}${formatted}`;
  }

  private getToday(): string {
    const today = new Date();

    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
  }
}
