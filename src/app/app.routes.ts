import { Routes } from '@angular/router';
import { AppLayout } from './layout/app-layout/app-layout';
import { Dashboard } from './features/dashboard/dashboard/dashboard';
import { Transactions } from './features/transactions/transactions/transactions';
import { Planner } from './features/planner/planner/planner';
import { Accounts } from './features/accounts/accounts/accounts';
import { Budgets } from './features/budgets/budgets/budgets';
import { Savings } from './features/savings/savings/savings';
import { Analytics } from './features/analytics/analytics/analytics';
import { Settings } from './features/settings/settings/settings';

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: Dashboard },
      { path: 'transactions', component: Transactions },
      { path: 'planner', component: Planner },
      { path: 'accounts', component: Accounts },
      { path: 'budgets', component: Budgets },
      { path: 'savings', component: Savings },
      { path: 'analytics', component: Analytics },
      { path: 'settings', component: Settings },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
