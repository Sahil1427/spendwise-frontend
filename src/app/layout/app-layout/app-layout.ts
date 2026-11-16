import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { Chatbot } from '../../shared/chatbot/chatbot';
import { AuthService } from '../../services/auth.service';

type Theme = 'white' | 'dark' | 'cosmic-blue' | 'classic';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Chatbot],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout implements OnInit {
  private router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly displayName = this.auth.displayName;

  avatarLetter(): string {
    const name = this.auth.displayName();
    return name ? name.charAt(0) : 'S';
  }

  onLogout(): void {
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
