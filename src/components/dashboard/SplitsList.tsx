'use client';

import { useState, useTransition } from 'react';
import { SplitShare } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { format } from 'date-fns';
import { Bell, CheckCircle2 } from 'lucide-react';
import { recordSplitReminder, settleSplitShare } from '@/app/actions/transactions';
import { cn } from '@/lib/utils/format';

export function SplitsList({ splitShares, currentUserId }: { splitShares: SplitShare[]; currentUserId: string }) {
  const [isPending, startTransition] = useTransition();
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const visible = splitShares.filter((s) => (showSettled ? true : !s.settled));

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

  if (splitShares.length === 0) {
    return (
      <div className="rounded-xl border border-ink-border bg-ink-raised p-10 text-center">
        <p className="text-paper/40 text-sm">
          No split expenses yet. Split one with a friend and it&apos;ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => setShowSettled(!showSettled)}
        className="text-xs text-paper/50 hover:text-paper self-start underline"
      >
        {showSettled ? 'Hide settled' : 'Show settled'}
      </button>

      {notice && (
        <div className="rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 text-sm text-emerald">
          {notice}
        </div>
      )}

      <div className="rounded-xl border border-ink-border bg-ink-raised divide-y divide-ink-border">
        {visible.map((s) => {
          const youArePayer = s.payer_id === currentUserId;
          const otherPerson = youArePayer ? s.owed_by : s.payer;
          const settling = isPending && settlingId === s.id;
          const reminding = isPending && remindingId === s.id;

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
                <span className={cn('font-ledger text-sm font-semibold', youArePayer ? 'text-emerald' : 'text-clay', s.settled && 'opacity-40 line-through')}>
                  {formatCurrency(s.amount)}
                </span>
                {!s.settled && (
                  <>
                    {youArePayer && (
                      <button
                        onClick={() => handleRemind(s.id)}
                        disabled={reminding}
                        className="flex items-center gap-1 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs font-medium text-paper/50 hover:border-gold/40 hover:text-gold disabled:opacity-40"
                      >
                        <Bell size={14} />
                        {reminding ? 'Saving...' : 'Remind'}
                      </button>
                    )}
                    <button
                      onClick={() => handleSettle(s.id)}
                      disabled={settling}
                      className="flex items-center gap-1 text-xs font-medium text-paper/50 hover:text-emerald disabled:opacity-40 border border-ink-border hover:border-emerald/40 rounded-lg px-2.5 py-1.5"
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
