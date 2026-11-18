import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { Chatbot } from '../../shared/chatbot/chatbot';
import { CurrencyConverter } from '../../shared/currency-converter/currency-converter';
import { Calculator } from '../../shared/calculator/calculator';
import { AuthService } from '../../services/auth.service';
import { BackendService } from '../../services/backend.service';
import { SettingsService } from '../../services/settings.service';
import { TransactionService } from '../../services/transaction.service';
import { CurrencyConvertService } from '../../services/currency-convert.service';

type Theme = 'white' | 'dark' | 'cosmic-blue' | 'classic';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Chatbot, CurrencyConverter, Calculator],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout implements OnInit {
  private router = inject(Router);
  private readonly auth = inject(AuthService);

  /** The global currency converter pop-up (topbar "Convert" button). */
  @ViewChild('converter') converter: CurrencyConverter | undefined;

  /** The on-demand calculator pop-up (topbar "calc" icon). */
  @ViewChild('calcPop') calcPop: Calculator | undefined;

  private readonly convertService = inject(CurrencyConvertService);
  private readonly backend = inject(BackendService);
  private readonly transactions = inject(TransactionService);
  private readonly settings = inject(SettingsService);

  readonly displayName = this.auth.displayName;

  openConverter(): void {
    this.themeMenuOpen = false;
    this.userMenuOpen = false;
    this.converter?.openDialog();
  }

  openCalculator(): void {
    this.themeMenuOpen = false;
    this.userMenuOpen = false;
    this.calcPop?.openDialog();
  }

  avatarLetter(): string {
    const name = this.auth.displayName();
    return name ? name.charAt(0) : 'S';
  }

  userEmail(): string {
    const name = this.auth.displayName();
    return name ? `${name.toLowerCase()}@spendwise.local` : 'guest@spendwise.local';
  }

  userMenuOpen = false;

  toggleUserMenu(): void {
    this.userMenuOpen = !this.userMenuOpen;
    this.themeMenuOpen = false;
  }

  closeUserMenu(): void {
    this.userMenuOpen = false;
  }

  /** Closes any dropdown (theme picker / avatar menu) on a click outside. */
  closeMenus(): void {
    this.themeMenuOpen = false;
    this.userMenuOpen = false;
  }

  onOpenSettings(): void {
    this.userMenuOpen = false;
    this.router.navigate(['/settings']);
  }

  onUserLogout(): void {
    this.userMenuOpen = false;
    this.onLogout();
  }

  onLogout(): void {
    this.userMenuOpen = false;
    this.themeMenuOpen = false;
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  get showDashboardBackButton(): boolean {
    return !this.router.url.startsWith('/dashboard');
  }

  theme: Theme = 'white';
  themeMenuOpen = false;

  themes: { id: Theme; name: string; description: string }[] = [
    { id: 'white', name: 'White', description: 'Clean and bright' },
    { id: 'dark', name: 'Dark', description: 'Elegant charcoal' },
    { id: 'cosmic-blue', name: 'Cosmic Blue', description: 'Midnight blue' },
    { id: 'classic', name: 'Classic', description: 'Warm and timeless' },
  ];

  get themeLabel(): string {
    return this.themes.find(item => item.id === this.theme)?.name ?? 'White';
  }

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('spendwise-theme');
    const validThemes: Theme[] = ['white', 'dark', 'cosmic-blue', 'classic'];

    // Dark is the default appearance until the user picks another.
    this.theme = validThemes.includes(savedTheme as Theme)
      ? savedTheme as Theme
      : 'dark';

    this.applyTheme();

    // Daily market-rate refresh (silent, at most once per day). Rates
    // surface through the converter's source label when the user opens it.
    void this.convertService.ensureFresh();

    // Cross-device sync: if the app was connected to the backend before,
    // quietly re-fetch the server state and adopt it (records + settings).
    void this.bootBackendSync();
  }

  private async bootBackendSync(): Promise<void> {
    if (!(await this.backend.refreshIfConnected())) {
      return;
    }
    try {
      const [items, prefs] = await Promise.all([
        this.backend.fetchTransactions(),
        this.backend.fetchSettingsSettings(),
      ]);
      this.transactions.adoptRemote(items);
      if (prefs) {
        this.settings.adoptRemoteSettings(prefs);
      }
    } catch {
      // Cache stays authoritative; the Settings panel shows the failure.
    }
  }

  toggleThemeMenu(): void {
    this.themeMenuOpen = !this.themeMenuOpen;
  }

  closeThemeMenu(): void {
    this.themeMenuOpen = false;
  }

  selectTheme(selectedTheme: Theme): void {
    this.theme = selectedTheme;
    localStorage.setItem('spendwise-theme', selectedTheme);
    this.applyTheme();
    this.themeMenuOpen = false;
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.theme);
  }
}
