import { ArrowDownRight, ArrowUpRight, CalendarRange, PiggyBank, WalletCards } from 'lucide-react';
import { MoneyEstimate } from '@/lib/forecast';
import { formatCurrency } from '@/lib/utils/format';

const confidenceTone = {
  low: 'text-gold',
  medium: 'text-paper/60',
  high: 'text-emerald',
};

export function EstimateCard({ estimate }: { estimate: MoneyEstimate }) {
  const items = [
    {
      label: 'Month income',
      value: estimate.projectedIncome,
      icon: ArrowUpRight,
      color: 'text-emerald',
    },
    {
      label: 'Month spend',
      value: estimate.projectedExpense,
      icon: ArrowDownRight,
      color: 'text-clay',
    },
    {
      label: 'Month invested',
      value: estimate.projectedInvestment,
      icon: PiggyBank,
      color: 'text-gold',
    },
    {
      label: 'Year net',
      value: estimate.yearlyNet,
      icon: CalendarRange,
      color: estimate.yearlyNet >= 0 ? 'text-emerald' : 'text-clay',
    },
  ];

  return (
    <section className="rounded-xl border border-ink-border bg-ink-raised p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Money forecast</h2>
          <p className="mt-1 text-sm text-paper/45">{estimate.basis}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ink-border bg-ink px-2.5 py-1 text-xs">
          <WalletCards size={14} className={confidenceTone[estimate.confidence]} />
          <span className={confidenceTone[estimate.confidence]}>{estimate.confidence} confidence</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-lg border border-ink-border bg-ink p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-paper/40">{item.label}</span>
                <Icon size={15} className={item.color} />
              </div>
              <p className={`font-ledger text-lg font-bold ${item.color}`}>
                {formatCurrency(item.value)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-ink-border bg-ink px-3 py-2">
        <p className="text-xs text-paper/45">Projected year</p>
        <p className="mt-1 text-sm text-paper/70">
          Income {formatCurrency(estimate.yearlyIncome)} · Spend {formatCurrency(estimate.yearlyExpense)}
        </p>
      </div>
    </section>
  );
}
