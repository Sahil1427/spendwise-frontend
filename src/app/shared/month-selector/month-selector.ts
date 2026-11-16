import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

import { Icon } from '../icon/icon';

@Component({
  selector: 'app-month-selector',
  imports: [Icon],
  templateUrl: './month-selector.html',
  styleUrl: './month-selector.scss',
})
export class MonthSelector {
  // '01'..'12'
  @Input() value = '01';

  // Zero-based month index (0 = January). Months before it are
  // disabled — the planner uses this to expose only future months.
  @Input() startMonth = 0;

  @Output() valueChange = new EventEmitter<string>();

  open = false;

  readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  readonly currentYear = new Date().getFullYear();

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  get selectedName(): string {
    return this.monthNames[Number(this.value) - 1] ?? 'January';
  }

  // Zero-based month index -> '01'..'12'.
  valueFor(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  isDisabled(monthValue: string): boolean {
    return Number(monthValue) - 1 < this.startMonth;
  }

  toggleOpen(): void {
    this.open = !this.open;
  }

  select(monthValue: string): void {
    if (this.isDisabled(monthValue)) {
      return;
    }

    this.valueChange.emit(monthValue);
    this.open = false;
  }

  @HostListener('document:pointerdown', ['$event'])
  closeOnOutsideClick(event: PointerEvent): void {
    if (
      event.target instanceof Node &&
      !this.elementRef.nativeElement.contains(event.target)
    ) {
      this.open = false;
    }
  }
}
