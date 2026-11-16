import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  DestroyRef,
  inject,
} from '@angular/core';
import {
  provideRouter,
  Router,
  NavigationEnd,
} from '@angular/router';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';

/**
 * Keeps the browser tab title in sync with the active route:
 * "Dashboard · SpendWise", "History · SpendWise", …
 */
class TitleSync {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  static readonly PAGE_TITLES: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/add': 'Add Transaction',
    '/history': 'History',
    '/reports': 'Reports',
    '/settings': 'Settings',
  };

  constructor() {
    const subscription = this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.applyTitle();
      }
    });
    // The initial navigation can finish before this provider subscribes,
    // so synchronise once from the current URL as well.
    this.applyTitle();
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private applyTitle(): void {
    const page = TitleSync.PAGE_TITLES[this.router.url.split('?')[0]];
    const next = page ? `${page} · SpendWise` : 'SpendWise — Personal Finance';
    this.title.setTitle(next);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Plain providers are created lazily, so force creation of the
    // TitleSync singleton during bootstrap via an APP_INITIALIZER.
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => () => inject(TitleSync),
    },
    { provide: TitleSync, useFactory: () => new TitleSync() },
  ]
};
