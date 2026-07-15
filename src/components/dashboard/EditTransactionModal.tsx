'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { updateTransaction } from '@/app/actions/transactions';
import { inferCategory } from '@/lib/categories/auto';
import { Category, DirectoryUser, Group, Transaction, TransactionKind } from '@/lib/types';
import { cn } from '@/lib/utils/format';

const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
  transfer: 'Transfer',
};

export function EditTransactionModal({
  transaction,
  categories,
  directory,
  groups,
  currentUserId,
  onClose,
}: {
  transaction: Transaction;
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<TransactionKind>(transaction.kind);
  const [amount, setAmount] = useState(transaction.amount.toString());
  const [description, setDescription] = useState(transaction.description);
  const [source, setSource] = useState(transaction.source ?? '');
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? '');
  const [categoryTouched, setCategoryTouched] = useState(!!transaction.category_id);
  const [groupId, setGroupId] = useState(transaction.group_id ?? '');
  const [occurredOn, setOccurredOn] = useState(transaction.occurred_on);
  const [splitEnabled, setSplitEnabled] = useState(transaction.is_split);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const relevantCategories = useMemo(
    () => categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense')),
    [categories, kind]
  );
  const suggestedCategory = useMemo(
    () => inferCategory(kind, `${description} ${source}`, categories),
    [categories, description, kind, source]
  );
  const effectiveCategoryId = categoryTouched ? categoryId : categoryId || suggestedCategory?.id || '';
  const selectedGroup = groups.find((group) => group.id === groupId);
  const allowedMemberIds = selectedGroup?.members?.map((member) => member.user_id) ?? [];
  const otherUsers = directory.filter((u) =>
    u.id !== currentUserId && (!selectedGroup || allowedMemberIds.includes(u.id))
  );

  const numAmount = parseFloat(amount) || 0;
  const splitCount = selectedFriends.length + 1;
  const equalShare = splitCount > 0 ? numAmount / splitCount : 0;
  const customTotal = selectedFriends.reduce((sum, id) => sum + (parseFloat(customAmounts[id]) || 0), 0);
  const customRemaining = numAmount - customTotal;

  function toggleFriend(id: string) {
    setSelectedFriends((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!amount || numAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    if (splitEnabled && selectedFriends.length === 0) {
      setError('Pick at least one person to split with, or turn off splitting.');
      return;
    }

    if (splitEnabled && splitMode === 'custom' && Math.abs(customRemaining) > 0.01) {
      setError(`Custom amounts must add up to the total. ${customRemaining > 0 ? `₹${customRemaining.toFixed(2)} unassigned.` : `₹${Math.abs(customRemaining).toFixed(2)} over.`}`);
      return;
    }

    setSubmitting(true);
    try {
      await updateTransaction({
        id: transaction.id,
        kind,
        groupId: groupId || null,
        categoryId: effectiveCategoryId || null,
        amount: numAmount,
        description,
        source: kind === 'income' || kind === 'transfer' ? source : undefined,
        occurredOn,
        splits: splitEnabled
          ? selectedFriends.map((id) => ({
              userId: id,
              amount: splitMode === 'equal' ? equalShare : parseFloat(customAmounts[id]) || 0,
            }))
          : undefined,
      });

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update transaction.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-ink-border bg-ink-raised sm:max-w-md sm:rounded-2xl thin-scroll">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-border bg-ink-raised px-5 py-4">
          <h2 className="text-lg font-semibold">Edit transaction</h2>
          <button onClick={onClose} className="p-1 text-paper/50 hover:text-paper">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setCategoryId('');
                  setCategoryTouched(false);
                  if (k !== 'expense' && k !== 'transfer') setSplitEnabled(false);
                }}
                className={cn(
                  'rounded-lg border py-2 text-sm font-medium transition-colors',
                  kind === k ? 'border-emerald bg-emerald/15 text-emerald' : 'border-ink-border text-paper/60'
                )}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <Input label="Amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

          {(kind === 'income' || kind === 'transfer') && (
            <Input
              label={kind === 'transfer' ? 'Person (optional)' : 'Source (optional)'}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          )}

          {kind !== 'transfer' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-paper/70">Category</label>
            <select
              value={effectiveCategoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setCategoryTouched(true);
              }}
              className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
            >
              <option value="">Uncategorized</option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!categoryTouched && suggestedCategory && (
              <p className="text-xs text-emerald">Auto-selected: {suggestedCategory.name}</p>
            )}
          </div>
          )}

          {groups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-paper/70">Group</label>
              <select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setSelectedFriends([]);
                  setCustomAmounts({});
                }}
                className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
              >
                <option value="">Personal / no group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>
                ))}
              </select>
            </div>
          )}

          <Input label="Date" type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required />

          {kind === 'expense' && (
            <div className="border-t border-ink-border pt-4">
              <button
                type="button"
                onClick={() => setSplitEnabled(!splitEnabled)}
                disabled={otherUsers.length === 0}
                className="mb-3 flex items-center gap-2 text-sm font-medium text-paper/80"
              >
                {splitEnabled ? <Minus size={16} className="text-emerald" /> : <Plus size={16} className="text-emerald" />}
                Split this expense
              </button>

              {splitEnabled && otherUsers.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['equal', 'custom'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSplitMode(mode)}
                        className={cn('rounded-lg border py-1.5 text-xs font-medium', splitMode === mode ? 'border-emerald bg-emerald/15 text-emerald' : 'border-ink-border text-paper/60')}
                      >
                        {mode === 'equal' ? 'Split equally' : 'Custom amounts'}
                      </button>
                    ))}
                  </div>

                  <div className="flex max-h-48 flex-col gap-2 overflow-y-auto thin-scroll">
                    {otherUsers.map((u) => {
                      const selected = selectedFriends.includes(u.id);
                      return (
                        <div key={u.id} className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleFriend(u.id)}
                            className={cn('flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm', selected ? 'border-emerald bg-emerald/10' : 'border-ink-border text-paper/60')}
                          >
                            <span className="truncate">{u.full_name}</span>
                          </button>
                          {selected && splitMode === 'custom' && (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customAmounts[u.id] ?? ''}
                              onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                              className="w-20 rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-sm font-ledger"
                            />
                          )}
                          {selected && splitMode === 'equal' && (
                            <span className="w-20 text-right font-ledger text-xs text-paper/50">₹{equalShare.toFixed(2)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-clay/30 bg-clay-soft/10 px-3 py-2 text-sm text-clay">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </div>
    </div>
  );
}
