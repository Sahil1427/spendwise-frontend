import { Injectable, computed, signal } from '@angular/core';

/**
 * Single source of truth for the month every tab is viewing.
 *
 * The application is strictly month-wise within ONE current year:
 * - the selector only offers the months of the current year
 * - the default is the month before the current month
 *   (falls back to January when running in January itself)
 * - every tab (Dashboard, Add, History, Reports) reads the same
 *   selection, so switching tabs keeps the user on the same month
 */
@Injectable({ providedIn: 'root' })
export class MonthSelectionService {
  private readonly now = new Date();

  readonly currentYear = this.now.getFullYear();

  readonly months = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: MonthSelectionService.MONTH_NAMES[index],
  }));

  private static readonly MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  private static readonly KEY = 'spendwise-selected-month';

  /** e.g. '11' when it is November. */
  readonly selectedMonth = signal<string>(this.initialMonth());

  /** Label for the currently selected month, e.g. "October 2026". */
  readonly selectedLabel = computed(() => {
    const month = Number(this.selectedMonth()) - 1;
    return new Intl.DateTimeFormat('en-IN', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(this.currentYear, month, 1));
  });

  /** 'YYYY-MM' prefix for startsWith date filtering. */
  readonly prefix = computed(
    () => `${this.currentYear}-${this.selectedMonth()}`
  );

  /** One-based index of the selected month (1 = January). */
  readonly selectedIndex = computed(
    () => Number(this.selectedMonth())
  );

  /** Selected month is the one currently running. */
  readonly isCurrentMonth = computed(
    () => this.isThisMonthOf(this.selectedMonth())
  );

  private isThisMonthOf(month: string): boolean {
    return (
      month ===
      String(this.now.getMonth() + 1).padStart(2, '0')
    );
  }

  setMonth(month: string): void {
    if (!/^\d{2}$/.test(month)) {
      return;
    }

    this.selectedMonth.set(month);
    localStorage.setItem(MonthSelectionService.KEY, month);
  }

  private initialMonth(): string {
    try {
      // The stored value is month-only ('01'..'12') by design, so it is
      // always valid for whichever current year is running.
      const saved = localStorage.getItem(MonthSelectionService.KEY);
      if (saved && /^\d{2}$/.test(saved)) {
        return saved;
      }
    } catch {
      // Storage unavailable (private mode) — fall through.
    }

    return this.defaultMonth();
  }

  private defaultMonth(): string {
    const index = this.now.getMonth(); // 0-based
    // The month before the current month; January stays on January.
    const previous = index === 0 ? 1 : index;
    return String(previous).padStart(2, '0');
  }
}
