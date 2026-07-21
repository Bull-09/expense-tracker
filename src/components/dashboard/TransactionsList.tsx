'use client';

import { memo, useCallback, useState, useMemo, useTransition } from 'react';
import { Category, DirectoryUser, Group, Transaction, TransactionKind } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { endOfMonth, endOfWeek, format, isWithinInterval, parseISO, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { ArrowLeftRight, ArrowUpRight, ArrowDownRight, CalendarDays, PiggyBank, Pencil, Trash2, X } from 'lucide-react';
import { deleteTransaction } from '@/app/actions/transactions';
import { cn } from '@/lib/utils/format';
import { EditTransactionModal } from './EditTransactionModal';
import { useOptimisticTransactions } from '@/lib/transactions/optimistic';

const kindConfig: Record<TransactionKind, { icon: typeof ArrowUpRight; color: string; sign: string }> = {
  income: { icon: ArrowUpRight, color: 'text-mint', sign: '+' },
  expense: { icon: ArrowDownRight, color: 'text-peach', sign: '-' },
  investment: { icon: PiggyBank, color: 'text-sand', sign: '-' },
  transfer: { icon: ArrowLeftRight, color: 'text-sky-300', sign: '' },
};

const FILTERS: { label: string; value: TransactionKind | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Income', value: 'income' },
  { label: 'Expense', value: 'expense' },
  { label: 'Investment', value: 'investment' },
  { label: 'Transfers', value: 'transfer' },
];

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom';

const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
  { label: 'All time', value: 'all' },
];

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function getPresetRange(preset: DatePreset) {
  const now = new Date();
  if (preset === 'today') {
    const today = dateKey(now);
    return { from: today, to: today };
  }
  if (preset === 'yesterday') {
    const yesterday = dateKey(subDays(now, 1));
    return { from: yesterday, to: yesterday };
  }
  if (preset === 'week') {
    return {
      from: dateKey(startOfWeek(now, { weekStartsOn: 1 })),
      to: dateKey(endOfWeek(now, { weekStartsOn: 1 })),
    };
  }
  if (preset === 'month') {
    return {
      from: dateKey(startOfMonth(now)),
      to: dateKey(endOfMonth(now)),
    };
  }
  return { from: '', to: '' };
}

function transactionInRange(transaction: Transaction, from: string, to: string) {
  if (!from && !to) return true;

  const date = parseISO(transaction.occurred_on);
  const start = from ? parseISO(from) : new Date(-8640000000000000);
  const end = to ? parseISO(to) : new Date(8640000000000000);
  return isWithinInterval(date, { start, end });
}

const TransactionRow = memo(function TransactionRow({
  transaction,
  deleting,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  deleting: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  const config = kindConfig[transaction.kind] ?? kindConfig.transfer;
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-ink-border">
          <Icon size={16} className={config.color} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {transaction.description || transaction.category?.name || 'Untitled'}
          </p>
          <p className="text-xs text-paper/40">
            {transaction.category?.name ?? 'Uncategorized'} · {format(new Date(transaction.occurred_on), 'MMM d, yyyy')}
            {transaction.is_split && ' · Split'}
            {transaction.source && ` · ${transaction.source}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`font-ledger text-sm font-semibold ${config.color}`}>
          {config.sign}{formatCurrency(transaction.amount, transaction.currency)}
        </span>
        <button onClick={() => onEdit(transaction)} className="text-paper/30 hover:text-mint p-1" aria-label="Edit transaction">
          <Pencil size={15} />
        </button>
        <button onClick={() => onDelete(transaction.id)} disabled={deleting} className="text-paper/30 hover:text-peach p-1 disabled:opacity-40" aria-label="Delete transaction">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
});

export function TransactionsList({
  transactions,
  categories,
  directory,
  groups,
  currentUserId,
}: {
  transactions: Transaction[];
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
}) {
  const [filter, setFilter] = useState<TransactionKind | 'all'>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const initialMonthRange = getPresetRange('month');
  const [dateFrom, setDateFrom] = useState(initialMonthRange.from);
  const [dateTo, setDateTo] = useState(initialMonthRange.to);
  const [isPending, startTransition] = useTransition();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const visibleTransactions = useOptimisticTransactions(transactions);

  const filtered = useMemo(
    () => visibleTransactions.filter((transaction) => {
      const matchesKind = filter === 'all' || transaction.kind === filter;
      return matchesKind && transactionInRange(transaction, dateFrom, dateTo);
    }),
    [visibleTransactions, filter, dateFrom, dateTo]
  );

  const rangeTotals = useMemo(() => {
    return filtered.reduce(
      (totals, transaction) => {
        if (transaction.kind === 'income') totals.income += transaction.amount;
        if (transaction.kind === 'expense') totals.expense += transaction.amount;
        if (transaction.kind === 'investment') totals.investment += transaction.amount;
        return totals;
      },
      { income: 0, expense: 0, investment: 0 }
    );
  }, [filtered]);

  function applyPreset(preset: DatePreset) {
    setDatePreset(preset);
    const range = getPresetRange(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  function updateDateRange(patch: { from?: string; to?: string }) {
    setDatePreset('custom');
    if (patch.from !== undefined) setDateFrom(patch.from);
    if (patch.to !== undefined) setDateTo(patch.to);
  }

  const rangeLabel = dateFrom || dateTo
    ? `${dateFrom ? format(parseISO(dateFrom), 'MMM d, yyyy') : 'Start'} - ${dateTo ? format(parseISO(dateTo), 'MMM d, yyyy') : 'Today'}`
    : 'All time';

  const handleDelete = useCallback((id: string) => {
    setPendingDelete(id);
    startTransition(async () => {
      await deleteTransaction(id);
      setPendingDelete(null);
    });
  }, []);

  const handleEdit = useCallback((transaction: Transaction) => setEditing(transaction), []);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-ink-border bg-ink-raised p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint/10 text-mint">
                <CalendarDays size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-paper">Calendar view</p>
                <p className="text-xs text-paper/45">{rangeLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-ink-border px-3 py-2 text-xs font-medium text-paper/55 hover:text-paper lg:self-auto"
            >
              <X size={14} />
              Clear dates
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => applyPreset(preset.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                  datePreset === preset.value ? 'border-mint bg-mint/15 text-mint' : 'border-ink-border text-paper/60 hover:text-paper'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-paper/45">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => updateDateRange({ from: event.target.value })}
                className="h-11 rounded-lg border border-ink-border bg-ink px-3 text-sm normal-case tracking-normal text-paper outline-none focus:border-mint"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-paper/45">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(event) => updateDateRange({ to: event.target.value })}
                className="h-11 rounded-lg border border-ink-border bg-ink px-3 text-sm normal-case tracking-normal text-paper outline-none focus:border-mint"
              />
            </label>
            <div className="grid grid-cols-3 gap-2 sm:min-w-72">
              <div className="rounded-lg border border-ink-border bg-ink px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-paper/35">Income</p>
                <p className="font-ledger text-sm font-semibold text-mint">{formatCurrency(rangeTotals.income)}</p>
              </div>
              <div className="rounded-lg border border-ink-border bg-ink px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-paper/35">Spend</p>
                <p className="font-ledger text-sm font-semibold text-peach">{formatCurrency(rangeTotals.expense)}</p>
              </div>
              <div className="rounded-lg border border-ink-border bg-ink px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-paper/35">Net</p>
                <p className={cn('font-ledger text-sm font-semibold', rangeTotals.income - rangeTotals.expense - rangeTotals.investment >= 0 ? 'text-mint' : 'text-peach')}>
                  {formatCurrency(rangeTotals.income - rangeTotals.expense - rangeTotals.investment)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap transition-colors',
              filter === f.value ? 'bg-mint/15 border-mint text-mint' : 'border-ink-border text-paper/60 hover:text-paper'
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
          {filtered.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              deleting={isPending && pendingDelete === transaction.id}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
      {editing && (
        <EditTransactionModal
          transaction={editing}
          categories={categories}
          directory={directory}
          groups={groups}
          currentUserId={currentUserId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
