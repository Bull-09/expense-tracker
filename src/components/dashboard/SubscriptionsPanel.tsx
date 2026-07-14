'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import { CalendarClock, Pencil, Pause, Play, Trash2 } from 'lucide-react';
import { createSubscription, deleteSubscription, updateSubscription } from '@/app/actions/transactions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Category, Group, Subscription } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { format } from 'date-fns';

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

type FormState = {
  id?: string;
  name: string;
  amount: string;
  billingDay: string;
  nextDueOn: string;
  categoryId: string;
  groupId: string;
  active: boolean;
  notes: string;
};

const emptyForm: FormState = {
  name: '',
  amount: '',
  billingDay: String(new Date().getDate()),
  nextDueOn: todayIso(),
  categoryId: '',
  groupId: '',
  active: true,
  notes: '',
};

export function SubscriptionsPanel({
  subscriptions,
  categories,
  groups,
}: {
  subscriptions: Subscription[];
  categories: Category[];
  groups: Group[];
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const expenseCategories = categories.filter((category) => category.kind === 'expense');
  const activeMonthlyTotal = useMemo(
    () => subscriptions.filter((item) => item.active).reduce((sum, item) => sum + item.amount, 0),
    [subscriptions]
  );
  const nextThree = subscriptions.filter((item) => item.active).slice(0, 3);

  function patchForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function resetForm() {
    setForm(emptyForm);
    setError(null);
  }

  function edit(item: Subscription) {
    setForm({
      id: item.id,
      name: item.name,
      amount: String(item.amount),
      billingDay: String(item.billing_day),
      nextDueOn: item.next_due_on,
      categoryId: item.category_id ?? '',
      groupId: item.group_id ?? '',
      active: item.active,
      notes: item.notes ?? '',
    });
    setError(null);
    setMessage(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const amount = parseFloat(form.amount);
        const billingDay = parseInt(form.billingDay, 10);
        if (form.id) {
          await updateSubscription({
            id: form.id,
            name: form.name,
            amount,
            billingDay,
            nextDueOn: form.nextDueOn,
            categoryId: form.categoryId || null,
            groupId: form.groupId || null,
            active: form.active,
            notes: form.notes,
          });
          setMessage('Subscription updated.');
        } else {
          await createSubscription({
            name: form.name,
            amount,
            billingDay,
            nextDueOn: form.nextDueOn,
            categoryId: form.categoryId || null,
            groupId: form.groupId || null,
            notes: form.notes,
          });
          setMessage('Subscription added.');
        }
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save subscription.');
      }
    });
  }

  function toggleActive(item: Subscription) {
    setPendingId(item.id);
    setError(null);
    startTransition(async () => {
      try {
        await updateSubscription({
          id: item.id,
          name: item.name,
          amount: item.amount,
          billingDay: item.billing_day,
          nextDueOn: item.next_due_on,
          categoryId: item.category_id,
          groupId: item.group_id,
          active: !item.active,
          notes: item.notes,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not update subscription.');
      } finally {
        setPendingId(null);
      }
    });
  }

  function remove(id: string) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      try {
        await deleteSubscription(id);
        setMessage('Subscription deleted.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not delete subscription.');
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-xl border border-ink-border bg-ink-raised p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Subscription autopilot</h2>
            <p className="mt-1 text-sm text-paper/45">
              Monthly items become expenses when they are due. No double entries.
            </p>
          </div>
          <div className="rounded-lg border border-ink-border bg-ink px-3 py-2 text-right">
            <p className="text-xs text-paper/40">Monthly burn</p>
            <p className="font-ledger text-lg font-bold text-clay">{formatCurrency(activeMonthlyTotal)}</p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(event) => patchForm({ name: event.target.value })} placeholder="Netflix, gym, iCloud" required />
          <Input label="Amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => patchForm({ amount: event.target.value })} required />
          <Input label="Billing day" type="number" min="1" max="31" value={form.billingDay} onChange={(event) => patchForm({ billingDay: event.target.value })} required />
          <Input label="Next due" type="date" value={form.nextDueOn} onChange={(event) => patchForm({ nextDueOn: event.target.value })} required />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-paper/70">Category</label>
            <select
              value={form.categoryId}
              onChange={(event) => patchForm({ categoryId: event.target.value })}
              className="w-full rounded-lg border border-ink-border bg-ink px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
            >
              <option value="">Auto category</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-paper/70">Group</label>
            <select
              value={form.groupId}
              onChange={(event) => patchForm({ groupId: event.target.value })}
              className="w-full rounded-lg border border-ink-border bg-ink px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
            >
              <option value="">Personal</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>
              ))}
            </select>
          </div>

          <Input label="Notes" value={form.notes} onChange={(event) => patchForm({ notes: event.target.value })} placeholder="Plan, renewal, card used" className="sm:col-span-2" />

          <label className="flex items-center gap-2 rounded-lg border border-ink-border bg-ink px-3 py-2.5 text-sm text-paper/70">
            <input type="checkbox" checked={form.active} onChange={(event) => patchForm({ active: event.target.checked })} className="h-4 w-4 accent-emerald" />
            Active
          </label>

          <div className="flex gap-2 sm:justify-end">
            {form.id && <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>}
            <Button type="submit" disabled={isPending}>
              {form.id ? 'Save changes' : 'Add subscription'}
            </Button>
          </div>
        </form>

        {message && <p className="mt-4 rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 text-sm text-emerald">{message}</p>}
        {error && <p className="mt-4 rounded-lg border border-clay/30 bg-clay-soft/10 px-3 py-2 text-sm text-clay">{error}</p>}
      </section>

      <aside className="rounded-xl border border-ink-border bg-ink-raised p-5">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock size={18} className="text-emerald" />
          <h2 className="font-semibold">Coming up</h2>
        </div>
        {nextThree.length === 0 ? (
          <p className="text-sm text-paper/45">Add your first recurring cost from here or by chatting with Mithu AI.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {nextThree.map((item) => (
              <div key={item.id} className="rounded-lg border border-ink-border bg-ink p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="font-ledger text-sm font-bold text-clay">{formatCurrency(item.amount)}</p>
                </div>
                <p className="mt-1 text-xs text-paper/40">Due {format(new Date(item.next_due_on), 'MMM d')} · day {item.billing_day}</p>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className="lg:col-span-2 rounded-xl border border-ink-border bg-ink-raised">
        {subscriptions.length === 0 ? (
          <div className="p-10 text-center text-sm text-paper/40">
            No subscriptions yet. Try “add Spotify 119 every month on 5th” in Mithu AI.
          </div>
        ) : (
          <div className="divide-y divide-ink-border">
            {subscriptions.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{item.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${item.active ? 'bg-emerald/15 text-emerald' : 'bg-ink text-paper/40'}`}>
                      {item.active ? 'Active' : 'Paused'}
                    </span>
                    {item.category && <span className="text-xs text-paper/40">{item.category.name}</span>}
                  </div>
                  <p className="mt-1 text-sm text-paper/45">
                    {formatCurrency(item.amount)} monthly · next {format(new Date(item.next_due_on), 'MMM d, yyyy')}
                    {item.group ? ` · ${item.group.emoji} ${item.group.name}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => edit(item)}>
                    <Pencil size={14} /> Edit
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={pendingId === item.id} onClick={() => toggleActive(item)}>
                    {item.active ? <Pause size={14} /> : <Play size={14} />}
                    {item.active ? 'Pause' : 'Resume'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pendingId === item.id} onClick={() => remove(item.id)}>
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
