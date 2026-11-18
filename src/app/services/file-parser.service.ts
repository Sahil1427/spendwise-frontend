import { Injectable } from '@angular/core';

export type ImportKind = 'income' | 'expense';

export interface ImportEntry {
  date: string; // YYYY-MM-DD
  type: ImportKind;
  amount: number; // always positive
  category: string;
  description: string;
  /** true when the type came from the import-level "assume as" toggle */
  autoType: boolean;
}

export interface ParseOutcome {
  entries: ImportEntry[];
  source: string;
  noTypeColumn: boolean;
  warnings: string[];
}

interface ImportOpts {
  year: number;
  /** '01'..'12' — month used when a row has no usable date */
  fallbackMonth: string;
  assumeType: ImportKind;
}

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function p2(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${p2(m)}-${p2(d)}`;
}

/**
 * Loose date parsing for client sheets / statements:
 *  ISO (2026-11-05), DD/MM(/|.|-)YYYY, DD-MM 2-digit, D Mon [YYYY],
 *  Mon D [YYYY], and Excel serial numbers. Ambiguous day/month pairs
 *  default to DD/MM (app runs in an INR context by default).
 */
function parseLooseDate(raw: unknown, year: number, fallbackMonth: string): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Excel serial number
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) {
      const iso = new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString();
      return validDate(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
    }
    return null;
  }

  // ISO
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or MM/DD/YYYY
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    let yr = +m[3];
    if (yr < 100) yr += 2000;
    // If exactly one side is <= 12 it decides; otherwise assume DD/MM.
    if (a <= 12 && b > 12) return validDate(yr, a, b);
    return validDate(yr, b, a);
  }

  // DD/MM without year
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (a <= 31 && b <= 12) {
      return validDate(year, b, a) ?? validDate(year, fallbackMonth ? +fallbackMonth : 1, 1);
    }
    return null;
  }

  // "5 Nov 2026" / "5 Nov 26"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})(?:,?\s*(\d{2,4}))?$/);
  if (m) {
    const idx = MONTH_ABBR.findIndex(x => m![2].toLowerCase().startsWith(x));
    if (idx >= 0) {
      let yr = m[3] ? +m[3] : year;
      if (yr < 100) yr += 2000;
      return validDate(yr, idx + 1, +m[1]);
    }
  }

  // "Nov 5, 2026" / "November 5"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{2,4}))?$/);
  if (m) {
    const idx = MONTH_ABBR.findIndex(x => m![1].toLowerCase().startsWith(x));
    if (idx >= 0) {
      let yr = m[3] ? +m[3] : year;
      if (yr < 100) yr += 2000;
      return validDate(yr, idx + 1, +m[2]);
    }
  }

  return null;
}

function parseAmountCell(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.abs(raw) : null;
  }
  let s = String(raw).replace(/[₹$€£\s]/g, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.abs(parseFloat(s));
}

function typeFromCell(raw: unknown): ImportKind | null {
  const v = String(raw).toLowerCase().trim();
  if (!v) return null;
  if (/^(income|in|credit|cr|salary|deposit|refund)$/.test(v) || /income|credit|salary/.test(v)) return 'income';
  if (/^(expense|expenditure|out|debit|dr|payment|withdrawal)$/.test(v) || /expense|debit|payment|withdraw/.test(v)) return 'expense';
  return null;
}

interface ColumnMap {
  date: number | null;
  type: number | null;
  amount: number | null;
  category: number | null;
  desc: number | null;
}

/**
 * Client-side file → importable records.
 *
 * Supported sources:
 *  - CSV / TSV / TXT / JSON — tabular (header-sniffed) or line-based scan
 *  - XLSX / XLS (Excel)     — first sheet, header sniffed
 *  - PDF                   — text layer, line scan
 *  - PNG / JPG / … images  — Tesseract OCR (runs in the browser), line scan
 *
 * Heavy libraries are lazy-loaded only when a file of that kind arrives,
 * so they never enter the dashboard chunk.
 */
@Injectable({ providedIn: 'root' })
export class FileParserService {
  async parseFile(file: File, opts: ImportOpts): Promise<ParseOutcome> {
    const name = file.name.toLowerCase();

    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsb')) {
      return this.fromExcel(file, opts);
    }
    if (name.endsWith('.pdf')) {
      return this.fromPdf(file, opts);
    }
    if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name)) {
      return this.fromImage(file, opts);
    }

    const text = await file.text();
    if (name.endsWith('.json') || /^\s*[[{]/.test(text)) {
      const asJson = this.tryJson(text, opts);
      if (asJson) return asJson;
    }
    return this.fromText(text, opts, name.endsWith('.csv') || name.endsWith('.tsv') ? 'csv' : 'text');
  }

  // ---------------------------------------------------------------- XLSX

  private async fromExcel(file: File, opts: ImportOpts): Promise<ParseOutcome> {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('The workbook has no sheets.');
    // raw:true keeps Excel serial dates as numbers (parseLooseDate handles
    // them); formatted strings are locale-dependent and far less reliable.
    const rows = XLSX.utils.sheet_to_json(
      wb.Sheets[sheetName],
      { header: 1, raw: true, defval: '' }
    ) as unknown as unknown[][];
    const stringRows = rows.map(r => (Array.isArray(r) ? r.map(c => (c === null ? '' : String(c))) : []));
    return this.fromRows(stringRows, opts, 'excel');
  }

  // ----------------------------------------------------------------- PDF

  private async fromPdf(file: File, opts: ImportOpts): Promise<ParseOutcome> {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;

    let text = '';
    const pages = Math.min(doc.numPages, 60);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // Rebuild visual lines from text runs (bank statements are columns).
      const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
      for (const item of tc.items as Array<{ transform: number[]; str: string }>) {
        const x = item.transform[4];
        const y = item.transform[5];
        let line = lines.find(l => Math.abs(l.y - y) < 2.5);
        if (!line) {
          line = { y, parts: [] };
          lines.push(line);
        }
        line.parts.push({ x, s: item.str });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const line of lines) {
        line.parts.sort((a, b) => a.x - b.x);
        let s = '';
        let lastX = -999;
        for (const part of line.parts) {
          s += part.x - lastX > 10 ? '  ' + part.s : (s ? ' ' + part.s : part.s);
          lastX = part.x + part.s.length * 4.2;
        }
        text += s + '\n';
      }
      text += '\n';
    }

    const outcome = this.linesToEntries(text, opts, 'pdf');
    if (!outcome.entries.length) {
      throw new Error(
        'No entries could be read from this PDF. If it is a scanned document, export a text PDF (or a screenshot as an image).'
      );
    }
    return outcome;
  }

  // --------------------------------------------------------------- IMAGE

  private async fromImage(file: File, opts: ImportOpts): Promise<ParseOutcome> {
    const T = await import('tesseract.js');
    const worker = await T.createWorker('eng', 1, { logger: () => undefined });
    try {
      const { data } = await worker.recognize(file as unknown as string);
      const outcome = this.linesToEntries(String(data?.text ?? ''), opts, 'image');
      if (!outcome.entries.length) {
        throw new Error('OCR could not find any amount lines in this image. Try a sharper, front-facing photo of the sheet.');
      }
      return outcome;
    } finally {
      await worker.terminate();
    }
  }

  // ---------------------------------------------------------------- TEXT

  private fromText(text: string, opts: ImportOpts, source: 'csv' | 'text'): ParseOutcome {
    const trimmed = text.trimStart();

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const asJson = this.tryJson(trimmed, opts);
      if (asJson) return asJson;
    }

    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    const delim = this.detectDelimiter(lines);
    if (delim) {
      const rows = lines.map(l => this.csvLine(l, delim));
      const multiCol = rows.filter(r => r.length >= 2).length;
      if (multiCol >= Math.max(2, rows.length * 0.35)) {
        return this.fromRows(rows, opts, source === 'csv' ? 'csv' : 'text table');
      }
    }

    const outcome = this.linesToEntries(text, opts, source === 'text' ? 'text' : 'csv rows');
    if (!outcome.entries.length) {
      throw new Error("Couldn't read any records. Expected rows like 'date | description | amount' or a column named 'amount'.");
    }
    return outcome;
  }

  private tryJson(text: string, opts: ImportOpts): ParseOutcome | null {
    try {
      const data: unknown = JSON.parse(text);
      const root = data as Record<string, unknown>;
      let arr: unknown[] | null = null;
      if (Array.isArray(data)) arr = data;
      else if (root) {
        for (const key of ['records', 'transactions', 'data', 'items', 'entries', 'rows']) {
          if (Array.isArray(root[key])) {
            arr = root[key] as unknown[];
            break;
          }
        }
      }
      if (!arr || !arr.length) return null;

      const first = arr.find(o => o && typeof o === 'object');
      if (!first) return null;
      const keys = Object.keys(first);
      const rows = arr.map(o =>
        o && typeof o === 'object'
          ? keys.map(k => {
              const v = (o as Record<string, unknown>)[k];
              return v === null || v === undefined ? '' : String(v);
            })
          : []
      );
      return this.fromRows([keys, ...rows], opts, 'json');
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------- TABLES

  private mapHeaders(row: string[]): ColumnMap | null {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const map: ColumnMap = { date: null, type: null, amount: null, category: null, desc: null };
    row.forEach((cell, i) => {
      const n = norm(String(cell));
      if (!n) return;
      if (map.amount === null && /amount|amt|total|value|price|cost/.test(n)) map.amount = i;
      else if (map.type === null && /^(type|kind|entrytype|direction|inout)$|^in|^out$/.test(n)) map.type = i;
      else if (map.date === null && /date|time$|timestamp|day$|posted|when$/.test(n)) map.date = i;
      else if (map.category === null && /category|group$|section|tag$|label$/.test(n)) map.category = i;
      else if (map.desc === null && /desc|detail|note$|memo|name$|comment|title|payee|narrat|particular/.test(n)) map.desc = i;
    });
    if (map.amount === null) return null;
    if (map.date === null && map.desc === null) return null;
    return map;
  }

  private fromRows(rows: string[][], opts: ImportOpts, source: string): ParseOutcome {
    const warnings: string[] = [];
    let map: ColumnMap | null = null;
    let headerIdx = -1;

    const scan = Math.min(rows.length, 15);
    for (let i = 0; i < scan; i++) {
      const candidate = this.mapHeaders(rows[i] ?? []);
      if (candidate) {
        map = candidate;
        headerIdx = i;
        break;
      }
    }
    if (!map || headerIdx === -1) {
      throw new Error(
        "Couldn't find a 'Amount' (or Date/Description) column in the first rows. Rename the headers to e.g. Date / Description / Category / Amount."
      );
    }

    const entries: ImportEntry[] = [];
    let skipped = 0;
    const fallbackDate = `${opts.year}-${opts.fallbackMonth}-01`;

    for (let i = headerIdx + 1; i < rows.length && entries.length < 500; i++) {
      const row = rows[i];
      if (!row || row.every(c => String(c).trim() === '')) continue;

      const amountRaw = map.amount !== null ? row[map.amount] : '';
      const amount = parseAmountCell(amountRaw);
      if (amount === null || amount === 0) {
        if (String(amountRaw).trim() !== '') skipped++;
        continue;
      }

      let date: string | null = null;
      if (map.date !== null) date = parseLooseDate(row[map.date], opts.year, opts.fallbackMonth);
      if (!date) date = fallbackDate;

      const typeCell = map.type !== null ? typeFromCell(row[map.type]) : null;
      const negative = String(amountRaw).trim().startsWith('-');
      const desc = map.desc !== null ? String(row[map.desc] ?? '').trim() : '';
      const category =
        (map.category !== null ? String(row[map.category] ?? '').trim() : '') || 'Imported';

      // No explicit type: negative → expense, otherwise look for clear
      // income keywords in the row text, otherwise the assume toggle.
      let type: ImportKind;
      let autoType = false;
      if (typeCell) {
        type = typeCell;
      } else if (negative) {
        type = 'expense';
      } else if (
        /salary|credit|invoice|payroll|refund|bonus|dividend|payout|interest|wage|stipend/i.test(
          `${desc} ${category}`
        )
      ) {
        type = 'income';
      } else {
        type = opts.assumeType;
        autoType = true;
      }

      entries.push({
        date,
        type,
        amount,
        category,
        description: desc,
        autoType,
      });
    }

    if (skipped) warnings.push(`${skipped} row(s) without a usable amount were skipped.`);
    if (!entries.length) {
      throw new Error('No data rows with amounts were found below the header.');
    }
    return { entries, source, noTypeColumn: map.type === null, warnings };
  }

  // ---------------------------------------------------------- LINE SCAN

  /**
   * For PDF text, OCR text and plain-text dumps: each line is scanned for a
   * date + a monetary amount; everything between becomes the description.
   */
  private linesToEntries(text: string, opts: ImportOpts, source: string): ParseOutcome {
    const entries: ImportEntry[] = [];
    const fallbackDate = `${opts.year}-${opts.fallbackMonth}-01`;

    const dateRe =
      /\b\d{1,2}[/\-.]\d{1,2}(?:[/\-.]\d{2,4})?\b|\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]{0,3}(?:,?\s*\d{2,4})?\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]{0,3}\.?\s+\d{1,2}(?:,?\s*\d{2,4})?\b/;
    const amountRe = /-?\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\b/;

    for (const rawLine of text.split(/\r\n|\n|\r/)) {
      const line = rawLine.replace(/\t/g, '  ').trim();
      if (!line || entries.length >= 500) continue;
      if (/^[\s\-_=|,;#]{3,}$/.test(line)) continue;
      if (/^\d{1,5}$/.test(line)) continue; // bare numbers (page numbers, indexes)
      if (/(date|particular|description|remarks)\b.{0,40}\b(amount|value)\b/i.test(line) && line.length < 140) continue;
      if (/^(total|grand\s*total|net|sub\s*-?\s*total)\b/i.test(line)) continue;

      const dm = line.match(dateRe);
      const date =
        (dm && parseLooseDate(dm[0], opts.year, opts.fallbackMonth)) ||
        parseLooseDate(line, opts.year, opts.fallbackMonth) ||
        fallbackDate;

      // Collect amount candidates, ignoring anything inside the date match.
      const candidates: { index: number; value: number; negative: boolean }[] = [];
      const am = amountRe;
      am.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = am.exec(line)) !== null) {
        const start = m.index;
        const dateStart = dm?.index ?? -1;
        const dateEnd = dateStart + (dm?.[0].length ?? 0);
        const inDate = dateStart >= 0 && start >= dateStart && start < dateEnd;
        if (inDate) continue;
        const token = m[0];
        const value = parseAmountCell(token);
        if (value === null || value < 1) continue;
        const negative =
          line[start - 1] === '-' ||
          /^\(.*\)$/.test(token) ||
          /-\s*$/.test(line.slice(start, start + token.length + 2));
        candidates.push({ index: start, value, negative });
      }
      if (!candidates.length) continue;
      // Prefer the LAST strong candidate (statements put amounts right).
      const pick =
        [...candidates].reverse().find(c => c.value >= 1) ?? candidates[candidates.length - 1];

      // Type: keywords first, then sign, then the assume toggle.
      const kw =
        /salary|credit|deposit|income|refund|interest\s*received/i.test(line)
          ? 'income'
          : /debit|withdraw|payment|upi|swiped?|cash\s*out|to\s+(?:hdfc|icic|sbi|axis|kotak)/i.test(line)
            ? 'expense'
            : null;

      let type: ImportKind;
      let autoType = false;
      if (kw) type = kw;
      else if (pick.negative) type = 'expense';
      else {
        type = opts.assumeType;
        autoType = true;
      }

      // Description = line with the date and the chosen amount removed.
      let desc = dm ? line.replace(dm[0], ' ') : line;
      desc = desc
        .replace(pick.value.toString(), ' ')
        .replace(/[|;•\u00a0]+/g, ' ')
        .replace(/[-—–\s]{2,}/g, ' ')
        .trim()
        .replace(/^[-—–:,.]+|[-—–:,.]+$/g, '')
        .trim();
      const description = desc.length >= 3 ? desc.slice(0, 90) : '';

      entries.push({
        date,
        type,
        amount: pick.value,
        category: 'Imported',
        description,
        autoType,
      });
    }

    return { entries, source, noTypeColumn: true, warnings: [] };
  }

  // ------------------------------------------------------------- HELPERS

  private detectDelimiter(lines: string[]): string | null {
    let best: string | null = null;
    let bestCount = 0;
    for (const d of [',', ';', '\t', '|']) {
      const total = lines
        .slice(0, 25)
        .reduce((sum, l) => sum + (l.split(d).length - 1), 0);
      if (total > bestCount) {
        bestCount = total;
        best = d;
      }
    }
    return bestCount >= 2 ? best : null;
  }

  private csvLine(line: string, delim: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else inQuotes = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }
}
