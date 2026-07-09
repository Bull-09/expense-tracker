import { getCurrentProfile, getTransactions, getCategories, getDirectory, getGroups } from '@/lib/data/dashboard';
import { TransactionsList } from '@/components/dashboard/TransactionsList';
import { AddTransactionTrigger } from '@/components/dashboard/AddTransactionTrigger';
import { DirectoryUser } from '@/lib/types';

export default async function TransactionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const [transactions, categories, directory, groups] = await Promise.all([
    getTransactions(500),
    getCategories(),
    getDirectory(),
    getGroups(),
  ]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-paper/50 text-sm mt-1">Everything you&apos;ve logged, in one tracker.</p>
      </div>

      <TransactionsList
        transactions={transactions}
        categories={categories}
        directory={directory as DirectoryUser[]}
        groups={groups}
        currentUserId={profile.id}
      />

      <AddTransactionTrigger
        categories={categories}
        directory={directory as DirectoryUser[]}
        groups={groups}
        currentUserId={profile.id}
      />
    </div>
  );
}
