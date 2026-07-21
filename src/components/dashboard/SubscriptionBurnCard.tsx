import Link from 'next/link';
import { CalendarClock, Repeat2 } from 'lucide-react';
import { Subscription } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';
import { format } from 'date-fns';

export function SubscriptionBurnCard({ subscriptions }: { subscriptions: Subscription[] }) {
  const active = subscriptions.filter((subscription) => subscription.active);
  const monthlyTotal = active.reduce(
    (sum, subscription) => sum + (subscription.frequency === 'weekly' ? subscription.amount * 52 / 12 : subscription.amount),
    0
  );
  const next = active[0];

  return (
    <section className="rounded-xl border border-ink-border bg-ink-raised p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Subscriptions</h2>
          <p className="mt-1 text-sm text-paper/45">Recurring money that will hit your month.</p>
        </div>
        <Repeat2 size={18} className="text-mint" />
      </div>

      <div className="rounded-lg border border-ink-border bg-ink p-3">
        <p className="text-xs font-medium uppercase text-paper/40">Monthly burn</p>
        <p className="mt-1 font-ledger text-2xl font-bold text-peach">{formatCurrency(monthlyTotal)}</p>
      </div>

      {next ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-ink-border bg-ink px-3 py-2 text-sm text-paper/65">
          <CalendarClock size={15} className="text-sand" />
          <span className="truncate">
            Next: {next.name} on {format(new Date(next.next_due_on), 'MMM d')}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-sm text-paper/40">Add Netflix, gym, iCloud, EMIs, or any recurring payment.</p>
      )}

      <Link href="/dashboard/subscriptions" className="mt-4 inline-flex text-sm font-medium text-mint hover:text-mint/80">
        Manage subscriptions
      </Link>
    </section>
  );
}
