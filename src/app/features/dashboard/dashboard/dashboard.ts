import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Transaction, TransactionService } from '../../../services/transaction.service';

@Component({
  selector: 'app-dashboard',
  imports: [FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly transactionService = inject(TransactionService);

  selectedPeriod = 'This Month';

  private get allTransactions(): Transaction[] {
    return this.transactionService.transactions();
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private getPeriodRange(): { start: Date | null; end: Date } {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const currentMonth = new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

    switch (this.selectedPeriod) {
      case 'Last Month': {
        const start = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          1
        );
        const end = new Date(
          today.getFullYear(),
          today.getMonth(),
          0,
          23, 59, 59, 999
        );
        return { start, end };
      }

      case 'Last 3 Months':
        return {
          start: new Date(
            today.getFullYear(),
            today.getMonth() - 2,
            1
          ),
          end: today,
        };

      case 'Last 6 Months':
        return {
          start: new Date(
            today.getFullYear(),
            today.getMonth() - 5,
            1
          ),
          end: today,
        };

      case 'This Year':
        return {
          start: new Date(today.getFullYear(), 0, 1),
          end: today,
        };

      case 'All Time':
        return { start: null, end: today };

      case 'This Month':
      default:
        return { start: currentMonth, end: today };
    }
  }

  get filteredTransactions(): Transaction[] {
    const { start, end } = this.getPeriodRange();

    return this.allTransactions.filter(transaction => {
      const date = this.parseDate(transaction.date);

      return (!start || date >= start) && date <= end;
    });
  }

  private get incomeTotal(): number {
    return this.filteredTransactions
      .filter(item => item.type === 'income')
      .reduce((total, item) => total + item.amount, 0);
  }

  private get expenseTotal(): number {
    return this.filteredTransactions
      .filter(item => item.type === 'expense')
      .reduce((total, item) => total + item.amount, 0);
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }

  get spendingTotal(): string {
    return this.formatCurrency(this.expenseTotal);
  }

  get summaryCards() {
    const income = this.incomeTotal;
    const expenses = this.expenseTotal;
    const balance = income - expenses;
    const savingsRate = income > 0
      ? (balance / income) * 100
      : 0;

    return [
      {
        title: 'Net Balance',
        amount: this.formatCurrency(balance),
        change: '',
        description: this.selectedPeriod,
        icon: 'wallet',
        type: 'balance',
      },
      {
        title: 'Income',
        amount: this.formatCurrency(income),
        change: '',
        description: this.selectedPeriod,
        icon: 'income',
        type: 'income',
      },
      {
        title: 'Expenses',
        amount: this.formatCurrency(expenses),
        change: '',
        description: this.selectedPeriod,
        icon: 'expense',
        type: 'expense',
      },
      {
        title: 'Savings Rate',
        amount: `${savingsRate.toFixed(1)}%`,
        change: '',
        description: this.selectedPeriod,
        icon: 'savings',
        type: 'savings',
      },
    ];
  }

  get monthlyData(): { month: string; income: number; expense: number }[] {
    const today = new Date();
    let monthCount: number;
    let startMonth: Date;

    switch (this.selectedPeriod) {
      case 'Last Month':
        monthCount = 1;
        startMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        break;

      case 'Last 3 Months':
        monthCount = 3;
        startMonth = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        break;

      case 'Last 6 Months':
        monthCount = 6;
        startMonth = new Date(today.getFullYear(), today.getMonth() - 5, 1);
        break;

      case 'This Year':
        monthCount = today.getMonth() + 1;
        startMonth = new Date(today.getFullYear(), 0, 1);
        break;

      case 'All Time': {
        const dates = this.allTransactions.map(item =>
          this.parseDate(item.date)
        );
        const earliest = dates.length
          ? dates.reduce((a, b) => a < b ? a : b)
          : new Date(today.getFullYear(), today.getMonth(), 1);

        startMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
        monthCount = Math.min(
          12,
          (today.getFullYear() - startMonth.getFullYear()) * 12 +
          today.getMonth() - startMonth.getMonth() + 1
        );
        if (monthCount === 12) {
          startMonth = new Date(today.getFullYear(), today.getMonth() - 11, 1);
        }
        break;
      }

      case 'This Month':
      default:
        monthCount = 1;
        startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
    }

    const months = Array.from({ length: monthCount }, (_, index) => {
      const date = new Date(
        startMonth.getFullYear(),
        startMonth.getMonth() + index,
        1
      );

      const year = date.getFullYear();
      const month = date.getMonth();

      const monthTransactions = this.filteredTransactions.filter(item => {
        const itemDate = this.parseDate(item.date);
        return itemDate.getFullYear() === year &&
          itemDate.getMonth() === month;
      });

      return {
        month: date.toLocaleDateString('en-IN', { month: 'short' }),
        income: monthTransactions
          .filter(item => item.type === 'income')
          .reduce((sum, item) => sum + item.amount, 0),
        expense: monthTransactions
          .filter(item => item.type === 'expense')
          .reduce((sum, item) => sum + item.amount, 0),
      };
    });

    const maxValue = Math.max(
      1,
      ...months.flatMap(item => [item.income, item.expense])
    );

    return months.map(item => ({
      ...item,
      income: (item.income / maxValue) * 100,
      expense: (item.expense / maxValue) * 100,
    }));
  }

  get categories() {
    const totals = new Map<string, number>();

    this.filteredTransactions
      .filter(item => item.type === 'expense')
      .forEach(item => {
        totals.set(
          item.category,
          (totals.get(item.category) || 0) + item.amount
        );
      });

    const colors = [
      '#7568e8',
      '#f2a65a',
      '#48b9a1',
      '#5b9bea',
      '#df83b5',
      '#8b9aa8',
    ];

    const entries = Array.from(totals.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const maxAmount = Math.max(1, ...entries.map(item => item.amount));

    return entries.map((item, index) => ({
      name: item.name,
      amount: this.formatCurrency(item.amount),
      percentage: (item.amount / maxAmount) * 100,
      color: colors[index % colors.length],
    }));
  }

  get transactions() {
    return [...this.filteredTransactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map(item => ({
        name: item.description?.trim() || item.category,
        category: item.category,
        date: this.parseDate(item.date).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        amount: `${item.type === 'income' ? '+' : '-'}${this.formatCurrency(item.amount)}`,
        type: item.type,
        icon: item.type === 'income' ? '↗' : '↙',
      }));
  }
}
