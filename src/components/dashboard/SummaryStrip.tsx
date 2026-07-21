import { DashboardTotals } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

export function SummaryStrip({ totals }: { totals: DashboardTotals }) {
  const items = [
    {
      label: 'Income this month',
      value: totals.totalIncome,
      icon: TrendingUp,
      color: 'text-mint',
    },
    {
      label: 'Expenses this month',
      value: totals.totalExpense,
      icon: TrendingDown,
      color: 'text-peach',
    },
    {
      label: 'Invested this month',
      value: totals.totalInvestment,
      icon: PiggyBank,
      color: 'text-sand',
    },
    {
      label: 'Net cashflow',
      value: totals.netCashflow,
      icon: Wallet,
      color: totals.netCashflow >= 0 ? 'text-mint' : 'text-peach',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-xl border border-ink-border bg-ink-raised p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-paper/50 uppercase tracking-wide">{item.label}</span>
              <Icon size={16} className={item.color} />
            </div>
            <p className={`font-ledger text-2xl font-bold ${item.color}`}>
              {formatCurrency(item.value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
