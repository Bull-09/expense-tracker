'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/format';
import { Category, TransactionKind, DirectoryUser, Group } from '@/lib/types';
import { createTransaction } from '@/app/actions/transactions';
import { inferCategory } from '@/lib/categories/auto';

const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
  transfer: 'Transfer',
};

export function AddTransactionModal({
  categories,
  directory,
  groups,
  currentUserId,
  onClose,
}: {
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [createCategoryName, setCreateCategoryName] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  const relevantCategories = useMemo(
    () => categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense')),
    [categories, kind]
  );
  const suggestedCategory = useMemo(
    () => inferCategory(kind, `${description} ${source}`, categories),
    [categories, description, kind, source]
  );
  const effectiveCategoryId = categoryId;

  const selectedGroup = groups.find((group) => group.id === groupId);
  const allowedMemberIds = selectedGroup?.members?.map((member) => member.user_id) ?? [];
  const otherUsers = directory.filter((u) =>
    u.id !== currentUserId && (!selectedGroup || allowedMemberIds.includes(u.id))
  );

  function toggleFriend(id: string) {
    setSelectedFriends((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  const numAmount = parseFloat(amount) || 0;
  const splitCount = selectedFriends.length + 1; // include self
  const equalShare = splitCount > 0 ? numAmount / splitCount : 0;

  const customTotal = selectedFriends.reduce((sum, id) => sum + (parseFloat(customAmounts[id]) || 0), 0);
  const customRemaining = numAmount - customTotal;

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
      const splits = splitEnabled
        ? selectedFriends.map((id) => ({
            userId: id,
            amount: splitMode === 'equal' ? equalShare : parseFloat(customAmounts[id]) || 0,
          }))
        : undefined;

      await createTransaction({
        kind,
        groupId: groupId || null,
        categoryId: effectiveCategoryId || null,
        createCategoryName: effectiveCategoryId ? null : createCategoryName || null,
        amount: numAmount,
        description,
        source: kind === 'income' || kind === 'transfer' ? source : undefined,
        occurredOn,
        splits,
      });

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-ink-raised border border-ink-border rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto thin-scroll">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-border sticky top-0 bg-ink-raised z-10">
          <h2 className="font-semibold text-lg">Add transaction</h2>
          <button onClick={onClose} className="text-paper/50 hover:text-paper p-1">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Kind selector */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_LABELS) as TransactionKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setCategoryId('');
                  setCreateCategoryName('');
                }}
                className={cn(
                  'py-2 rounded-lg text-sm font-medium border transition-colors',
                  kind === k
                    ? 'bg-mint/15 border-mint text-mint'
                    : 'border-ink-border text-paper/60 hover:text-paper'
                )}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <Input
            label="Amount"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            min="0.01"
            step="0.01"
          />

          <Input
            label="Description"
            placeholder={kind === 'income' ? 'e.g. Salary, refund, side income' : 'e.g. Dinner, cab, rent'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {(kind === 'income' || kind === 'transfer') && (
            <Input
              label={kind === 'transfer' ? 'Person (optional)' : 'Source (optional)'}
              placeholder={kind === 'transfer' ? 'e.g. Rahul, Ananya' : 'e.g. Upwork, Client name'}
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
                if (e.target.value) setCreateCategoryName('');
              }}
              className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-mint/60"
            >
              <option value="">Uncategorized</option>
              {relevantCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!effectiveCategoryId && (
              <div className="rounded-lg border border-mint/25 bg-mint/5 px-3 py-2.5">
                <p className="text-xs font-medium text-mint">
                  Create a new category while saving
                </p>
                <p className="mt-1 text-xs text-paper/50">
                  Leave this blank to save as Uncategorized, or type a category name here.
                </p>
                <Input
                  label="New category"
                  value={createCategoryName}
                  onChange={(event) => setCreateCategoryName(event.target.value)}
                  placeholder="e.g. Cigarettes, Snacks, Apps"
                  className="mt-2"
                />
                {createCategoryName.trim() && (
                  <p className="mt-2 text-xs text-paper/55">
                    Will create &quot;{createCategoryName.trim()}&quot; and use it for this {kind}.
                  </p>
                )}
                {suggestedCategory && !createCategoryName && (
                  <button
                    type="button"
                    onClick={() => setCategoryId(suggestedCategory.id)}
                    className="mt-2 text-xs font-medium text-mint"
                  >
                    Use existing &quot;{suggestedCategory.name}&quot;
                  </button>
                )}
              </div>
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
                className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-mint/60"
              >
                <option value="">Personal / no group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>
                ))}
              </select>
            </div>
          )}

          <Input
            label="Date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
          />

          {/* Split section — only for expenses */}
          {kind === 'expense' && (
            <div className="border-t border-ink-border pt-4">
              <button
                type="button"
                onClick={() => setSplitEnabled(!splitEnabled)}
                disabled={otherUsers.length === 0}
                className="flex items-center gap-2 text-sm font-medium text-paper/80 mb-3"
              >
                {splitEnabled ? <Minus size={16} className="text-mint" /> : <Plus size={16} className="text-mint" />}
                Split this expense
              </button>

              {otherUsers.length === 0 && (
                <p className="text-xs text-paper/40">
                  {selectedGroup
                    ? 'Add friends to this group before splitting here.'
                    : 'Friends appear here after they sign up. You can also make groups from the Groups tab.'}
                </p>
              )}

              {splitEnabled && otherUsers.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSplitMode('equal')}
                      className={cn('py-1.5 rounded-lg text-xs font-medium border', splitMode === 'equal' ? 'bg-mint/15 border-mint text-mint' : 'border-ink-border text-paper/60')}
                    >
                      Split equally
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitMode('custom')}
                      className={cn('py-1.5 rounded-lg text-xs font-medium border', splitMode === 'custom' ? 'bg-mint/15 border-mint text-mint' : 'border-ink-border text-paper/60')}
                    >
                      Custom amounts
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto thin-scroll">
                    {otherUsers.map((u) => {
                      const selected = selectedFriends.includes(u.id);
                      return (
                        <div key={u.id} className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleFriend(u.id)}
                            className={cn(
                              'flex items-center gap-2 flex-1 px-2.5 py-2 rounded-lg border text-sm text-left',
                              selected ? 'border-mint bg-mint/10' : 'border-ink-border text-paper/60'
                            )}
                          >
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                              style={{ backgroundColor: u.avatar_color }}
                            >
                              {u.full_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate">{u.full_name}</span>
                          </button>
                          {selected && splitMode === 'custom' && (
                            <input
                              type="number"
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                              value={customAmounts[u.id] ?? ''}
                              onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))}
                              className="w-20 rounded-lg border border-ink-border bg-ink px-2 py-1.5 text-sm font-ledger"
                            />
                          )}
                          {selected && splitMode === 'equal' && (
                            <span className="font-ledger text-xs text-paper/50 w-20 text-right">
                              ₹{equalShare.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {selectedFriends.length > 0 && (
                    <p className="text-xs text-paper/40">
                      {splitMode === 'equal'
                        ? `Split between you and ${selectedFriends.length} ${selectedFriends.length === 1 ? 'person' : 'people'} — ₹${equalShare.toFixed(2)} each.`
                        : `Assigned ₹${customTotal.toFixed(2)} of ₹${numAmount.toFixed(2)}.`}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-peach/10 border border-peach/30 px-3 py-2 text-sm text-peach">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" disabled={submitting} className="mt-1">
            {submitting ? 'Saving…' : 'Save transaction'}
          </Button>
        </form>
      </div>
    </div>
  );
}
