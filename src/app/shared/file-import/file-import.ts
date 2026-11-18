import {
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../icon/icon';
import {
  FileParserService,
  ImportEntry,
  ImportKind,
  ParseOutcome,
} from '../../services/file-parser.service';
import { TransactionService } from '../../services/transaction.service';
import { MonthSelectionService } from '../../services/month-selection.service';

/**
 * "Import records" dialog — drop a client file (CSV/Excel/PDF/image/JSON),
 * pick the target month, preview what was understood, then import.
 */
@Component({
  selector: 'app-file-import',
  imports: [Icon],
  templateUrl: './file-import.html',
  styleUrl: './file-import.scss',
})
export class FileImport {
  readonly close = output<void>();
  readonly imported = output<{ count: number; month: string }>();

  private readonly parser = inject(FileParserService);
  private readonly transactions = inject(TransactionService);
  private readonly monthsService = inject(MonthSelectionService);

  /**
   * '01'..'12' — the month the records get dated into.
   * Starts EMPTY by design: picking the target month is mandatory before
   * an import can be confirmed.
   */
  readonly targetMonth = signal('');
  /** Twelve options for the target-month select. */
  readonly monthOptions = this.monthsService.months;
  readonly year = this.monthsService.currentYear;

  readonly file = signal<File | null>(null);
  readonly dragging = signal(false);
  readonly parsing = signal(false);
  readonly importing = signal(false);
  readonly error = signal('');
  readonly outcome = signal<ParseOutcome | null>(null);
  readonly entries = signal<ImportEntry[]>([]);
  readonly assumeType = signal<ImportKind>('expense');

  private static readonly PREVIEW_LIMIT = 12;

  readonly targetLabel = computed(() => {
    const opt = this.monthOptions.find(m => m.value === this.targetMonth());
    return opt ? `${opt.label} ${this.year}` : '—';
  });

  readonly previewRows = computed(() =>
    this.entries().slice(0, FileImport.PREVIEW_LIMIT).map((entry, i) => ({
      key: `${i}-${entry.date}-${entry.amount}`,
      date: new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      }).format(new Date(`${entry.date}T00:00:00`)),
      income: entry.type === 'income',
      category: entry.category,
      desc: entry.description || '—',
      amount: new Intl.NumberFormat('en-IN', {
        maximumFractionDigits: 2,
      }).format(entry.amount),
    }))
  );

  readonly hiddenCount = computed(
    () => Math.max(0, this.entries().length - FileImport.PREVIEW_LIMIT)
  );

  readonly incomeTotal = computed(
    () =>
      this.entries()
        .filter(e => e.type === 'income')
        .reduce((sum, e) => sum + e.amount, 0)
  );

  readonly expenseTotal = computed(
    () =>
      this.entries()
        .filter(e => e.type === 'expense')
        .reduce((sum, e) => sum + e.amount, 0)
  );

  /** "2.1 MB" style size for the dropzone file line. */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Library-friendly hint while a heavy file is being worked on. */
  parseHint(): string {
    const name = this.file()?.name.toLowerCase() ?? '';
    if (name.endsWith('.pdf')) return ' (extracting text)';
    if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)) {
      return ' (running OCR — the engine downloads once on first use)';
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return ' (reading Excel)';
    return '';
  }

  onFileSelected(event: Event, input: HTMLInputElement): void {
    const picked = input.files?.[0];
    if (picked) this.startParse(picked);
    input.value = ''; // allow re-selecting the same file
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
      this.dragging.set(true);
    }
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) this.startParse(dropped);
  }

  setBackground(event: Event): void {
    if ((event.target as HTMLElement)?.closest('.import-card')) return;
    this.close.emit();
  }

  onMonthChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // '' (placeholder) or '01'..'12' are the only legal values.
    this.targetMonth.set(value === '' || /^\d{2}$/.test(value) ? value : '');
  }

  importLabel(): string {
    if (this.importing()) return 'Importing…';
    const n = this.entries().length;
    if (this.targetMonth() === '') {
      return `Pick the target month (required)`;
    }
    return `Import ${n} record${n === 1 ? '' : 's'} in ${this.targetLabel()}`;
  }

  /** Integer INR-style grouping for the preview totals. */
  money(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  setAssume(kind: ImportKind): void {
    this.assumeType.set(kind);
    this.entries.update(list =>
      list.map(e =>
        e.autoType
          ? { ...e, type: kind, autoType: false }
          : e
      )
    );
  }

  async startParse(file: File): Promise<void> {
    this.file.set(file);
    this.error.set('');
    this.entries.set([]);
    this.outcome.set(null);
    this.parsing.set(true);

    try {
      const outcome = await this.parser.parseFile(file, {
        year: this.year,
        // Rows without a readable date get a plausible date for the PREVIEW;
        // the import is still blocked until a target month is chosen.
        fallbackMonth:
          this.targetMonth() || this.monthsService.selectedMonth(),
        assumeType: 'expense',
      });
      this.outcome.set(outcome);
      this.entries.set(outcome.entries);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Could not read this file.'
      );
    } finally {
      this.parsing.set(false);
    }
  }

  async confirmImport(): Promise<void> {
    const list = this.entries();
    if (!list.length || this.importing()) return;
    this.importing.set(true);
    try {
      const count = this.transactions.importEntries(list);
      this.imported.emit({ count, month: this.targetMonth() });
    } finally {
      this.importing.set(false);
    }
  }
}
