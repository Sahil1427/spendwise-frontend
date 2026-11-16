import { Component, computed, inject, signal } from '@angular/core';
import { MonthSelector } from '../../../shared/month-selector/month-selector';
import { TransactionForm } from '../../../shared/transaction-form/transaction-form';
import { Icon } from '../../../shared/icon/icon';
import {
  TransactionService,
  Transaction,
} from '../../../services/transaction.service';
import { MonthSelectionService } from '../../../services/month-selection.service';

@Component({
  selector: 'app-add-transaction',
  imports: [MonthSelector, TransactionForm, Icon],
  templateUrl: './add-transaction.html',
  styleUrl: './add-transaction.scss',
})
export class AddTransaction {
  private readonly transactionService = inject(TransactionService);
  readonly monthSelection = inject(MonthSelectionService);

  readonly savedFlag = signal(false);
  private savedTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The date a fresh record lands on: today when the selected month is
   * the running one, otherwise the 1st of the selected month so the
   * record belongs to the month the user is looking at.
   */
  readonly formDefaultDate = computed(() => {
    const today = this.getToday();
    const prefix = this.monthSelection.prefix();

    return today.startsWith(prefix) ? today : `${prefix}-01`;
  });

  onSaved(
    payload: Omit<Transaction, 'id' | 'createdAt' | 'currency'>
  ): void {
    this.transactionService.addTransaction(payload);
    this.flashSaved();
  }

  private flashSaved(): void {
    this.savedFlag.set(true);

    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
    }

    this.savedTimer = setTimeout(() => this.savedFlag.set(false), 2400);
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
