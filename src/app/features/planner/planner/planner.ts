import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NgClass } from '@angular/common';
import { TransactionService } from '../../../services/transaction.service';
import { SettingsService } from '../../../services/settings.service';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker';

type PlannerView = 'list' | 'calendar';

@Component({
  selector: 'app-planner',
  imports: [DatePickerComponent, NgClass],
  templateUrl: './planner.html',
  styleUrl: './planner.scss',
})
export class Planner {
  private transactionService = inject(TransactionService);
  private settingsService = inject(SettingsService);
  private router = inject(Router);

  private readonly now = new Date();
  readonly today = this.toISODate(this.now);

  activeView: PlannerView = 'list';
  dateFilterOpen = false;

  addUpcomingActivity(): void {
    this.router.navigate(['/transactions'], {
      queryParams: { action: 'add', returnTo: 'planner' },
    });
  }

  filterMonth = this.now.getMonth();
  filterYear = this.now.getFullYear();
  selectedDateFilter = '';

  calendarMonth = this.now.getMonth();
  calendarYear = this.now.getFullYear();

  readonly monthNames = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ];

  get availableYears(): number[] {
    return Array.from(
      { length: 2036 - this.now.getFullYear() + 1 },
      (_, index) => this.now.getFullYear() + index
    );
  }

  get availableMonths(): { value: number; label: string }[] {
    const firstMonth = this.filterYear === this.now.getFullYear()
      ? this.now.getMonth()
      : 0;

    return this.monthNames
      .map((label, value) => ({ value, label }))
      .filter(month => month.value >= firstMonth);
  }

  scheduledTransactions = computed(() =>
    this.transactionService.transactions()
      .filter(item => item.date > this.today)
      .sort((a, b) => a.date.localeCompare(b.date))
  );

  // A getter is intentional: filterMonth, filterYear and selectedDateFilter
  // are regular properties, not signals.
  get filteredTransactions() {
    const items = this.scheduledTransactions();

    if (this.selectedDateFilter) {
      return items.filter(item => item.date === this.selectedDateFilter);
    }

    const month = String(this.filterMonth + 1).padStart(2, '0');
    const prefix = `${this.filterYear}-${month}`;

    return items.filter(item => item.date.startsWith(prefix));
  }

  totalCount = computed(() => this.scheduledTransactions().length);
  upcomingCount = computed(() => this.scheduledTransactions().length);

  dueTodayCount = computed(() =>
    this.transactionService.transactions()
      .filter(item => item.date === this.today).length
  );

  completedCount = 0;

  get calendarMonthLabel(): string {
    return `${this.monthNames[this.calendarMonth]} ${this.calendarYear}`;
  }

  get calendarDays(): (number | null)[] {
    const firstDay = new Date(
      this.calendarYear, this.calendarMonth, 1
    ).getDay();

    const daysInMonth = new Date(
      this.calendarYear, this.calendarMonth + 1, 0
    ).getDate();

    const days: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
    ];

    while (days.length % 7 !== 0) days.push(null);

    return days;
  }

  get canGoToPreviousMonth(): boolean {
    return this.calendarYear > this.now.getFullYear() ||
      (this.calendarYear === this.now.getFullYear() &&
        this.calendarMonth > this.now.getMonth());
  }

  selectView(view: PlannerView): void {
    this.activeView = view;
    this.dateFilterOpen = false;

    if (view === 'calendar') {
      this.calendarMonth = this.now.getMonth();
      this.calendarYear = this.now.getFullYear();
    }
  }

  toggleDateFilter(): void {
    this.dateFilterOpen = !this.dateFilterOpen;
  }

  onFilterYearChange(year: number): void {
    this.filterYear = year;

    const firstAvailableMonth = year === this.now.getFullYear()
      ? this.now.getMonth()
      : 0;

    if (this.filterMonth < firstAvailableMonth) {
      this.filterMonth = firstAvailableMonth;
    }

    this.selectedDateFilter = '';
  }

  onFilterMonthChange(month: number): void {
    this.filterMonth = month;
    this.selectedDateFilter = '';
  }

  onExactDateChange(date: string): void {
    this.selectedDateFilter = date;

    if (date) {
      const [year, month] = date.split('-').map(Number);
      this.filterYear = year;
      this.filterMonth = month - 1;
    }
  }

  applyDateFilter(): void {
    this.dateFilterOpen = false;
  }

  clearDateFilter(): void {
    this.filterMonth = this.now.getMonth();
    this.filterYear = this.now.getFullYear();
    this.selectedDateFilter = '';
    this.dateFilterOpen = false;
  }

  previousMonth(): void {
    if (!this.canGoToPreviousMonth) return;

    if (this.calendarMonth === 0) {
      this.calendarMonth = 11;
      this.calendarYear--;
    } else {
      this.calendarMonth--;
    }
  }

  nextMonth(): void {
    if (this.calendarMonth === 11) {
      this.calendarMonth = 0;
      this.calendarYear++;
    } else {
      this.calendarMonth++;
    }
  }

  dateForDay(day: number): string {
    return this.toISODate(
      new Date(this.calendarYear, this.calendarMonth, day)
    );
  }

  isToday(day: number): boolean {
    return this.dateForDay(day) === this.today;
  }

  isPastDate(day: number): boolean {
    return this.dateForDay(day) < this.today;
  }

  transactionsForDay(day: number) {
    const date = this.dateForDay(day);

    return this.scheduledTransactions().filter(
      item => item.date === date
    );
  }

  hasIncomeOnDay(day: number): boolean {
    return this.transactionsForDay(day).some(
      item => item.type === 'income'
    );
  }

  hasExpenseOnDay(day: number): boolean {
    return this.transactionsForDay(day).some(
      item => item.type === 'expense'
    );
  }

  hasMixedActivity(day: number): boolean {
    return this.hasIncomeOnDay(day) && this.hasExpenseOnDay(day);
  }

  calendarCellClass(day: number): string {
    const income = this.hasIncomeOnDay(day);
    const expense = this.hasExpenseOnDay(day);

    if (income && expense) return 'mixed-activity';
    if (income) return 'income-activity';
    if (expense) return 'expense-activity';

    return '';
  }

  formatDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}-${month}-${year}`;
  }

  formatAmount(amount: number, currency?: string): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency ?? this.settingsService.currency(),
      maximumFractionDigits: 2,
    }).format(amount);
  }

  private toISODate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
