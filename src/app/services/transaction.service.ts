
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SettingsService } from './settings.service';
import { BackendService } from './backend.service';
import { DEMO_TRANSACTIONS } from './demo-seed';
import type { ImportEntry } from './file-parser.service';

export type TransactionType = 'income' | 'expense';
export type PlannerState = 'pending' | 'completed';

/**
 * Shape the Add/Edit form emits. Currency is optional on purpose: the
 * service stamps the active currency unless the form converted the entry
 * into the home country's currency first ("Save in INR instead").
 */
export type AddPayload = Omit<Transaction, 'id' | 'createdAt' | 'currency'> & {
  currency?: string;
};

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
  /** Storage is namespaced per signed-in user, so each account starts
   * with an empty ledger — logging in as a new user never shows
   * another user's transactions. */
  private readonly scope = inject(AuthService).dataScope();
  private readonly transactionKey = `spendwise-transactions:${this.scope}`;
  private readonly categoryKey = `spendwise-custom-categories:${this.scope}`;

  constructor() {
    // One-time migration: records saved before per-user storage existed
    // belonged to the original "sahil" account. Hand them to sahil's
    // scoped keys so nothing is lost; every other account starts clean.
    if (this.scope === 'sahil') {
      this.copyLegacy('spendwise-transactions', this.transactionKey);
      this.copyLegacy('spendwise-custom-categories', this.categoryKey);
    }
  }

  private copyLegacy(from: string, to: string): void {
    try {
      if (localStorage.getItem(to) !== null) {
        return;
      }
      const legacy = localStorage.getItem(from);
      if (legacy !== null) {
        localStorage.setItem(to, legacy);
      }
    } catch {
      // Storage unavailable — nothing to migrate.
    }
  }

  readonly transactions = signal<Transaction[]>(this.loadTransactions());

  readonly customCategories = signal<Record<TransactionType, string[]>>(
    this.loadCustomCategories()
  );

  private readonly backend = inject(BackendService);

  /**
   * Mirror a just-applied local write to the backend while the
   * connection is active. Fire-and-forget: the UI already updated (the
   * local cache stays), so a network failure only surfaces as a message
   * in the Settings → Backend panel.
   */
  private mirror(run: () => Promise<unknown>): void {
    if (!this.backend.connected()) {
      return;
    }
    run().catch(err => this.backend.reportMirrorError(err));
  }

  /**
   * Adopt a freshly fetched server dataset as the device's records
   * (connect flow / start-up sync). Replaces the local cache so the
   * device never drifts from the backend while connected.
   */
  adoptRemote(items: Transaction[]): void {
    this.transactions.set(items);
    this.persistTransactions();
  }

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
          category: this.migrateCategoryName(
            item.category || item.description || 'Other Expenses'
          ),
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

  /**
   * One-time logical migration: the bundled demo data used "Dining",
   * while the add form offers "Food & Dining". Unify so both render as
   * one category (re-persisted by loadTransactions).
   */
  private migrateCategoryName(category: string): string {
    return category === 'Dining' ? 'Food & Dining' : category;
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

  /**
   * Collision-safe id for new local records. crypto.randomUUID() is only
   * available in secure contexts (HTTPS or localhost); this site is also
   * served over plain HTTP on a public IP, where it silently throws and
   * every "Save Transaction" click would fail. The fallback matches the
   * backend's own id style ('tx-' + 12 base36 chars).
   */
  private newLocalId(): string {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      // fall through to the manual generator
    }
    let body = '';
    while (body.length < 12) {
      body += Math.random().toString(36).slice(2);
    }
    return `tx-${body.slice(0, 12)}`;
  }

  /** Replace all records with the bundled demo dataset (Jan–Nov 2026). */
  loadDemoData(): number {
    const items = DEMO_TRANSACTIONS.map(item => ({ ...item, name: item.name ?? undefined }));
    this.transactions.set(items);
    this.persistTransactions();
    this.mirror(() => this.backend.seedDemo());
    return items.length;
  }

  /** Remove every record (keeps settings/intact categories). */
  clearDemoData(): number {
    const removed = this.transactions().length;
    this.transactions.set([]);
    this.persistTransactions();
    this.mirror(() => this.backend.clear());
    return removed;
  }

  /** Append records parsed from an imported file (existing records stay). */
  importEntries(entries: ImportEntry[]): number {
    if (!entries.length) return 0;

    const now = new Date().toISOString();
    const currency = this.settings.currency();
    const stamp = Date.now().toString(36);
    const today = this.getLocalToday();

    const items: Transaction[] = entries.map((entry, index) => {
      const date = entry.date || today;
      const plannerDue = date > today;
      return {
        id: `imp-${stamp}-${index}`,
        type: entry.type === 'income' ? 'income' : 'expense',
        amount: Math.abs(entry.amount) || 0,
        currency,
        category: entry.category || 'Imported',
        date,
        createdAt: now,
        name: entry.description || undefined,
        description: entry.description || undefined,
        plannerState: plannerDue ? 'pending' : undefined,
        plannerDueDate: plannerDue ? date : undefined,
        rescheduleHistory: [],
        notificationSeen: true,
      };
    });

    this.transactions.update(current => [...current, ...items]);
    this.persistTransactions();
    this.mirror(() => this.backend.bulk(items, currency));
    return items.length;
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
    this.mirror(() => this.backend.addCategory(type, cleanName));
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
    this.mirror(() =>
      this.backend.removeCategory(type, oldName).then(() =>
        this.backend.addCategory(type, cleanName)
      )
    );
    return true;
  }

  removeCustomCategory(type: TransactionType, name: string): void {
    this.customCategories.update(current => ({
      ...current,
      [type]: current[type].filter(category => category !== name),
    }));

    this.persistCategories();
    this.mirror(() => this.backend.removeCategory(type, name));
  }

  addTransaction(transaction: AddPayload): void {
    // New records use the currently selected currency — unless the form
    // explicitly converted the entry into another currency first.
    const newTransaction: Transaction = {
      ...transaction,
      currency: transaction.currency ?? this.settings.currency(),
      id: this.newLocalId(),
      createdAt: new Date().toISOString(),
    };

    this.transactions.update(items => [newTransaction, ...items]);
    this.persistTransactions();
    this.mirror(() => this.backend.create(newTransaction));
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
    this.mirror(() => {
      const merged = this.transactions().find(item => item.id === id);
      return merged ? this.backend.update(id, merged) : Promise.resolve();
    });
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
    this.mirror(() => this.backend.completePlanner(id));
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
      this.mirror(() => this.backend.reschedulePlanner(id, newDate));
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
    this.mirror(() => {
      const merged = this.transactions().find(item => item.id === id);
      return merged ? this.backend.update(id, merged) : Promise.resolve();
    });
  }

  deleteTransaction(id: string): void {
    this.transactions.update(items =>
      items.filter(item => item.id !== id)
    );

    this.persistTransactions();
    this.mirror(() => this.backend.remove(id));
  }
}
