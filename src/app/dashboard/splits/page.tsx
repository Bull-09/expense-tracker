import { getCurrentProfile, getDirectory, getExpenseSplits, getGroups, getSplitShares, computeBalances } from '@/lib/data/dashboard';
import { SplitsList } from '@/components/dashboard/SplitsList';
import { BalancesCard } from '@/components/dashboard/BalancesCard';
import { GroupBalances } from '@/components/dashboard/GroupBalances';

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

      <GroupBalances groups={groups} splits={expenseSplits} currentUserId={profile.id} />

      <details className="rounded-2xl border border-ink-border bg-ink-raised">
        <summary className="cursor-pointer px-4 py-4 font-semibold text-paper/70">Show direct IOUs <span className="ml-2 text-xs font-normal text-paper/35">One-off lending outside groups</span></summary>
        <div className="space-y-4 border-t border-ink-border p-4"><BalancesCard balances={balances} totalOwedToYou={totalOwedToYou} totalYouOwe={totalYouOwe} /><SplitsList splitShares={splitShares} currentUserId={profile.id} directory={directory} groups={groups} /></div>
      </details>
    </div>
  );
}
