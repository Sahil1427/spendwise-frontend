/**
 * SpendWise assistant knowledge base.
 *
 * Powers both the offline fallback (keyword-matched local answers) and the
 * AI mode (this document becomes the system prompt, so the model always
 * answers from the same verified facts about the app).
 *
 * Keep entries current whenever a feature changes.
 */
export interface KnowledgeEntry {
  /** Loose keywords used by the offline matcher (lowercased substrings). */
  keywords: string[];
  /** Short heading, used to build the AI system prompt. */
  question: string;
  answer: string;
}

export const ASSISTANT_KNOWLEDGE: KnowledgeEntry[] = [
  {
    keywords: ['add income', 'add expense', 'ask you to add', 'do things', 'tasks', 'for me', 'create a record', 'make a record', 'on your own', 'by yourself'],
    question: 'Can the assistant add a record for me (do things, not just tell me)?',
    answer:
      'Yes — hands-on, not just words. Say: "add income 1000 for PG on 13 Nov 2026", ' +
      '"add expense 40 for chai today", "log money 2000 for rent 1st"... I parse the ' +
      'type, amount, name and date (today/tomorrow/"13 Nov"/"13-11-2026" all work), ' +
      'create the record immediately in the active currency, pick the matching ' +
      'category, and confirm right here. Future dates go to the planner as Pending. ' +
      'If something is missing I ask for exactly that. This works offline too — ' +
      'no AI key required for tasks.',
  },
  {
    keywords: ['what is', 'about', 'spendwise', 'app', 'overview'],
    question: 'What is SpendWise?',
    answer:
      'SpendWise is a local-first personal finance tracker. You sign in, record ' +
      'income and expenses for the current year, and the dashboard, history and ' +
      'reports show everything month by month. No data leaves the device: your ' +
      'records are stored in the browser (localStorage), not on a server.',
  },
  {
    keywords: ['login', 'log in', 'sign in', 'password', 'credential', 'user name', 'sahil', 'pass123'],
    question: 'How do I log in? What are the credentials?',
    answer:
      'The demo account is username "sahil" and password "pass123". The session ' +
      'is remembered in this browser, so a normal reload keeps you signed in. ' +
      'Log out is in the round "S" menu at the top right.',
  },
  {
    keywords: ['data stored', 'where is my data', 'database', 'server', 'storage', 'localStorage', 'local', 'backup', 'sync', 'another device', 'other browser', 'empty in chrome', 'lost my data'],
    question: 'Where is my data stored? Why is it empty in another browser?',
    answer:
      'All records live in this browser profile only (localStorage) — SpendWise ' +
      'has no cloud sync and no shared database. That is why the same machine in ' +
      'a different browser (or an incognito window) looks empty: it has its own ' +
      'storage. To bring any browser up to speed, open Settings → Local data and ' +
      'press "Load demo data", or import your own files from the Dashboard.',
  },
  {
    keywords: ['month', 'year', 'why only this year', 'december', 'select month', 'previous month', 'current month'],
    question: 'How does month selection work?',
    answer:
      'Every tab (Dashboard, Add, History, Reports) shares ONE month selector, so ' +
      'switching tabs never changes the month. The app supports the current year ' +
      'only (January–December). On every login the selection snaps back to the ' +
      'month that is currently running, so a stale saved month can never hide ' +
      'today’s data.',
  },
  {
    keywords: ['dashboard', 'home', 'summary', 'cards', 'net balance', 'savings rate'],
    question: 'What does the Dashboard show?',
    answer:
      'For the selected month: a Net balance card, tappable Income and Expenses ' +
      'cards (they open an itemised popup), a Savings rate card, a Savings cap ' +
      'card with a progress bar, a Positive/Negative status banner, a "Spending ' +
      'breakdown" pie by category, a 12-month Income vs Expenses comparison and ' +
      'the recent transactions of that month.',
  },
  {
    keywords: ['add', 'add transaction', 'new record', 'record', 'income', 'expense', 'save'],
    question: 'How do I add an income or expense?',
    answer:
      'Open "Add Transaction" (sidebar or dashboard button). One flat form: pick ' +
      'Income or Expense, a category (or create a new one), an optional name and ' +
      'description, the amount, and a date. Save keeps the form open so you can ' +
      'log several records back to back; Clear empties it. The record is stamped ' +
      'with the active currency at save time.',
  },
  {
    keywords: ['history', 'edit', 'delete', 'locked', 'pencil', 'search', 'filter'],
    question: 'How do I view, edit or delete records? (History)',
    answer:
      'History lists the selected month with search and an All/Income/Expenses ' +
      'filter. Recent records open the ✎ editor; older months are locked for ' +
      'editing (so history stays honest) but records can still be deleted. ' +
      'Editing never changes the currency a record was saved with.',
  },
  {
    keywords: ['report', 'reports', 'analytics', 'comparison', 'previous month', 'comparison', 'table', 'trend'],
    question: 'What do Reports contain?',
    answer:
      'Reports digs into the selected month: a comparison with the previous ' +
      'month including % change, itemised income and expense lines, spending by ' +
      'category, and the full 12-month yearly table. This is also where you ' +
      'review old months — just pick the month in the selector.',
  },
  {
    keywords: ['import', 'csv', 'excel', 'xlsx', 'pdf', 'image', 'photo', 'ocr', 'client file', 'upload', 'text file'],
    question: "How do I import a client's data file?",
    answer:
      'On the Dashboard press "Import client data". Choose the target month — ' +
      'it is REQUIRED — then drop or browse a file: Excel (.xlsx/.xls), CSV, ' +
      'TSV, TXT, JSON, PDF, or an image (a photo of a sheet, read by OCR in ' +
      'the browser). You get a preview table with totals before anything is ' +
      'saved. Headed spreadsheets are column-matched (date/type/category/' +
      'amount); unstructured files are scanned line by line; the "treat ' +
      'amounts as" toggle sets the type when the file has no type column.',
  },
  {
    keywords: ['savings cap', 'saving cap', 'cap', 'goal', 'target'],
    question: 'What is the savings cap?',
    answer:
      'The savings cap is your monthly saving target, set in Settings → ' +
      'Savings cap. The Dashboard shows your progress toward it with a ' +
      'progress bar ("N left of X" / "Cap reached ✓"), and the Positive/' +
      'Negative banner compares the month’s income against its expenses.',
  },
  {
    keywords: ['positive', 'negative', 'profit', 'loss', 'status', 'banner'],
    question: 'What does the Positive / Negative banner mean?',
    answer:
      'It is the month’s financial status. Positive (green): income covered ' +
      'every expense — "you saved ₹X in {month}". Negative (red): spending ' +
      'ran ahead of income by that amount. It is computed only when the ' +
      'month has records.',
  },
  {
    keywords: ['calculator', 'calc', 'calculate', 'basic calculations', 'math', 'arithmetic', 'quick math'],
    question: 'Is there a calculator in the app?',
    answer:
      'Yes — the round calculator icon in the top bar (next to the Convert ' +
      'pill) opens a pop-up calculator. Full basic arithmetic: + − × ÷, ' +
      'percent, ±, backspace and C, with the running expression shown above ' +
      'the result. Percent is share-of: "12% of 4500?" is typed 4500 × 12 % ' +
      '→ 540. Press Esc or click outside to close it anytime.',
  },
  {
    keywords: ['currency', 'country', 'region', 'inr', 'usd', '₹', '$', 'symbol'],
    question: 'How do currency and country work?',
    answer:
      'Settings holds a country (18, with flags) and a currency (22 codes). ' +
      'Choosing a country applies its default currency. New records are ' +
      'stamped with the ACTIVE currency, existing records always keep their ' +
      'own and show a small currency chip when it differs. Need numbers in ' +
      'another currency? Use the Convert pill (top right) — rates there are ' +
      'LIVE market values refreshed every day — and when your active ' +
      'currency differs from your country\'s, the Add form offers a ' +
      '"save converted in my country\'s currency" checkbox.',
  },
  {
    keywords: ['convert', 'converter', 'exchange rate', 'how much is 1 rupee', 'dollars', 'dollar value', 'calculator', 'currency values', 'currency calculator'],
    question: 'How do I convert between currencies (e.g. 1 rupee in dollars)?',
    answer:
      'Press the "Convert" pill in the top-right bar (crossing-arrows icon) — ' +
      'it opens a little calculator. Type the amount (default 1), pick the ' +
      'from-currency (defaults to your active one) and choose ANY currency in ' +
      'the "to" dropdown; you instantly see the value plus the rate line, ' +
      'e.g. "1 USD ≈ 83 INR". A swap button flips the direction. Rates are ' +
      'LIVE MARKET values: the app fetches a free market rate table once a ' +
      'day (no key, cached on this device — it keeps using the last table ' +
      'when offline; a bundled indicative table is the last resort). The ' +
      'note under the result always says where the numbers came from and ' +
      'when they were updated.',
  },
  {
    keywords: ['theme', 'dark', 'light', 'appearance', 'white', 'cosmic', 'classic'],
    question: 'How do I change the theme / appearance?',
    answer:
      'Use the Appearance control in the top bar: Dark is the default, with ' +
      'White, Cosmic Blue and Classic available. The choice is remembered on ' +
      'this device.',
  },
  {
    keywords: ['demo data', 'local data', 'load', 'clear all', 'seed', '130 records'],
    question: 'What are "Load demo data" and "Clear all records"?',
    answer:
      'Both live in Settings → Local data. "Load demo data" seeds the bundled ' +
      'sample dataset (130 realistic records, January–November 2026) in one ' +
      'click — handy on any fresh browser profile. "Clear all records" wipes ' +
      'every transaction (it asks for confirmation) while keeping your settings ' +
      'and savings cap.',
  },
  {
    keywords: ['ai', 'assistant', 'gpt', 'openai', 'api key', 'llm', 'model', 'guide bot'],
    question: 'How does the AI assistant work?',
    answer:
      'This helper panel is the assistant. Without an API key it answers from ' +
      'its built-in knowledge base (offline, no data leaves the device). In ' +
      'Settings → AI assistant you pick a backend: Google Gemini (FREE key ' +
      'from aistudio.google.com, no card — recommended) or any ' +
      'OpenAI-compatible API (OpenAI, Groq, Ollama… via base URL + model + ' +
      'key). When connected, answers come from the model with the full ' +
      'SpendWise knowledge document as its system prompt, and it falls back ' +
      'to the built-in knowledge if the request fails. Key details stay saved ' +
      'in this browser only; chat questions go to the endpoint you ' +
      'configured — saved records never do.',
  },
  {
    keywords: ['planner', 'pending', 'completed', 'due', 'reschedule', 'future'],
    question: 'What are planner records (Pending / Completed)?',
    answer:
      'Records dated in the FUTURE are marked "Pending" automatically — they ' +
      'represent money you expect to move, so they do not count against the ' +
      'current month’s live totals the same way. They can be marked ' +
      'Completed, rescheduled (each change is kept in an audit trail), and ' +
      'imported future-dated rows join this pipeline too. Past-dated records ' +
      'are plain history.',
  },
  {
    keywords: ['guide', 'tour', 'walkthrough'],
    question: 'What is the guided tour?',
    answer:
      'The "👋 Take a tour" chip walks you through the real pages — Dashboard, ' +
      'Add Transaction, History, Reports, Settings — with a Next/End control ' +
      'in this panel. It navigates the actual UI, not screenshots.',
  },
  {
    keywords: ['category', 'add category', 'new category', 'categories'],
    question: 'How do custom categories work?',
    answer:
      'Income and Expense each ship with sensible defaults (Salary, ' +
      'Groceries, EMI…). From the Add Transaction form, "＋ Add new ' +
      'category…" creates a named category that appears in every future ' +
      'picker. Imported files that use unknown labels create records under ' +
      'those labels (or "Imported" when the file has no category column).',
  },
  {
    keywords: ['account', 'multiple users', 'other user', 'who can use'],
    question: 'Can I create more accounts or users?',
    answer:
      'This is a single-account demo build: exactly one signed-in user ' +
      'sahil/pass123. The top-bar "S" menu (Settings, Log out) is where ' +
      'account actions live. There is no user management screen by design ' +
      'right now.',
  },
  {
    keywords: ['net balance', 'meaning of', 'what does', 'term', 'glossary', 'definition'],
    question: 'Glossary — net balance, savings rate, cap, record, EMI…',
    answer:
      'Quick definitions as used in SpendWise: "record" = one income or ' +
      'expense entry; "Net balance" = income − expenses for the month; ' +
      '"Savings rate" = net ÷ income (how much of what you earned you kept); ' +
      '"cap" = your monthly savings target; "EMI" = a fixed monthly loan ' +
      'payment (Home EMI / Car EMI categories); "Pending/Completed" = planner ' +
      'state for future-dated records; "active currency" = the currency new ' +
      'records are saved in.',
  },
  {
    keywords: ['privacy', 'secure', 'safe', 'data goes', 'leave my device'],
    question: 'Is my data private / secure?',
    answer:
      'Financial records never leave the device — SpendWise has no cloud and ' +
      'no analytics. The one exception is when YOU connect an AI endpoint in ' +
      'Settings: then the chat questions (not your raw records) go to that ' +
      'endpoint. Images/PDFs for import are parsed inside your browser, ' +
      'including the OCR engine for photos.',
  },
  {
    keywords: ['hello', 'hi', 'hey', 'help', 'what can you do', 'options'],
    question: 'Help — what can I ask?',
    answer:
      'Anything about the app: how to add or import records, how months, ' +
      'currency, the savings cap, reports and the planner work, where data is ' +
      'stored, themes, or any finance term you see in the UI. I can also ' +
      'answer "what does X mean" and how to use any screen. Pick a chip ' +
      'below or take the guided tour.',
  },
];

const BASE_SYSTEM_PROMPT =
  'You are the official assistant for SpendWise, a local-first personal ' +
  'finance web app (Angular, single year, month-wise views). Rules:\n' +
  '- Answer ONLY about SpendWise and general finance/IT terms using the ' +
  'knowledge base below; stay strictly consistent with it.\n' +
  '- Be concise (2–6 sentences), friendly and plain-spoken. No fluff, no ' +
  'disclaimers, no marketing.\n' +
  '- If the user asks something the knowledge base does not cover, say so ' +
  'in one line and give the closest useful pointer.\n' +
  '- If the user only greets (hi / hello / hey), reply with a short greeting ' +
  'and ONE line inviting them to ask — never a wall of text.\n' +
  '- Never invent credentials, keys, routes or features that are not listed.\n' +
  '- Login: sahil / pass123. Data: localStorage on this device only.\n' +
  'KNOWLEDGE BASE:\n';

/** Full system prompt fed to the connected model. */
export function buildAssistantSystemPrompt(): string {
  const body = ASSISTANT_KNOWLEDGE.map(
    (entry, i) =>
      `${i + 1}. ${entry.question}\n${entry.answer}`
  ).join('\n\n');
  return BASE_SYSTEM_PROMPT + body;
}
