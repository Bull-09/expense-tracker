import {
  getCurrentProfile,
  getCategories,
  getTransactions,
  getSplitShares,
  getDirectory,
  getGroups,
  getSubscriptions,
  ensureDueSubscriptionTransactions,
  computeTotals,
  computeBalances,
} from '@/lib/data/dashboard';
import { generateInsights, generateBudgetInsight } from '@/lib/insights';
import { estimateMoneyFlow } from '@/lib/forecast';
import { SummaryStrip } from '@/components/dashboard/SummaryStrip';
import { BalancesCard } from '@/components/dashboard/BalancesCard';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { EstimateCard } from '@/components/dashboard/EstimateCard';
import { CategoryBreakdownChart } from '@/components/dashboard/CategoryBreakdownChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { AddTransactionTrigger } from '@/components/dashboard/AddTransactionTrigger';
import { DirectoryUser } from '@/lib/types';
import { SubscriptionBurnCard } from '@/components/dashboard/SubscriptionBurnCard';

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  await ensureDueSubscriptionTransactions();

  const [categories, transactions, splitShares, directory, groups, subscriptions] = await Promise.all([
    getCategories(),
    getTransactions(),
    getSplitShares(),
    getDirectory(),
    getGroups(),
    getSubscriptions(),
  ]);

  const totals = computeTotals(transactions, splitShares, profile.id);
  const balances = computeBalances(splitShares, profile.id);
  const estimate = estimateMoneyFlow(transactions);

  const insights = generateInsights(transactions);
  const budgetInsight = generateBudgetInsight(totals.totalExpense, profile.monthly_budget);
  const allInsights = budgetInsight ? [budgetInsight, ...insights] : insights;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">
          Hey {profile.full_name.split(' ')[0]}
        </h1>
        <p className="text-paper/50 text-sm mt-1">Here&apos;s where things stand this month.</p>
      </div>

      <SummaryStrip totals={totals} />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <CategoryBreakdownChart transactions={transactions} />
          <RecentTransactions transactions={transactions} />
        </div>
        <div className="flex flex-col gap-5">
          <SubscriptionBurnCard subscriptions={subscriptions} />
          <EstimateCard estimate={estimate} />
          <BalancesCard
            balances={balances}
            totalOwedToYou={totals.totalOwedToYou}
            totalYouOwe={totals.totalYouOwe}
          />
          <InsightsCard insights={allInsights} />
        </div>
      </div>

      <AddTransactionTrigger
        categories={categories}
        directory={directory as DirectoryUser[]}
        groups={groups}
        currentUserId={profile.id}
      />
    </div>
  );
}
