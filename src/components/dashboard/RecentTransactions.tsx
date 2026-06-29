import { Transaction } from '@/lib/types';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils/format';
import { format } from 'date-fns';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, PiggyBank } from 'lucide-react';

const kindConfig = {
  income: { icon: ArrowUpRight, color: 'text-emerald', sign: '+' },
  expense: { icon: ArrowDownRight, color: 'text-clay', sign: '-' },
  investment: { icon: PiggyBank, color: 'text-gold', sign: '-' },
};

export function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  const recent = transactions.slice(0, 8);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent activity</CardTitle>
        <Link href="/dashboard/transactions" className="text-xs text-emerald font-medium hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <p className="text-sm text-paper/40 text-center py-10">
            Nothing logged yet. Add your first transaction to get started.
          </p>
        ) : (
          <div className="flex flex-col">
            {recent.map((t) => {
              const config = kindConfig[t.kind];
              const Icon = config.icon;
              return (
                <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-ink-border last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-ink-border`}>
                      <Icon size={16} className={config.color} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {t.description || t.category?.name || 'Untitled'}
                      </p>
                      <p className="text-xs text-paper/40">
                        {t.category?.name ?? 'Uncategorized'} · {format(new Date(t.occurred_on), 'MMM d')}
                        {t.is_split && ' · Split'}
                      </p>
                    </div>
                  </div>
                  <span className={`font-ledger text-sm font-semibold flex-shrink-0 ml-3 ${config.color}`}>
                    {config.sign}{formatCurrency(t.amount, t.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
