import { getCurrentProfile, getDirectory, getExpenseSplits, getGroups, getSplitShares, computeBalances } from '@/lib/data/dashboard';
import { SplitsList } from '@/components/dashboard/SplitsList';
import { BalancesCard } from '@/components/dashboard/BalancesCard';
import { GroupBalances } from '@/components/dashboard/GroupBalances';
import { ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

export default async function SplitsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [splitShares, directory, groups, expenseSplits] = await Promise.all([
    getSplitShares(),
    getDirectory(),
    getGroups(),
    getExpenseSplits(),
  ]);
  const balances = computeBalances(splitShares, profile.id);

  const totalOwedToYou = splitShares
    .filter((s) => s.payer_id === profile.id && !s.settled)
    .reduce((sum, s) => sum + s.amount, 0);
  const totalYouOwe = splitShares
    .filter((s) => s.owed_by_id === profile.id && !s.settled)
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold">Splits</h1>
        <p className="text-paper/50 text-sm mt-1">Who owes who, and what&apos;s settled.</p>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <GroupBalances groups={groups} splits={expenseSplits} currentUserId={profile.id} />
          <details className="rounded-2xl border border-ink-border bg-ink-raised">
            <summary className="cursor-pointer px-4 py-4 font-semibold text-paper/70">Show direct IOUs <span className="ml-2 text-xs font-normal text-paper/35">One-off lending outside groups</span></summary>
            <div className="space-y-4 border-t border-ink-border p-4"><BalancesCard balances={balances} totalOwedToYou={totalOwedToYou} totalYouOwe={totalYouOwe} /><SplitsList splitShares={splitShares} currentUserId={profile.id} directory={directory} groups={groups} /></div>
          </details>
        </div>
        <aside className="grid gap-4 sm:grid-cols-2 xl:sticky xl:top-6 xl:grid-cols-1">
          <section className="rounded-2xl border border-ink-border bg-ink-raised p-5">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-paper/40">Overall you&apos;re owed</p>
            <p className="mt-2 font-ledger text-3xl font-bold text-mint">{formatCurrency(Math.max(0, totalOwedToYou - totalYouOwe))}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-mint/10 p-3"><ArrowDownLeft size={16} className="text-mint" /><p className="mt-2 text-[11px] text-paper/40">Coming in</p><p className="mt-1 font-ledger text-sm font-bold text-mint">{formatCurrency(totalOwedToYou)}</p></div>
              <div className="rounded-xl bg-peach/10 p-3"><ArrowUpRight size={16} className="text-peach" /><p className="mt-2 text-[11px] text-paper/40">Going out</p><p className="mt-1 font-ledger text-sm font-bold text-peach">{formatCurrency(totalYouOwe)}</p></div>
            </div>
          </section>
          <section className="rounded-2xl border border-lilac/25 bg-lilac/10 p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lilac/15 text-lilac"><Sparkles size={19} /></span>
            <h2 className="mt-4 font-bold">Fewer payments, same result</h2>
            <p className="mt-2 text-sm leading-6 text-paper/50">C-137 nets unsettled group shares with the simplify-debts algorithm, then shows the minimum payment path for everyone.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
