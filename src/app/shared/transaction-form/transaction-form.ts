import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerComponent } from '../date-picker/date-picker';
import { Icon } from '../icon/icon';
import {
  TransactionService,
  TransactionType,
  Transaction,
} from '../../services/transaction.service';
import { SettingsService } from '../../services/settings.service';

/**
 * One flat form used for both adding and editing records.
 *
 * Fields: type, category (with inline custom entry), name, description,
 * amount and date. In edit mode a delete button is added. The form emits
 * plain payloads and never touches storage directly — the host decides
 * whether to add or update.
 */
@Component({
  selector: 'app-transaction-form',
  imports: [FormsModule, DatePickerComponent, Icon],

  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
})
export class TransactionForm implements OnChanges {
  private readonly transactionService = inject(TransactionService);
  private readonly settingsService = inject(SettingsService);

  /** When set, the form works in edit mode for this record. */
  @Input() initial: Transaction | null = null;

  /** Prefilled date (Add page passes today / selected-month context). */
  @Input() defaultDate = '';

  @Output() saved = new EventEmitter<Omit<
    Transaction,
    'id' | 'createdAt' | 'currency'
  >>();

  @Output() canceled = new EventEmitter<void>();

  @Output() deleted = new EventEmitter<string>();

  readonly isNewCategory = '__new__';

  /** Property bindings land after construction, so every field below
   * stays neutral and is filled in ngOnChanges. */
  isEdit = false;

  type: TransactionType = 'income';
  category = '';
  showNewCategory = false;
  newCategoryName = '';
  name = '';
  description = '';
  amount: number | null = null;
  date = '';

  private dateTouched = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initial']) {
      const item = this.initial;
      this.isEdit = Boolean(item);
      this.type = item ? item.type : 'income';
      this.category = item ? item.category : '';
      this.showNewCategory = false;
      this.newCategoryName = '';
      this.name = item ? (item.name ?? '') : '';
      this.description = item ? (item.description ?? '') : '';
      this.amount = item ? item.amount : null;
      this.dateTouched = false;
      this.date = item ? item.date : this.defaultDate;
      this.error = '';
      return;
    }

    // Add mode: follow the host-provided context date until the user
    // picks one themselves.
    if (changes['defaultDate'] && !this.dateTouched) {
      this.date = this.defaultDate;
    }
  }

  private error = '';

  set errorText(value: string) {
    this.error = value;
  }

  get errorText(): string {
    return this.error;
  }

  get availableCategories(): string[] {
    const defaults = this.transactionService.defaultCategories[this.type];
    const fixed =
      this.type === 'expense'
        ? defaults.filter(item => item !== 'Other Expenses')
        : defaults;

    return [...fixed, ...this.transactionService.customCategories()[this.type]];
  }

  get selectedCategory(): string {
    return this.showNewCategory ? this.isNewCategory : this.category;
  }

  get currencySymbol(): string {
    return this.settingsService.symbolFor(this.settingsService.currency());
  }

  get amountLabel(): string {
    const code = this.settingsService.currency();
    return `Amount (${this.currencySymbol} ${code})`;
  }

  changeType(type: TransactionType): void {
    this.type = type;
    this.category = '';
    this.showNewCategory = false;
    this.newCategoryName = '';
    this.error = '';
  }

  onCategorySelect(value: string): void {
    if (value === this.isNewCategory) {
      this.showNewCategory = true;
      this.category = '';
    } else {
      this.showNewCategory = false;
      this.newCategoryName = '';
      this.category = value;
    }

    this.error = '';
  }

  onDateChange(value: string): void {
    this.dateTouched = true;
    this.date = value;
    this.error = '';
  }

  onSubmit(): void {
    const category = this.showNewCategory
      ? this.newCategoryName.trim()
      : this.category;

    if (!category) {
      this.error = 'Choose a category to continue.';
      return;
    }

    if (
      this.amount === null ||
      !Number.isFinite(this.amount) ||
      this.amount <= 0
    ) {
      this.error = 'Enter an amount greater than zero.';
      return;
    }

    if (!this.date) {
      this.error = 'Pick the transaction date.';
      return;
    }

    // A brand-new category is registered before the record references it.
    if (this.showNewCategory) {
      this.transactionService.addCustomCategory(this.type, category);
    }

    this.saved.emit({
      type: this.type,
      category,
      amount: Number(this.amount),
      date: this.date,
      name: this.name.trim() || undefined,
      description: this.description.trim() || undefined,
    });

    this.error = '';

    if (!this.isEdit) {
      this.afterCreateReset();
    }
  }

  /** Add page: stay open, ready for the next entry. */
  private afterCreateReset(): void {
    this.type = 'income';
    this.category = '';
    this.showNewCategory = false;
    this.newCategoryName = '';
    this.name = '';
    this.description = '';
    this.amount = null;
    this.dateTouched = false;
    this.date = this.defaultDate;
  }

  onCancel(): void {
    this.error = '';
    this.canceled.emit();
  }

  onDelete(): void {
    if (this.initial) {
      this.deleted.emit(this.initial.id);
    }
  }
}
