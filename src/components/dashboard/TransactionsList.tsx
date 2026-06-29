'use client';

import { useState, useMemo, useTransition } from 'react';
import { Transaction, TransactionKind } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { format } from 'date-fns';
import { ArrowUpRight, ArrowDownRight, PiggyBank, Trash2 } from 'lucide-react';
import { deleteTransaction } from '@/app/actions/transactions';
import { cn } from '@/lib/utils/format';

const kindConfig: Record<TransactionKind, { icon: typeof ArrowUpRight; color: string; sign: string }> = {
  income: { icon: ArrowUpRight, color: 'text-emerald', sign: '+' },
  expense: { icon: ArrowDownRight, color: 'text-clay', sign: '-' },
  investment: { icon: PiggyBank, color: 'text-gold', sign: '-' },
};

const FILTERS: { label: string; value: TransactionKind | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Income', value: 'income' },
  { label: 'Expense', value: 'expense' },
  { label: 'Investment', value: 'investment' },
];

export function TransactionsList({ transactions }: { transactions: Transaction[] }) {
  const [filter, setFilter] = useState<TransactionKind | 'all'>('all');
  const [isPending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === 'all' ? transactions : transactions.filter((t) => t.kind === filter)),
    [transactions, filter]
  );

  function handleDelete(id: string) {
    setPendingDelete(id);
    startTransition(async () => {
      await deleteTransaction(id);
      setPendingDelete(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap transition-colors',
              filter === f.value ? 'bg-emerald/15 border-emerald text-emerald' : 'border-ink-border text-paper/60 hover:text-paper'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-ink-border bg-ink-raised p-10 text-center">
          <p className="text-paper/40 text-sm">No transactions in this view yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-ink-border bg-ink-raised divide-y divide-ink-border">
          {filtered.map((t) => {
            const config = kindConfig[t.kind];
            const Icon = config.icon;
            const deleting = isPending && pendingDelete === t.id;
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-ink-border">
                    <Icon size={16} className={config.color} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.description || t.category?.name || 'Untitled'}
                    </p>
                    <p className="text-xs text-paper/40">
                      {t.category?.name ?? 'Uncategorized'} · {format(new Date(t.occurred_on), 'MMM d, yyyy')}
                      {t.is_split && ' · Split'}
                      {t.source && ` · ${t.source}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`font-ledger text-sm font-semibold ${config.color}`}>
                    {config.sign}{formatCurrency(t.amount, t.currency)}
                  </span>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deleting}
                    className="text-paper/30 hover:text-clay p-1 disabled:opacity-40"
                    aria-label="Delete transaction"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
