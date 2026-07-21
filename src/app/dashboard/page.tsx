import {
  getCurrentProfile,
  getTransactions,
  getSplitShares,
  getSubscriptions,
  ensureDueSubscriptionTransactions,
  computeTotals,
  computeBalances,
  getAllCategories,
} from '@/lib/data/dashboard';
import { generateInsights, generateBudgetInsight } from '@/lib/insights';
import { estimateMoneyFlow } from '@/lib/forecast';
import { BalancesCard } from '@/components/dashboard/BalancesCard';
import { InsightsCard } from '@/components/dashboard/InsightsCard';
import { EstimateCard } from '@/components/dashboard/EstimateCard';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { SubscriptionBurnCard } from '@/components/dashboard/SubscriptionBurnCard';
import { HomeOverview } from '@/components/dashboard/HomeOverview';

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  await ensureDueSubscriptionTransactions();

  const [transactions, splitShares, subscriptions, categories] = await Promise.all([
    getTransactions(),
    getSplitShares(),
    getSubscriptions(),
    getAllCategories(),
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

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <HomeOverview profile={profile} totals={totals} categories={categories} transactions={transactions} balances={balances} />
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

    </div>
  );
}
