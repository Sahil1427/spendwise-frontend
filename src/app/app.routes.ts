import { Routes } from '@angular/router';
import { AppLayout } from './layout/app-layout/app-layout';
import {
  authenticatedGuard,
  guestGuard,
} from './services/auth.guards';

/**
 * Month-wise navigation model:
 *   Overview -> Dashboard, Reports
 *   Manage   -> Add Transaction, History
 *   System   -> Settings (region & currency)
 *
 * Feature pages are lazy-loaded (loadComponent) so the initial bundle
 * only ships the shell + Dashboard. The whole app sits behind a login
 * (demo: sahil / pass123). Legacy URLs keep working through redirects
 * so bookmarks and old links never dead-end.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/login/login/login').then(m => m.Login),
  },
  {
    path: '',
    component: AppLayout,
    canActivate: [authenticatedGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'add',
        loadComponent: () =>
          import('./features/add-transaction/add-transaction/add-transaction').then(m => m.AddTransaction),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./features/transactions/transactions/transactions').then(m => m.Transactions),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/analytics/analytics/analytics').then(m => m.Analytics),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings/settings').then(m => m.Settings),
      },

      // Legacy redirects
      { path: 'transactions', redirectTo: 'history' },
      { path: 'analytics', redirectTo: 'reports' },
      { path: 'planner', redirectTo: 'dashboard' },
      { path: 'accounts', redirectTo: 'dashboard' },
      { path: 'budgets', redirectTo: 'dashboard' },
      { path: 'savings', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
