
import { Injectable, inject, signal } from '@angular/core';
import { SettingsService } from './settings.service';

export type TransactionType = 'income' | 'expense';
export type PlannerState = 'pending' | 'completed';

export interface RescheduleEntry {
  fromDate: string;
  toDate: string;
  changedAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  date: string;
  createdAt: string;
  name?: string;
  description?: string;
  notes?: string;

  // Planner lifecycle fields. These do not change the financial transaction date.
  plannerState?: PlannerState;
  plannerDueDate?: string;
  completedAt?: string;
  rescheduleHistory?: RescheduleEntry[];
  notificationGeneratedAt?: string;
  notificationSeen?: boolean;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly settings = inject(SettingsService);
  private readonly transactionKey = 'spendwise-transactions';
  private readonly categoryKey = 'spendwise-custom-categories';

  readonly transactions = signal<Transaction[]>(this.loadTransactions());

  readonly customCategories = signal<Record<TransactionType, string[]>>(
    this.loadCustomCategories()
  );

  readonly defaultCategories: Record<TransactionType, string[]> = {
    income: [
      'Salary', 'Business', 'Business Earnings', 'Freelance',
      'Investments', 'Rental Income', 'Interest', 'Gifts Received',
    ],
    expense: [
      'Groceries', 'Rent', 'Home EMI', 'Car EMI', 'Utilities',
      'Transportation', 'Fuel', 'Shopping', 'Food & Dining',
      'Healthcare', 'Education', 'Insurance', 'Entertainment',
      'Travel', 'Subscriptions', 'Personal Care',
      'Family & Household', 'Other Expenses',
    ],
  };

  private getLocalToday(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadTransactions(): Transaction[] {
    try {
      const saved = localStorage.getItem(this.transactionKey);
      if (!saved) return [];

      const parsed = JSON.parse(saved) as Partial<Transaction>[];
      const today = this.getLocalToday();

      const normalized = parsed.map((item, index): Transaction => {
        const date = item.date || today;
        // Legacy records predate per-record currency; stamp them once with
        // the current setting so existing totals stay meaningful.
        const currency =
          typeof item.currency === 'string' && item.currency
            ? item.currency
            : this.settings.currency();
        const isExistingPlannerRecord =
          item.plannerState === 'pending' ||
          item.plannerState === 'completed';

        // One-time logical migration: legacy future-dated records become Pending.
        const migrateToPlanner = !isExistingPlannerRecord && date > today;

        return {
          id: item.id || `legacy-${index}`,
          type: item.type === 'income' ? 'income' : 'expense',
          amount: Number(item.amount) || 0,
          currency,
          category: item.category || item.description || 'Other Expenses',
          date,
          createdAt: item.createdAt || new Date(`${date}T12:00:00`).toISOString(),
          name: item.name,
          description: item.description,
          notes: item.notes,
          plannerState: isExistingPlannerRecord
            ? item.plannerState
            : migrateToPlanner ? 'pending' : undefined,
          plannerDueDate: item.plannerDueDate || (migrateToPlanner ? date : undefined),
          completedAt: item.completedAt,
          rescheduleHistory: Array.isArray(item.rescheduleHistory)
            ? item.rescheduleHistory
            : [],
          notificationGeneratedAt: item.notificationGeneratedAt,
          notificationSeen: item.notificationSeen ?? false,
        };
      });

      // Persist the migration and remove obsolete legacy status fields.
      localStorage.setItem(this.transactionKey, JSON.stringify(normalized));

      return normalized;
    } catch (error) {
      console.error('Unable to load SpendWise transactions:', error);
      return [];
    }
  }

  private loadCustomCategories(): Record<TransactionType, string[]> {
    try {
      const saved = localStorage.getItem(this.categoryKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          income: Array.isArray(parsed.income) ? parsed.income : [],
          expense: Array.isArray(parsed.expense) ? parsed.expense : [],
        };
      }
    } catch {
      // Use empty custom categories if saved data is invalid.
    }

    return { income: [], expense: [] };
  }

  private persistTransactions(): void {
    localStorage.setItem(
      this.transactionKey,
      JSON.stringify(this.transactions())
    );
  }

  private persistCategories(): void {
    localStorage.setItem(
      this.categoryKey,
      JSON.stringify(this.customCategories())
    );
  }

  getCategories(type: TransactionType): string[] {
    return [
      ...this.defaultCategories[type],
      ...this.customCategories()[type],
    ];
  }

  addCustomCategory(type: TransactionType, name: string): boolean {
    const cleanName = name.trim();
    if (!cleanName) return false;

    const existing = this.getCategories(type);
    if (existing.some(item => item.toLowerCase() === cleanName.toLowerCase())) {
      return false;
    }

    this.customCategories.update(current => ({
      ...current,
      [type]: [...current[type], cleanName],
    }));

    this.persistCategories();
    return true;
  }

  renameCustomCategory(
    type: TransactionType,
    oldName: string,
    newName: string
  ): boolean {
    const cleanName = newName.trim();
    if (!cleanName) return false;

    const categories = this.getCategories(type);
    if (categories.some(category =>
      category !== oldName &&
      category.toLowerCase() === cleanName.toLowerCase()
    )) {
      return false;
    }

    this.customCategories.update(current => ({
      ...current,
      [type]: current[type].map(category =>
        category === oldName ? cleanName : category
      ),
    }));

    this.transactions.update(items =>
      items.map(item =>
        item.type === type && item.category === oldName
          ? { ...item, category: cleanName }
          : item
      )
    );

    this.persistCategories();
    this.persistTransactions();
    return true;
  }

  removeCustomCategory(type: TransactionType, name: string): void {
    this.customCategories.update(current => ({
      ...current,
      [type]: current[type].filter(category => category !== name),
    }));

    this.persistCategories();
  }

  addTransaction(
    transaction: Omit<Transaction, 'id' | 'createdAt' | 'currency'>
  ): void {
    // New records always use the currently selected currency.
    const newTransaction: Transaction = {
      ...transaction,
      currency: this.settings.currency(),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.transactions.update(items => [newTransaction, ...items]);
    this.persistTransactions();
  }

  updateTransaction(
    id: string,
    updates: Omit<Transaction, 'id' | 'createdAt' | 'currency'>
  ): void {
    // The currency of an existing record is never changed by edits.
    this.transactions.update(items =>
      items.map(item =>
        item.id === id
          ? { ...item, ...updates, currency: item.currency }
          : item
      )
    );

    this.persistTransactions();
  }

  completePlannerActivity(id: string): void {
    const now = new Date();

    this.transactions.update(items =>
      items.map(item =>
        item.id === id && item.plannerState === 'pending'
          ? {
              ...item,
              plannerState: 'completed',
              completedAt: now.toISOString(),
            }
          : item
      )
    );

    this.persistTransactions();
  }

  reschedulePlannerActivity(id: string, newDate: string): boolean {
    const today = this.getLocalToday();

    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(newDate) || newDate <= today) {
      return false;
    }

    let updated = false;
    const changedAt = new Date().toISOString();

    this.transactions.update(items =>
      items.map(item => {
        if (item.id !== id || item.plannerState !== 'pending') {
          return item;
        }

        const currentDueDate = item.plannerDueDate || item.date;

        if (newDate === currentDueDate) {
          return item;
        }

        updated = true;

        return {
          ...item,
          plannerDueDate: newDate,
          rescheduleHistory: [
            ...(item.rescheduleHistory || []),
            {
              fromDate: currentDueDate,
              toDate: newDate,
              changedAt,
            },
          ],
          notificationGeneratedAt: undefined,
          notificationSeen: false,
        };
      })
    );

    if (updated) {
      this.persistTransactions();
    }

    return updated;
  }

  markPlannerNotificationSeen(id: string): void {
    this.transactions.update(items =>
      items.map(item =>
        item.id === id && item.plannerState === 'pending'
          ? { ...item, notificationSeen: true }
          : item
      )
    );

    this.persistTransactions();
  }

  deleteTransaction(id: string): void {
    this.transactions.update(items =>
      items.filter(item => item.id !== id)
    );

    this.persistTransactions();
  }
}
