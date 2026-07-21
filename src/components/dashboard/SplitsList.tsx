'use client';

import { useEffect, useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { DirectoryUser, Group, SplitShare } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { format } from 'date-fns';
import { Bell, CheckCircle2, Check, Copy, HandCoins, Share2, UserPlus } from 'lucide-react';
import { createFriendLedgerEntry, recordSplitReminder, settleSplitShare } from '@/app/actions/transactions';
import { cn } from '@/lib/utils/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { whatsappReminderLink } from '@/lib/splits/simplify';

export function SplitsList({
  splitShares,
  currentUserId,
  directory,
  groups,
}: {
  splitShares: SplitShare[];
  currentUserId: string;
  directory: DirectoryUser[];
  groups: Group[];
}) {
  const [isPending, startTransition] = useTransition();
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
  const [amount, setAmount] = useState('');
  const [personId, setPersonId] = useState('');
  const [personName, setPersonName] = useState('');
  const [note, setNote] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [copied, setCopied] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [hasNativeShare, setHasNativeShare] = useState(false);

  const visible = splitShares.filter((s) => (showSettled ? true : !s.settled));
  const friends = directory.filter((person) => person.id !== currentUserId);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAppUrl(window.location.origin);
      setHasNativeShare('share' in navigator);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function resetForm() {
    setAmount('');
    setPersonId('');
    setPersonName('');
    setNote('');
    setOccurredOn(format(new Date(), 'yyyy-MM-dd'));
    setDirection('lent');
  }

  function handleSettle(id: string) {
    setSettlingId(id);
    startTransition(async () => {
      await settleSplitShare(id);
      setSettlingId(null);
    });
  }

  function handleRemind(id: string) {
    setRemindingId(id);
    setNotice(null);
    startTransition(async () => {
      try {
        await recordSplitReminder(id);
        setNotice('Reminder saved. Add email or WhatsApp later to send it automatically.');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not save reminder.');
      } finally {
        setRemindingId(null);
      }
    });
  }

  function handleCreateSplit(event: FormEvent) {
    event.preventDefault();
    const numericAmount = parseFloat(amount);
    setNotice(null);

    if (!numericAmount || numericAmount <= 0) {
      setNotice('Add a valid amount first.');
      return;
    }
    if (!personId && !personName.trim()) {
      setNotice('Pick a friend or type a new friend name.');
      return;
    }

    startTransition(async () => {
      try {
        await createFriendLedgerEntry({
          direction,
          personId: personId || null,
          personName: personId ? null : personName.trim(),
          amount: numericAmount,
          description: note.trim() || (direction === 'lent' ? `Lent ${formatCurrency(numericAmount)}` : `Borrowed ${formatCurrency(numericAmount)}`),
          occurredOn,
        });
        setNotice(direction === 'lent' ? 'Saved. This person now owes you.' : 'Saved. You now owe this person.');
        resetForm();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Could not save split.');
      }
    });
  }

  async function handleInvite() {
    if (!appUrl) return;

    if (hasNativeShare) {
      await navigator.share({
        title: 'Join my C-137 Capital',
        text: 'Track shared expenses with me on C-137 Capital.',
        url: appUrl,
      });
      return;
    }

    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const splitForm = (
    <form onSubmit={handleCreateSplit} className="rounded-xl border border-mint/30 bg-mint/5 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint/15 text-mint">
            <HandCoins size={18} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-paper">Add split balance</h2>
            <p className="text-xs text-paper/45">Track money owed without making it income or expense.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink-border px-3 py-2 text-sm font-medium text-paper/60 hover:border-mint/40 hover:text-mint"
        >
          {copied ? <Check size={15} /> : hasNativeShare ? <Share2 size={15} /> : <Copy size={15} />}
          {copied ? 'Copied invite' : 'Invite'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-paper/70">Type</label>
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as 'lent' | 'borrowed')}
            className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-mint/60"
          >
            <option value="lent">I paid / lent money, they owe me</option>
            <option value="borrowed">They paid / lent money, I owe them</option>
          </select>
        </div>
        <Input label="Amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="2000" />
        <Input label="Date" type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-paper/70">Friend</label>
          <select
            value={personId}
            onChange={(event) => {
              setPersonId(event.target.value);
              if (event.target.value) setPersonName('');
            }}
            className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-mint/60"
          >
            <option value="">Add new friend</option>
            {friends.map((person) => (
              <option key={person.id} value={person.id}>{person.full_name}</option>
            ))}
          </select>
        </div>
        <Input
          label="New friend name"
          value={personName}
          onChange={(event) => {
            setPersonName(event.target.value);
            if (event.target.value.trim()) setPersonId('');
          }}
          placeholder="Rahul"
          disabled={!!personId}
        />
        <Input label="Note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Dinner, EMI, cab, loan..." className="sm:col-span-2" />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending}>
          <UserPlus size={16} />
          {isPending ? 'Saving...' : 'Save split'}
        </Button>
        <p className="text-xs text-paper/40">
          New friends are created on save. Invite link lets them join later.
        </p>
      </div>
    </form>
  );

  if (splitShares.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {splitForm}
        {notice && (
          <div className="rounded-lg border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
            {notice}
          </div>
        )}
        <div className="rounded-xl border border-ink-border bg-ink-raised p-10 text-center">
          <p className="text-paper/40 text-sm">
            No split balances yet. Add one above or ask C-137 AI.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {splitForm}

      <button
        onClick={() => setShowSettled(!showSettled)}
        className="text-xs text-paper/50 hover:text-paper self-start underline"
      >
        {showSettled ? 'Hide settled' : 'Show settled'}
      </button>

      {notice && (
        <div className="rounded-lg border border-mint/30 bg-mint/10 px-3 py-2 text-sm text-mint">
          {notice}
        </div>
      )}

      <div className="rounded-xl border border-ink-border bg-ink-raised divide-y divide-ink-border">
        {visible.map((s) => {
          const youArePayer = s.payer_id === currentUserId;
          const otherPerson = youArePayer ? s.owed_by : s.payer;
          const settling = isPending && settlingId === s.id;
          const reminding = isPending && remindingId === s.id;
          const contact = groups.flatMap((group) => group.members ?? []).find((member) => member.user_id === otherPerson?.id);
          const reminderHref = contact?.phone ? whatsappReminderLink(contact.phone, s.amount, s.transaction?.description || 'a shared expense') : null;

          return (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: otherPerson?.avatar_color ?? '#6B7280' }}
                >
                  {otherPerson?.full_name?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {youArePayer
                      ? `${otherPerson?.full_name ?? 'Someone'} owes you`
                      : `You owe ${otherPerson?.full_name ?? 'someone'}`}
                  </p>
                  <p className="text-xs text-paper/40 truncate">
                    {s.transaction?.description || 'Split expense'} · {format(new Date(s.created_at), 'MMM d')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={cn('font-ledger text-sm font-semibold', youArePayer ? 'text-mint' : 'text-peach', s.settled && 'opacity-40 line-through')}>
                  {formatCurrency(s.amount)}
                </span>
                {!s.settled && (
                  <>
                    {youArePayer && (
                      <a
                        href={reminderHref ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => { if (!reminderHref) event.preventDefault(); else handleRemind(s.id); }}
                        aria-disabled={!reminderHref || reminding}
                        title={reminderHref ? 'Send WhatsApp reminder' : 'Add their phone number in the group to enable WhatsApp reminders.'}
                        className="flex items-center gap-1 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs font-medium text-paper/50 hover:border-sand/40 hover:text-sand disabled:opacity-40"
                      >
                        <Bell size={14} />
                        {reminding ? 'Saving...' : 'Remind'}
                      </a>
                    )}
                    <button
                      onClick={() => handleSettle(s.id)}
                      disabled={settling}
                      className="flex items-center gap-1 text-xs font-medium text-paper/50 hover:text-mint disabled:opacity-40 border border-ink-border hover:border-mint/40 rounded-lg px-2.5 py-1.5"
                    >
                      <CheckCircle2 size={14} />
                      {settling ? 'Settling...' : 'Settle'}
                    </button>
                  </>
                )}
                {s.settled && <span className="text-xs text-paper/30">Settled</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
