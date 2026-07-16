import { getCurrentProfile, getDirectory, getSplitShares, computeBalances } from '@/lib/data/dashboard';
import { SplitsList } from '@/components/dashboard/SplitsList';
import { BalancesCard } from '@/components/dashboard/BalancesCard';

export default async function SplitsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [splitShares, directory] = await Promise.all([
    getSplitShares(),
    getDirectory(),
  ]);
  const balances = computeBalances(splitShares, profile.id);

  const totalOwedToYou = splitShares
    .filter((s) => s.payer_id === profile.id && !s.settled)
    .reduce((sum, s) => sum + s.amount, 0);
  const totalYouOwe = splitShares
    .filter((s) => s.owed_by_id === profile.id && !s.settled)
    .reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Splits</h1>
        <p className="text-paper/50 text-sm mt-1">Who owes who, and what&apos;s settled.</p>
      </div>

      <BalancesCard balances={balances} totalOwedToYou={totalOwedToYou} totalYouOwe={totalYouOwe} />

      <SplitsList splitShares={splitShares} currentUserId={profile.id} directory={directory} />
    </div>
  );
}
