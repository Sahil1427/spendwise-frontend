import {
  Component,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MonthSelectionService } from '../../services/month-selection.service';
import { Icon } from '../icon/icon';

interface ChatMessage {
  id: number;
  from: 'bot' | 'user';
  text: string;
}

interface KnowledgeEntry {
  keywords: string[];
  reply: string;
}

/**
 * Guide Bot — a scripted talkbot (no AI) that explains the app and can
 * walk the user through every screen step by step.
 *
 * "Taking a tour" navigates the real pages while the next/finish
 * controls stay inside the chat panel.
 */
@Component({
  selector: 'app-chatbot',
  imports: [Icon, FormsModule],
  templateUrl: './chatbot.html',
  styleUrl: './chatbot.scss',
})
export class Chatbot implements OnInit {
  private readonly router = inject(Router);
  private readonly monthSelection = inject(MonthSelectionService);

  @ViewChild('messageList', { static: false }) messageListEl:
    | { nativeElement: HTMLElement }
    | undefined;

  open = false;
  draft = '';

  readonly quickChips: string[] = [
    '👋 Take a tour',
    'How do I add a record?',
    'How does the month selector work?',
    'What is the savings cap?',
    'How does currency work?',
    'Who can log in?',
  ];

  readonly messages = signal<ChatMessage[]>([]);
  /** Active tour step (0-based) or null when no tour is running. */
  readonly tourStep = signal<number | null>(null);
  private nextId = 1;

  private static readonly WELCOME =
    "Hi! I'm the Guide Bot 👋 — a simple helper, no AI, just the facts. " +
    'I can explain any part of SpendWise. Type a question below, tap one of the ' +
    'quick chips, or let me take you on a full tour.';

  private static readonly TOUR = [
    {
      url: '/dashboard',
      step:
        'This is your home base. Four cards summarise the selected month: ' +
        'net balance, income, expenses and savings rate. The pie shows where ' +
        'money went, and "Month comparison" charts every month of the year. ' +
        'Tap the Income or Expenses card to open its itemised list.',
    },
    {
      url: '/add',
      step:
        'One flat form is all you need: pick Income or Expense, choose a ' +
        'category (you can add your own), name, description, amount and date. ' +
        'Save keeps the form open so you can log records back-to-back. ' +
        'Clear empties the form again.',
    },
    {
      url: '/history',
      step:
        'Every record for the selected month, in one place. Search, filter ' +
        'by type, or open the ✎ editor on recent records (older months are ' +
        'locked so history stays honest). The strip on top sums the month.',
    },
    {
      url: '/reports',
      step:
        'Reports digs deeper: this month vs the previous one with % change, ' +
        'itemised income and expense lines, spending by category, and the ' +
        'full 12-month table for the year. All old months stay available here.',
    },
    {
      url: '/settings',
      step:
        'Choose your country and currency (new records follow the active ' +
        'currency — old records keep their own), and set a monthly savings ' +
        'cap. The dashboard then tracks your progress toward that cap. ' +
        'Tour finished — ask me anything, or close this panel anytime.',
    },
  ];

  private static readonly KNOWLEDGE: KnowledgeEntry[] = [
    {
      keywords: ['dashboard', 'home', 'summary', 'card'],
      reply:
        'The Dashboard summarises the selected month only: net balance, ' +
        'income, expenses, savings rate, a pie of spending by category and a ' +
        '12-month bar comparison. Click the Income or Expenses card to see ' +
        'its itemised list. The banner below the header tells you whether ' +
        'the month is positive or negative.',
    },
    {
      keywords: ['add', 'income', 'expense', 'record', 'transaction', 'log', 'save'],
      reply:
        'Head to Add Transaction. Pick the type, a category (＋ Add new ' +
        'category… creates one), optional name & description, amount, and a ' +
        'date inside the selected month — default is the 1st, or today when ' +
        'the month is current. Save keeps the form open for the next entry.',
    },
    {
      keywords: ['history', 'view', 'see', 'list', 'edit', 'delete', 'delete it'],
      reply:
        'History lists the selected month with search and an ' +
        'All/Income/Expenses filter. The ✎ pencil edits recent records ' +
        '(today or later); older dates are locked and can only be deleted. ' +
        'Edits never change the record\u2019s original currency.',
    },
    {
      keywords: ['report', 'reports', 'analytics', 'previous month', 'compare', 'comparison', 'old month', 'last month'],
      reply:
        'Reports opens the selected month: summary cards, a vs-previous-month ' +
        'comparison with % change, itemised lines by type, category ' +
        'breakdown and the 12-month table for the whole current year. ' +
        'This is where you review old months too — just pick the month.',
    },
    {
      keywords: ['month', 'year', 'why only', 'one year', 'select month', 'period'],
      reply:
        'SpendWise is strictly month-wise: every tab reads the same shared ' +
        'month, and it defaults to the month BEFORE the current one. Only ' +
        'the current year is supported (Jan–Dec), by design. Switch months ' +
        'in any tab and all tabs follow.',
    },
    {
      keywords: ['currency', 'country', 'settings', 'region', 'inr', 'usd', '₹', '$'],
      reply:
        'In Settings pick a country (auto-applies its default currency) or ' +
        'any of 22 currencies. New records are stamped with the active ' +
        'currency; existing ones keep theirs and show a small currency chip ' +
        'in History when it differs. Totals convert to the active currency.',
    },
    {
      keywords: ['savings cap', 'saving cap', 'cap', 'target', 'goal'],
      reply:
        'A savings cap is your monthly saving target. Set it in Settings ' +
        '(Savings cap). The dashboard shows how much you have saved toward ' +
        'it with a progress bar, plus the Positive/Negative status — ' +
        'positive when income covers all expenses, negative when it ' +
        'does\u2019t.',
    },
    {
      keywords: ['positive', 'negative', 'profit', 'loss', 'status'],
      reply:
        'The green/red banner on the Dashboard answers this directly for ' +
        'the selected month: Positive means income ≥ expenses (you saved); ' +
        'Negative means spending ran ahead of income by that amount.',
    },
    {
      keywords: ['login', 'logout', 'sign', 'password', 'credential', 'user'],
      reply:
        'Demo login: sahil / pass123. The session is remembered until you ' +
        'press Log out in the sidebar (or close the browser without a ' +
        'refresh — it persists). There is currently exactly one account.',
    },
    {
      keywords: ['bell', 'notification'],
      reply:
        'There are no notifications in this build, so the bell was ' +
        'retired — the right side of the top bar now only switches themes.',
    },
    {
      keywords: ['theme', 'dark', 'light', 'appearance'],
      reply:
        'Use the Appearance control in the top bar. Dark is the default; ' +
        'White, Cosmic Blue and Classic are there too. Your choice is ' +
        'remembered.',
    },
    {
      keywords: ['help', 'what', 'how do', 'can you', 'start', 'hello', 'hi', 'hey'],
      reply:
        'Ask me about: tour · dashboard · adding records · history · reports · ' +
        'months · currency · savings cap · positive/negative · login. ' +
        'Or pick a quick chip below.',
    },
  ];

  ngOnInit(): void {
    this.pushBot(Chatbot.WELCOME);
  }

  get monthLabel(): string {
    return this.monthSelection.selectedLabel();
  }

  toggleOpen(): void {
    this.open = !this.open;

    if (this.open) {
      this.scrollToBottom();
    }
  }

  send(): void {
    const text = this.draft.trim();
    if (!text || this.tourStep() !== null) {
      return;
    }

    this.pushUser(text);
    this.draft = '';

    const lowered = text.toLowerCase();

    for (const entry of Chatbot.KNOWLEDGE) {
      if (entry.keywords.some(keyword => lowered.includes(keyword))) {
        // Slight delay reads more "talking", and gives DOM time to re-render.
        setTimeout(() => {
          this.pushBot(entry.reply);
          this.scrollToBottom();
        }, 90);
        return;
      }
    }

    setTimeout(() => {
      this.pushBot(
        'Good question — I only know my scripted lines, no AI. Try one of: ' +
          'dashboard · how do I add a record · history · reports · month ' +
          'selector · currency · savings cap · positive or negative · ' +
          'tour.'
      );
      this.scrollToBottom();
    }, 90);
  }

  quickAsk(question: string): void {
    this.draft = '';
    this.pushUser(question);

    if (question.startsWith('👋')) {
      this.startTour();
      return;
    }

    const lowered = question.toLowerCase();
    const hit = Chatbot.KNOWLEDGE.find(entry =>
      entry.keywords.some(keyword => lowered.includes(keyword))
    );

    setTimeout(() => {
      this.pushBot(hit ? hit.reply : Chatbot.KNOWLEDGE.at(-1)!.reply);
      this.scrollToBottom();
    }, 90);
  }

  startTour(): void {
    this.tourStep.set(0);
    this.goToTourStep(0);
  }

  tourNext(): void {
    const next = (this.tourStep() ?? -1) + 1;

    if (next >= Chatbot.TOUR.length) {
      this.tourStep.set(null);
      return;
    }

    this.goToTourStep(next);
  }

  endTour(): void {
    if (this.tourStep() === null) {
      return;
    }
    this.tourStep.set(null);
    this.pushBot(
      'Tour ended. The app is one shared month, one current year — ' +
        'Dashboard to glance, Reports to dig in. Ask me anything else!'
    );
    this.scrollToBottom();
  }

  tourProgress(): string {
    const step = this.tourStep();
    return step === null
      ? ''
      : `Step ${step + 1} of ${Chatbot.TOUR.length}`;
  }

  isLastTourStep(): boolean {
    const step = this.tourStep();
    return step !== null && step + 1 >= Chatbot.TOUR.length;
  }


  currentTourStep(): { title: string; body: string } | null {
    const step = this.tourStep();
    if (step === null) {
      return null;
    }
    const item = Chatbot.TOUR[step];
    const titles = [
      'Dashboard',
      'Add Transaction',
      'History',
      'Reports',
      'Settings',
    ];
    return { title: titles[step], body: item.step };
  }

  private goToTourStep(index: number): void {
    const step = Chatbot.TOUR[index];
    this.router.navigate([step.url]);
    this.tourStep.set(index);
    this.pushBot(
      `Step ${index + 1}/${Chatbot.TOUR.length} — ${step.url.replace('/', '')}. ${step.step}`
    );
    this.scrollToBottom();
  }

  private pushBot(text: string): void {
    this.messages.update(list => [
      ...list,
      { id: this.nextId++, from: 'bot', text },
    ]);
    this.scrollToBottom();
  }

  private pushUser(text: string): void {
    this.messages.update(list => [
      ...list,
      { id: this.nextId++, from: 'user', text },
    ]);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messageListEl?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 30);
  }
}
