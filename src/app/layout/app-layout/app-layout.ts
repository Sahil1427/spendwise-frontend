import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';

type Theme = 'white' | 'dark' | 'cosmic-blue' | 'classic';

@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.scss',
})
export class AppLayout implements OnInit {
  private router = inject(Router);

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

    this.theme = validThemes.includes(savedTheme as Theme)
      ? savedTheme as Theme
      : 'white';

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
