import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker';
import {
  TransactionService,
  TransactionType,
  Transaction,
} from '../../../services/transaction.service';

@Component({
  selector: 'app-transactions',
  imports: [FormsModule, CurrencyPipe, DatePickerComponent],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
})
export class Transactions {
  private transactionService = inject(TransactionService);

  transactions = this.transactionService.transactions;

  selectedFilter: 'all' | 'income' | 'expense' = 'all';
  searchTerm = '';

  showForm = false;
  editingTransactionId: string | null = null;
  type: TransactionType = 'expense';
  selectedCategory = '';
  amount: number | null = null;
  date = this.getToday();

  showCustomCategory = false;
  customCategoryName = '';
  customCategoryError = '';
  showEditCategory = false;
  editingCategoryName = '';
  originalCategoryName = '';
  editCategoryError = '';


  get availableCategories(): string[] {
    return this.transactionService.getCategories(this.type);
  }

  get transactionsForEditingCategory(): Transaction[] {
    if (!this.showEditCategory || !this.originalCategoryName) {
      return [];
    }

    return this.transactions().filter(item =>
      item.type === this.type &&
      item.category === this.originalCategoryName
    );
  }

  filteredTransactions = computed(() => {
    const search = this.searchTerm.trim().toLowerCase();

    return this.transactions().filter(item => {
      const matchesType =
        this.selectedFilter === 'all' ||
        item.type === this.selectedFilter;

      const matchesSearch =
        !search ||
        item.category.toLowerCase().includes(search);

      return matchesType && matchesSearch;
    });
  });

  totalIncome = computed(() =>
    this.transactions()
      .filter(item => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0)
  );

  totalExpenses = computed(() =>
    this.transactions()
      .filter(item => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)
  );

  categoryIcons: Record<string, string> = {
    'Salary': '💼',
    'Business Earnings': '🏢',
    'Freelance': '💻',
    'Investments': '📈',
    'Rental Income': '🏠',
    'Interest': '🏦',
    'Gifts Received': '🎁',
    'Other Income': '＋',
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
    'Other Expenses': '＋',
  };

  getToday(): string {
    const today = new Date();

    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
  }

  openForm(): void {
    this.showEditCategory = false;
    this.editingTransactionId = null;
    this.type = 'income';
    this.selectedCategory = '';
    this.amount = null;
    this.date = this.getToday();
    this.showCustomCategory = false;
    this.customCategoryName = '';
    this.customCategoryError = '';
    this.showForm = true;
  }

  openEditTransaction(item: Transaction): void {
    const isCustom = this.transactionService
      .customCategories()[item.type]
      .includes(item.category);

    if (!isCustom) {
      return;
    }

    this.editingTransactionId = item.id;
    this.type = item.type;
    this.selectedCategory = item.category;
    this.amount = item.amount;
    this.date = item.date;
    this.showCustomCategory = false;
    this.showEditCategory = false;
    this.customCategoryName = '';
    this.customCategoryError = '';
    this.showForm = true;
  }

  deleteCurrentTransaction(): void {
    if (!this.editingTransactionId) return;

    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    this.transactionService.deleteTransaction(this.editingTransactionId);
    this.closeForm();
  }

  closeForm(): void {
    this.showForm = false;
    this.editingTransactionId = null;
    this.showCustomCategory = false;
    this.showEditCategory = false;
  }

  changeType(type: TransactionType): void {
    this.type = type;
    this.selectedCategory = '';
    this.showCustomCategory = false;
    this.customCategoryName = '';
    this.customCategoryError = '';
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
    this.showCustomCategory = false;
    this.customCategoryError = '';
  }

  openCustomCategory(): void {
    this.showCustomCategory = true;
    this.customCategoryName = '';
    this.customCategoryError = '';
  }

  closeCustomCategory(): void {
    this.showCustomCategory = false;
    this.customCategoryName = '';
    this.customCategoryError = '';
  }

  openEditCategory(category: string): void {
    this.originalCategoryName = category;
    this.editingCategoryName = category;
    this.editCategoryError = '';
    this.showEditCategory = true;
    this.showCustomCategory = false;
    this.showForm = false;
    this.editingTransactionId = null;
  }

  cancelEditCategory(): void {
    this.showEditCategory = false;
    this.editingCategoryName = '';
    this.originalCategoryName = '';
    this.editCategoryError = '';
  }

  saveEditedCategory(): void {
    const newName = this.editingCategoryName.trim();

    if (!newName) {
      this.editCategoryError = 'Please enter a category name.';
      return;
    }

    const oldName = this.originalCategoryName;

    const updated = this.transactionService.renameCustomCategory(
      this.type,
      oldName,
      newName
    );

    if (!updated) {
      this.editCategoryError =
        'This category name already exists or is invalid.';
      return;
    }

    if (this.selectedCategory === oldName) {
      this.selectedCategory = newName;
    }

    this.cancelEditCategory();
  }

  deleteEditingCategory(): void {
    const category = this.originalCategoryName;

    if (!window.confirm(
      `Delete "${category}" from your custom categories? Existing transactions will be retained.`
    )) {
      return;
    }

    this.transactionService.removeCustomCategory(this.type, category);

    if (this.selectedCategory === category) {
      this.selectedCategory = '';
    }

    this.cancelEditCategory();
  }

  addCustomCategory(): void {
    const name = this.customCategoryName.trim();

    if (!name) {
      this.customCategoryError = 'Please enter a category name.';
      return;
    }

    const added = this.transactionService.addCustomCategory(this.type, name);

    if (!added) {
      this.customCategoryError =
        'This category already exists or is invalid.';
      return;
    }

    this.selectedCategory = name;
    this.showCustomCategory = false;
    this.customCategoryName = '';
    this.customCategoryError = '';
  }

  saveTransaction(): void {
    if (
      !this.selectedCategory ||
      this.amount === null ||
      !Number.isFinite(this.amount) ||
      this.amount <= 0 ||
      !this.date
    ) {
      return;
    }

    const transactionData = {
      type: this.type,
      amount: Number(this.amount),
      category: this.selectedCategory,
      date: this.date,
    };

    if (this.editingTransactionId) {
      this.transactionService.updateTransaction(
        this.editingTransactionId,
        transactionData
      );
    } else {
      this.transactionService.addTransaction(transactionData);
    }

    this.amount = null;
    this.selectedCategory = '';
    this.date = this.getToday();
    this.showCustomCategory = false;
    this.showEditCategory = false;
    this.customCategoryName = '';
    this.customCategoryError = '';
    this.cancelEditCategory();

    this.closeForm();
  }

  deleteTransaction(id: string): void {
    if (window.confirm('Delete this transaction?')) {
      this.transactionService.deleteTransaction(id);
    }
  }

  isCustomCategory(category: string): boolean {
    return this.transactionService
      .customCategories()[this.type]
      .includes(category);
  }

  isCustomTransaction(item: Transaction): boolean {
    return this.transactionService
      .customCategories()[item.type]
      .includes(item.category);
  }

  // Remove a custom category
  removeCustomCategory(category: string): void {
    const confirmed = window.confirm(
      `Remove "${category}" from your custom categories? Existing transactions will be retained.`
    );

    if (!confirmed) return;

    this.transactionService.removeCustomCategory(this.type, category);

    if (this.selectedCategory === category) {
      this.selectedCategory = '';
    }
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
  }

  formatAmount(amount: number, type: TransactionType): string {
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);

    return `${type === 'income' ? '+' : '-'}${formatted}`;
  }
}
