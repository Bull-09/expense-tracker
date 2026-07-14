import { AddTransactionTrigger } from '@/components/dashboard/AddTransactionTrigger';
import { SubscriptionsPanel } from '@/components/dashboard/SubscriptionsPanel';
import { DirectoryUser } from '@/lib/types';
import { getCategories, getCurrentProfile, getDirectory, getGroups, getSubscriptions } from '@/lib/data/dashboard';

export default async function SubscriptionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [subscriptions, categories, directory, groups] = await Promise.all([
    getSubscriptions(),
    getCategories(),
    getDirectory(),
    getGroups(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <p className="mt-1 text-sm text-paper/50">
          Track recurring costs and let Mithu add them to your monthly spend.
        </p>
      </div>

      <SubscriptionsPanel subscriptions={subscriptions} categories={categories} groups={groups} />

      <AddTransactionTrigger
        categories={categories}
        directory={directory as DirectoryUser[]}
        groups={groups}
        currentUserId={profile.id}
      />
    </div>
  );
}
