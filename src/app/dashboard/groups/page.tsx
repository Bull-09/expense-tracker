import { getCurrentProfile, getDirectory, getExpenseSplits, getGroups } from '@/lib/data/dashboard';
import { GroupsPanel } from '@/components/dashboard/GroupsPanel';
import { GroupBalances } from '@/components/dashboard/GroupBalances';
import { DirectoryUser } from '@/lib/types';

export default async function GroupsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [groups, directory, expenseSplits] = await Promise.all([
    getGroups(),
    getDirectory(),
    getExpenseSplits(),
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Groups</h1>
        <p className="text-paper/50 text-sm mt-1">
          Make friend circles for trips, flatmates, events, and shared plans.
        </p>
      </div>

      <GroupsPanel
        groups={groups}
        directory={directory as DirectoryUser[]}
        currentUserId={profile.id}
        currentUpiId={profile.upi_id}
      />
      <div><h2 className="mb-3 text-lg font-bold">Group balances</h2><GroupBalances groups={groups} splits={expenseSplits} /></div>
    </div>
  );
}
