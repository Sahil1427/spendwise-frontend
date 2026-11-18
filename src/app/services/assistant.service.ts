import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ASSISTANT_KNOWLEDGE,
  buildAssistantSystemPrompt,
  KnowledgeEntry,
} from './assistant-knowledge';
import { SettingsService } from './settings.service';
import { TransactionService, TransactionType } from './transaction.service';

export type AiProvider = 'openai' | 'gemini';

/** One-click backend choices shown in Settings (wire protocol in brackets). */
export type AiPreset = 'gemini' | 'openai' | 'groq' | 'openrouter';

export interface AiSettings {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AiReply {
  answer: string;
  /** 'ai' = a live model answered; 'local' = built-in knowledge base. */
  source: 'ai' | 'local';
}

interface HistoryTurn {
  from: 'user' | 'bot';
  text: string;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'how', 'what', 'when', 'where', 'who', 'why',
  'can', 'could', 'would', 'should', 'you', 'your', 'is', 'are', 'does',
  'about', 'this', 'that', 'me', 'my', 'a', 'an', 'it', 'in', 'on', 'of',
  'to', 'do', 'i',
]);

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9₹$]+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * The SpendWise assistant brain.
 *
 * Three modes:
 *  - TASKS (always on): phrases like "add income for PG, 1000, 13 Nov 2026"
 *    are parsed locally and executed on the spot via TransactionService —
 *    no AI needed, works offline. See runTask().
 *  - LOCAL (default for questions): keyword-scored retrieval over the
 *    built-in knowledge base. No requests leave the device.
 *  - AI: any OpenAI-compatible chat-completions endpoint configured in
 *    Settings (base URL + model + key). The knowledge base travels as the
 *    system prompt, so the model answers from verified app facts; on any
 *    failure the answer falls back to LOCAL automatically.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private static readonly STORAGE_KEY = 'spendwise-ai-settings';

  /** Task execution + formatting need the app's data services. */
  private readonly transactions = inject(TransactionService);
  private readonly settings = inject(SettingsService);

  readonly aiConfigured = signal<boolean>(this.loadSettings().apiKey !== '');
  readonly aiModel = computed(() => this.loadSettings().model);

  /** Draft fields for the Settings panel (mirror of the persisted values). */
  baseUrlDraft: string;
  modelDraft: string;
  apiKeyDraft: string;
  /** The settings dropdown value; the wire protocol is derived from it. */
  presetDraft: AiPreset;

  constructor() {
    const saved = this.loadSettings();
    this.baseUrlDraft = saved.baseUrl;
    this.modelDraft = saved.model;
    this.apiKeyDraft = saved.apiKey;
    this.presetDraft = saved.provider === 'gemini' ? 'gemini' : 'openai';
  }

  /**
   * One-click presets for the backend. Switching a preset re-fills the
   * base URL + model (the API key you typed is kept).
   */
  applyPreset(preset: AiPreset): void {
    // groq & openrouter speak the OpenAI wire protocol; only gemini differs.
    this.presetDraft = preset;
    switch (preset) {
      case 'gemini':
        // Free tier — Google AI Studio key, no credit card.
        // `…-latest` is a live alias: fixed names like gemini-2.0-flash
        // get retired by Google and start 404-ing.
        // Lite is the reliable free-tier pick (the plain flash family
        // intermittently 503/“high demand” for fresh accounts);
        // switch the Model field to gemini-flash-latest for the bigger
        // model if your key is established.
        this.baseUrlDraft = 'https://generativelanguage.googleapis.com/v1beta';
        this.modelDraft = 'gemini-flash-lite-latest';
        break;
      case 'groq':
        this.baseUrlDraft = 'https://api.groq.com/openai/v1';
        this.modelDraft = 'llama-3.3-70b-versatile';
        break;
      case 'openrouter':
        this.baseUrlDraft = 'https://openrouter.ai/api/v1';
        this.modelDraft = 'meta-llama/llama-3.3-70b-instruct:free';
        break;
      default:
        this.baseUrlDraft = 'https://api.openai.com/v1';
        this.modelDraft = 'gpt-4o-mini';
        break;
    }
  }

  private loadSettings(): AiSettings {
    const fallback: AiSettings = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: '',
    };
    try {
      const raw = localStorage.getItem(AssistantService.STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<AiSettings>;
      return {
        provider: parsed.provider === 'gemini' ? 'gemini' : 'openai',
        baseUrl:
          typeof parsed.baseUrl === 'string' && parsed.baseUrl
            ? parsed.baseUrl
            : fallback.baseUrl,
        model:
          typeof parsed.model === 'string' && parsed.model
            ? parsed.model
            : fallback.model,
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      };
    } catch {
      return fallback;
    }
  }

  private saveSettings(settings: AiSettings): void {
    try {
      localStorage.setItem(
        AssistantService.STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch {
      // Storage unavailable — the session still works via the drafts.
    }
    this.aiConfigured.set(settings.apiKey !== '');
  }

  saveFromDrafts(): void {
    this.saveSettings({
      provider: this.presetDraft === 'gemini' ? 'gemini' : 'openai',
      baseUrl: this.baseUrlDraft.trim() || 'https://api.openai.com/v1',
      model: this.modelDraft.trim() || 'gpt-4o-mini',
      apiKey: this.apiKeyDraft.trim(),
    });
  }

  clearKey(): void {
    this.apiKeyDraft = '';
    this.saveSettings({
      provider: this.presetDraft === 'gemini' ? 'gemini' : 'openai',
      baseUrl: this.baseUrlDraft.trim() || 'https://api.openai.com/v1',
      model: this.modelDraft.trim() || 'gpt-4o-mini',
      apiKey: '',
    });
  }

  /** Short status line for the assistant header. */
  statusLine(): string {
    if (this.aiConfigured()) {
      const settings = this.loadSettings();
      const host = settings.baseUrl.replace(/^https?:\/\//, '');
      return `AI connected · ${settings.model} @ ${host}`;
    }
    return 'Offline helper · free Gemini key in Settings';
  }

  // ------------------------------------------------------------ TASKS

  /** Month-name lookup for chat dates (jan..dec plus full names). */
  private static readonly MONTH_LOOKUP: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
  };

  private static monthName(n: number): string {
    return ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'][n - 1];
  }

  private localTodayISO(): string {
    const now = new Date();
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * Loose chat-date parser. Handles: "13th Nov 2026", "13 Nov", "Nov 13",
   * "13/11/2026", "13-11-26", "2026-11-13", "today", "tomorrow".
   * Returns { date, raw } where raw is the matched text (used to remove it
   * before amount scanning). Missing year → current year; a day beyond the
   * month's length is clamped to the last day.
   */
  private parseChatDate(text: string): { date: string; raw: string } | null {
    const lower = text.toLowerCase();
    const year = new Date().getFullYear();
    const pad = (v: number) => String(v).padStart(2, '0');

    const clampDay = (y: number, m: number, d: number): number =>
      Math.min(Math.max(d, 1), new Date(y, m, 0).getDate());
    /** '' or '26' or '2026' → a full year (2-digit → 20xx). */
    const normYear = (ym: string, fallback: number): number => {
      if (!ym) return fallback;
      const n = Number(ym);
      return ym.length === 2 ? 2000 + n : n;
    };

    // Only real month names may fill the month slot — any word would make
    // "1000 one" or "13 date" parse as dates.
    const MM =
      'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

    const build = (day: number, month: number, y: number, raw: string) =>
      month >= 1 && month <= 12
        ? { date: `${y}-${pad(month)}-${pad(clampDay(y, month, day))}`, raw }
        : null;

    if (/\btoday\b/i.test(text)) {
      const d = this.localTodayISO();
      return { date: d, raw: 'today' };
    }
    if (/\btomorrow\b/i.test(text)) {
      const now = new Date();
      now.setDate(now.getDate() + 1);
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { date, raw: 'tomorrow' };
    }

    // "13th Nov 2026" / "13 Nov 26"
    let m = lower.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MM})\\s*,?\\s*(\\d{4}|\\d{2})?(?![\\d])`));
    if (m) {
      const r = build(Number(m[1]), AssistantService.MONTH_LOOKUP[m[2]], normYear(m[3] ?? '', year), m[0]);
      if (r) return r;
    }
    // "Nov 13" / "November 13th"
    m = lower.match(new RegExp(`(${MM})\\s+(\\d{1,2})(?:st|nd|rd|th)?`));
    if (m) {
      const r = build(Number(m[2]), AssistantService.MONTH_LOOKUP[m[1]], year, m[0]);
      if (r) return r;
    }
    // "13/11/2026" or "13-11-26" (D/M first — Indian format)
    m = lower.match(/(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}|\d{2}))?/);
    if (m) {
      const r = build(Number(m[1]), Number(m[2]), normYear(m[3] ?? '', year), m[0]);
      if (r) return r;
    }
    // "2026-11-13"
    m = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const r = build(Number(m[3]), Number(m[2]), Number(m[1]), m[0]);
      if (r) return r;
    }
    return null;
  }

  /** Map the free "name" of a record to an existing default category. */
  private categoryFor(type: TransactionType, text: string): string {
    const income: Array<[RegExp, string]> = [
      [/salary|wage|payroll|stipend/i, 'Salary'],
      [/rent\b|tenant|rental|\bpg\b|paying guest|room/i, 'Rental Income'],
      [/freelanc/i, 'Freelance'],
      [/invest|dividend/i, 'Investments'],
      [/interest/i, 'Interest'],
      [/gift|bonus|refund/i, 'Gifts Received'],
    ];
    const expense: Array<[RegExp, string]> = [
      [/rent\b|tenant|\bpg\b/i, 'Rent'],
      [/home\s*emi/i, 'Home EMI'],
      [/car\s*emi/i, 'Car EMI'],
      [/em/i, 'Home EMI'],
      [/grocer/i, 'Groceries'],
      [/fuel|petrol|diesel|cng/i, 'Fuel'],
      [/transport|travel\s*fare|uber|ola|cab|auto\b|bus|metro|rail/i, 'Transportation'],
      [/food|meal|lunch|dinner|breakfast|chai|tea\s*shop|restaurant|dining/i, 'Food & Dining'],
      [/pharmacy|medicine|doctor|doctor|hospital|health/i, 'Healthcare'],
      [/electricity|bills?\b|water\s*b|utility/i, 'Utilities'],
      [/shop|cloth|apparel|sneaker/i, 'Shopping'],
      [/movie|cinema|entertainment|game/i, 'Entertainment'],
      [/subscri|netflix|spotify|prime/i, 'Subscriptions'],
      [/trip|holiday|flight|hotel/i, 'Travel'],
      [/school|fees|education|tuition|course/i, 'Education'],
      [/insurance|policy/i, 'Insurance'],
    ];
    const table = type === 'income' ? income : expense;
    for (const [re, cat] of table) if (re.test(text)) return cat;
    return type === 'income' ? 'Business' : 'Other Expenses';
  }

  /**
   * Runs the user's own action requests (today: adding a record).
   * Returns the assistant's reply when the message is a task; null when it
   * is not one (the normal answer flow then handles it), so callers can
   * simply prefer the task result.
   */
  runTask(text: string): string | null {
    // 1) Intent: only act when the user explicitly wants something written.
    if (!/\b(add|log|record|note|create|enter|put)\b/i.test(text)) {
      return null;
    }

    const incomeRe = /\b(income|earning|earn|salary|credit|deposited?|received|payout|remittance)\b/i;
    const expenseRe = /\b(expense|expenses|spending|spends?|paid|purchase|bought|buy|billed?|debit|spent)\b/i;
    const hasIncome = incomeRe.test(text);
    const hasExpense = expenseRe.test(text);

    // A pure question ("How do I add a record?") is answered, not executed.
    const hasNumbers = /\d/.test(text);
    if (text.includes('?') && !hasIncome && !hasExpense && !hasNumbers) {
      return null;
    }

    // 2) Type — explicit keyword wins; first mention wins on ties.
    let type: TransactionType | null = null;
    if (hasIncome || hasExpense) {
      // Whichever keyword appears first in the sentence wins the tie.
      // (search() returns -1 for "no match"; map that to Infinity.)
      const incomeIndex = hasIncome ? text.search(incomeRe) : Infinity;
      const expenseIndex = hasExpense ? text.search(expenseRe) : Infinity;
      type = incomeIndex <= expenseIndex ? 'income' : 'expense';
    }

    if (type === null) {
      return 'Sure — tell me which way the money moved: "add income …" or "add expense …" (amount + date is also useful).';
    }

    // 3) Date (optional — defaults to today).
    const parsedDate = this.parseChatDate(text);
    const date = parsedDate?.date ?? this.localTodayISO();

    // 4) Amount — first number after removing the date text (case-
    // insensitive: the raw match came from a lowercased scan).
    const dateRawEscaped = parsedDate
      ? new RegExp(
          parsedDate.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        )
      : null;
    const withoutDate = dateRawEscaped ? text.replace(dateRawEscaped, ' ') : text;
    const amountMatch = withoutDate.replace(/[₹$€]/g, ' ').match(/(\d[\d,]*(?:\.\d+)?)/);
    const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN;

    // 5) Name — "for PG", "called chai" etc.
    // Stops at punctuation/whitespace runs: "." and friends are NOT part
    // of a name, otherwise "for PG. Amount is 1000" captured everything.
    const nameMatch = text.match(
      /\b(?:for|called|named|titled)\s+((?:[a-z0-9&'+*-]\s?){1,24})/i
    );
    let name = '';
    if (nameMatch) {
      const skip = /^(amount|amt|amt$|date|on|the|a|an|rs|inr|for|usd|eur|today|tomorrow|\.)$/i;
      name = nameMatch[1]
        .split('\s+')
        .filter(w => w && !skip.test(w))
        .slice(0, 4)
        .join(' ')
        .replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '');
    }

    // Missing pieces → ask for exactly what's absent.
    const missing: string[] = [];
    if (!Number.isFinite(amount) || amount <= 0) missing.push('amount');
    if (missing.length) {
      const missingList = missing.join(' and ');
      return `Almost — I still need the ${missingList}. Example: "add ${type} 1000 for PG on 13 Nov 2026".`;
    }

    // 6) Execute.
    const category = this.categoryFor(type, text);
    const future = date > this.localTodayISO();
    this.transactions.addTransaction({
      type,
      amount: Math.round(amount * 100) / 100,
      category,
      date,
      ...(name ? { name } : {}),
      description: 'Added via the assistant chat.',
      ...(future
        ? {
            plannerState: 'pending' as const,
            plannerDueDate: date,
            rescheduleHistory: [] as Array<{ fromDate: string; toDate: string; changedAt: string }>,
            notificationSeen: true,
          }
        : {}),
    });

    // 7) Confirm — with the record's stamp, so no ambiguity.
    const [yy, mm, dd] = date.split('-');
    const dateLabel = `${dd} ${AssistantService.monthName(Number(mm))} ${yy}`;
    const currency = this.settings.currency();
    const value = this.settings.formatAmount(amount, currency);
    let reply =
      `✅ Done — ${type} of ${value} ` +
      (name ? `("${name}") ` : '') +
      `in ${category} on ${dateLabel}. ` +
      (future
        ? 'Future-dated, so it is filed as a Pending planner activity.'
        : `It is in History for ${AssistantService.monthName(Number(mm))} on this device.`);
    reply += ` Stored in ${currency} (the active currency).`;
    return reply;
  }

  // ------------------------------------------------------------ LOCAL

  localAnswer(text: string): { answer: string; matched: boolean } {
    const trimmed = text.trim();
    // A bare greeting deserves a greeting, not the whole help menu.
    if (
      /^(hi+|hiya|hello+|hey+|yo|hola|namaste|good\s+(morning|afternoon|evening))\b/i.test(
        trimmed
      ) &&
      trimmed.split(/\s+/).length <= 4
    ) {
      return {
        answer:
          'Hey! 👋 Ask me anything about SpendWise — how a screen works, a '
          + 'term you see on the UI, or the import flow. I can also walk you ' +
          'on the guided tour (👋 chip below).',
        matched: true,
      };
    }

    const lowered = text.toLowerCase();

    let best: KnowledgeEntry | null = null;
    let bestScore = 0;

    for (const entry of ASSISTANT_KNOWLEDGE) {
      let score = 0;

      // Exact keyword hits weigh most.
      for (const keyword of entry.keywords) {
        if (lowered.includes(keyword)) {
          score += keyword.length > 4 ? 3 : 2;
        }
      }

      // Partial overlap between the question and the entry's words
      // catches phrasing the keyword list missed.
      const questionTokens = tokensOf(text);
      const entryWords = new Set(tokensOf(entry.question + ' ' + entry.keywords.join(' ')));
      for (const token of new Set(questionTokens)) {
        if (entryWords.has(token)) score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    if (best && bestScore >= 2) {
      return { answer: best.answer, matched: true };
    }

    return {
      answer:
        'I could not match that to a specific topic yet. Ask me about: ' +
        'adding or importing records · dashboard cards · the savings cap · ' +
        'months · currency · reports · themes · where data is stored · ' +
        'login — or tap a quick chip below. With an AI key connected I also ' +
        'understand free-form phrasing.',
      matched: false,
    };
  }

  // ----------------------------------------------------------------- AI

  async ask(text: string, history: HistoryTurn[]): Promise<AiReply> {
    if (!this.aiConfigured()) {
      return { answer: this.localAnswer(text).answer, source: 'local' };
    }

    const settings = this.loadSettings();

    // The most recent turns (the welcome bubble is filtered out by callers).
    const turns = history
      .slice(-8)
      .filter(turn => turn.text.trim())
      .map(turn => ({ from: turn.from, text: turn.text }));

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 45000);

    try {
      const { url, headers, body, extract } =
        settings.provider === 'gemini'
          ? this.geminiRequest(settings, text, turns)
          : this.openAiRequest(settings, text, turns);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      const content = extract(payload).trim();

      if (!content) {
        throw new Error('empty response');
      }

      return { answer: content, source: 'ai' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'network error';
      const local = this.localAnswer(text);
      return {
        answer:
          `⚙️ My AI endpoint did not answer (${detail}) — here is the ` +
          `built-in answer instead:\n\n${local.answer}`,
        source: 'local',
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  private openAiRequest(
    settings: AiSettings,
    text: string,
    turns: { from: 'user' | 'bot'; text: string }[]
  ) {
    return {
      url: settings.baseUrl.replace(/\/+$/, '') + '/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: {
        model: settings.model,
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: 'system', content: buildAssistantSystemPrompt() },
          ...turns.map(turn => ({
            role: turn.from === 'user' ? 'user' : 'assistant',
            content: turn.text,
          })),
          { role: 'user', content: text },
        ],
      },
      extract: (payload: unknown): string => {
        const p = payload as {
          choices?: { message?: { content?: string } }[];
        };
        return p.choices?.[0]?.message?.content ?? '';
      },
    };
  }

  private geminiRequest(
    settings: AiSettings,
    text: string,
    turns: { from: 'user' | 'bot'; text: string }[]
  ) {
    const base = settings.baseUrl.replace(/\/+$/, '');
    return {
      url: `${base}/models/${settings.model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        systemInstruction: { parts: [{ text: buildAssistantSystemPrompt() }] },
        contents: [
          ...turns.map(turn => ({
            role: turn.from === 'user' ? 'user' : 'model',
            parts: [{ text: turn.text }],
          })),
          { role: 'user', parts: [{ text }] },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      },
      extract: (payload: unknown): string => {
        const p = payload as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const parts = p.candidates?.[0]?.content?.parts ?? [];
        return parts.map(part => part.text ?? '').join('');
      },
    };
  }
}
