import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges
} from '@angular/core';

import { Icon } from '../icon/icon';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [Icon],
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.scss'
})
export class DatePickerComponent implements OnChanges {
  @Input() value = '';
  @Input() minDate = '';
  @Input() maxDate = '';

  @Output() valueChange = new EventEmitter<string>();

  showCalendar = false;
  currentMonth = new Date().getMonth();
  currentYear = new Date().getFullYear();

  readonly minYear = 1970;
  readonly maxYear = 2036;

  readonly monthNames = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ];

  readonly weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && this.value) {
      const parts = this.value.split('-').map(Number);
      if (parts.length === 3 && parts[0] >= this.minYear && parts[0] <= this.maxYear) {
        this.currentYear = parts[0];
        this.currentMonth = parts[1] - 1;
      }
    }

    if (changes['minDate'] && this.minDate) {
      const minimum = this.parseDate(this.minDate);
      if (
        this.currentYear < minimum.year ||
        (this.currentYear === minimum.year && this.currentMonth < minimum.month)
      ) {
        this.currentYear = minimum.year;
        this.currentMonth = minimum.month;
      }
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  closeOnOutsideClick(event: PointerEvent): void {
    const target = event.target;

    if (target instanceof Node &&
        !this.elementRef.nativeElement.contains(target)) {
      this.showCalendar = false;
    }
  }

  get years(): number[] {
    const firstYear = this.minDate
      ? this.parseDate(this.minDate).year
      : this.minYear;

    const lastYear = this.maxDate
      ? this.parseDate(this.maxDate).year
      : this.maxYear;

    return Array.from(
      { length: Math.max(0, lastYear - firstYear + 1) },
      (_, i) => firstYear + i
    );
  }

  get displayValue(): string {
    if (!this.value) return 'DD-MM-YYYY';
    const [year, month, day] = this.value.split('-');
    return `${day}-${month}-${year}`;
  }

  get calendarDays(): (number | null)[] {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
    const daysInMonth = new Date(
      this.currentYear,
      this.currentMonth + 1,
      0
    ).getDate();

    const days: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
    ];

    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  toggleCalendar(): void {
    this.showCalendar = !this.showCalendar;

    if (!this.showCalendar) return;

    // Existing entries open on their saved date.
    if (this.value) {
      const [year, month] = this.value.split('-').map(Number);
      this.currentYear = year;
      this.currentMonth = month - 1;
      return;
    }

    // Empty date fields open on today (or the minimum allowed date).
    if (this.minDate) {
      const minimum = this.parseDate(this.minDate);
      this.currentYear = minimum.year;
      this.currentMonth = minimum.month;
      return;
    }

    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
  }

  previousMonth(): void {
    const minimum = this.minDate
      ? this.parseDate(this.minDate)
      : { year: this.minYear, month: 0 };

    if (
      this.currentYear < minimum.year ||
      (this.currentYear === minimum.year && this.currentMonth <= minimum.month)
    ) {
      return;
    }

    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
  }

  get isPreviousMonthDisabled(): boolean {
    const minimum = this.minDate
      ? this.parseDate(this.minDate)
      : { year: this.minYear, month: 0 };

    return this.currentYear < minimum.year ||
      (this.currentYear === minimum.year && this.currentMonth <= minimum.month);
  }

  get isNextMonthDisabled(): boolean {
    const maximum = this.maxDate
      ? this.parseDate(this.maxDate)
      : { year: this.maxYear, month: 11 };

    return this.currentYear > maximum.year ||
      (this.currentYear === maximum.year && this.currentMonth >= maximum.month);
  }

  nextMonth(): void {
    const maximum = this.maxDate
      ? this.parseDate(this.maxDate)
      : { year: this.maxYear, month: 11 };

    if (
      this.currentYear > maximum.year ||
      (this.currentYear === maximum.year && this.currentMonth >= maximum.month)
    ) {
      return;
    }

    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
  }

  isMonthDisabled(month: number): boolean {
    const minimum = this.minDate
      ? this.parseDate(this.minDate)
      : { year: this.minYear, month: 0 };

    const maximum = this.maxDate
      ? this.parseDate(this.maxDate)
      : { year: this.maxYear, month: 11 };

    return (
      (this.currentYear === minimum.year && month < minimum.month) ||
      (this.currentYear === maximum.year && month > maximum.month)
    );
  }

  setMonth(month: number): void {
    const minimum = this.minDate
      ? this.parseDate(this.minDate)
      : { year: this.minYear, month: 0 };

    const maximum = this.maxDate
      ? this.parseDate(this.maxDate)
      : { year: this.maxYear, month: 11 };

    if (
      (this.currentYear === minimum.year && month < minimum.month) ||
      (this.currentYear === maximum.year && month > maximum.month)
    ) return;

    this.currentMonth = month;
  }

  setYear(year: number): void {
    const minimum = this.minDate
      ? this.parseDate(this.minDate)
      : { year: this.minYear, month: 0 };

    const maximum = this.maxDate
      ? this.parseDate(this.maxDate)
      : { year: this.maxYear, month: 11 };

    if (year < minimum.year || year > maximum.year) return;

    this.currentYear = year;

    if (year === minimum.year && this.currentMonth < minimum.month) {
      this.currentMonth = minimum.month;
    }

    if (year === maximum.year && this.currentMonth > maximum.month) {
      this.currentMonth = maximum.month;
    }
  }

  isDisabled(day: number): boolean {
    const date = this.formatDate(
      this.currentYear,
      this.currentMonth,
      day
    );

    return (this.minDate !== '' && date < this.minDate) ||
      (this.maxDate !== '' && date > this.maxDate);
  }

  selectDate(day: number): void {
    if (this.isDisabled(day)) return;

    const selected = this.formatDate(
      this.currentYear,
      this.currentMonth,
      day
    );

    this.value = selected;
    this.valueChange.emit(selected);
    this.showCalendar = false;
  }

  isSelected(day: number): boolean {
    return this.value === this.formatDate(
      this.currentYear, this.currentMonth, day
    );
  }

  isToday(day: number): boolean {
    const today = new Date();
    return today.getFullYear() === this.currentYear &&
      today.getMonth() === this.currentMonth &&
      today.getDate() === day;
  }

  goToToday(): void {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.selectDate(today.getDate());
  }

  clearDate(): void {
    this.value = '';
    this.valueChange.emit('');
    this.showCalendar = false;
  }

  private parseDate(date: string): { year: number; month: number } {
    const [year, month] = date.split('-').map(Number);
    return { year, month: month - 1 };
  }

  private formatDate(year: number, month: number, day: number): string {
    return [
      year,
      String(month + 1).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');
  }
}
