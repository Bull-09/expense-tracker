import { Transaction } from '@/lib/types';
import { startOfMonth, subMonths, isWithinInterval, endOfMonth } from 'date-fns';

export interface Insight {
  id: string;
  tone: 'warning' | 'positive' | 'neutral';
  title: string;
  detail: string;
}

function monthRange(monthsAgo: number) {
  const now = new Date();
  const target = subMonths(now, monthsAgo);
  return { start: startOfMonth(target), end: endOfMonth(target) };
}

function sumByCategory(transactions: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of transactions) {
    const key = t.category?.name ?? 'Uncategorized';
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }
  return map;
}

/**
 * Generates rule-based financial insights from raw transaction data.
 * Entirely local — no external API calls, no keys required.
 */
export function generateInsights(transactions: Transaction[]): Insight[] {
  const insights: Insight[] = [];

  const thisMonth = monthRange(0);
  const lastMonth = monthRange(1);

  const thisMonthTx = transactions.filter(
    (t) => t.kind === 'expense' && isWithinInterval(new Date(t.occurred_on), thisMonth)
  );
  const lastMonthTx = transactions.filter(
    (t) => t.kind === 'expense' && isWithinInterval(new Date(t.occurred_on), lastMonth)
  );

  const thisMonthByCategory = sumByCategory(thisMonthTx);
  const lastMonthByCategory = sumByCategory(lastMonthTx);

  // 1. Category spend spikes vs last month
  for (const [category, amount] of thisMonthByCategory.entries()) {
    const prev = lastMonthByCategory.get(category) ?? 0;
    if (prev > 0 && amount > prev * 1.3 && amount - prev > 200) {
      const pct = Math.round(((amount - prev) / prev) * 100);
      insights.push({
        id: `spike-${category}`,
        tone: 'warning',
        title: `${category} is up ${pct}% this month`,
        detail: `You've spent ${Math.round(amount)} on ${category} so far, compared to ${Math.round(prev)} last month.`,
      });
    }
  }

  // 2. Category drops (positive reinforcement)
  for (const [category, amount] of thisMonthByCategory.entries()) {
    const prev = lastMonthByCategory.get(category) ?? 0;
    if (prev > 0 && amount < prev * 0.7 && prev - amount > 200) {
      const pct = Math.round(((prev - amount) / prev) * 100);
      insights.push({
        id: `drop-${category}`,
        tone: 'positive',
        title: `${category} spending down ${pct}%`,
        detail: `Nice — you're spending less here than last month. Keep it up.`,
      });
    }
  }

  // 3. Top category this month
  const sortedThisMonth = [...thisMonthByCategory.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedThisMonth.length > 0) {
    const [topCategory, topAmount] = sortedThisMonth[0];
    const totalThisMonth = [...thisMonthByCategory.values()].reduce((a, b) => a + b, 0);
    if (totalThisMonth > 0) {
      const share = Math.round((topAmount / totalThisMonth) * 100);
      if (share > 35) {
        insights.push({
          id: 'top-category',
          tone: 'neutral',
          title: `${topCategory} is your biggest expense this month`,
          detail: `It makes up ${share}% of your total spending so far.`,
        });
      }
    }
  }

  // 4. Income volatility check (freelance-specific)
  const incomeTx = transactions.filter((t) => t.kind === 'income');
  const incomeByMonth = new Map<string, number>();
  for (const t of incomeTx) {
    const key = `${new Date(t.occurred_on).getFullYear()}-${new Date(t.occurred_on).getMonth()}`;
    incomeByMonth.set(key, (incomeByMonth.get(key) ?? 0) + t.amount);
  }
  const incomeValues = [...incomeByMonth.values()];
  if (incomeValues.length >= 2) {
    const avg = incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length;
    const latest = incomeValues[incomeValues.length - 1];
    if (latest < avg * 0.6) {
      insights.push({
        id: 'income-dip',
        tone: 'warning',
        title: 'Income is lower than your average this month',
        detail: `This month's income is noticeably below your typical monthly average. Worth keeping an eye on discretionary spending.`,
      });
    }
  }

  // 5. No investment activity
  const hasInvestedRecently = transactions.some(
    (t) => t.kind === 'investment' && isWithinInterval(new Date(t.occurred_on), thisMonth)
  );
  const totalIncomeThisMonth = transactions
    .filter((t) => t.kind === 'income' && isWithinInterval(new Date(t.occurred_on), thisMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  if (!hasInvestedRecently && totalIncomeThisMonth > 0) {
    insights.push({
      id: 'no-investment',
      tone: 'neutral',
      title: "You haven't logged any investments this month",
      detail: 'If you set money aside this month, log it here to track your savings rate over time.',
    });
  }

  // 6. Budget check, if user has set one
  // (handled separately in dashboard since it needs profile.monthly_budget)

  return insights.slice(0, 6);
}

export function generateBudgetInsight(totalExpenseThisMonth: number, budget: number | null): Insight | null {
  if (!budget || budget <= 0) return null;
  const pct = (totalExpenseThisMonth / budget) * 100;
  if (pct >= 100) {
    return {
      id: 'budget-exceeded',
      tone: 'warning',
      title: "You've gone over your monthly budget",
      detail: `You've spent ${Math.round(pct)}% of your ${budget} budget this month.`,
    };
  }
  if (pct >= 80) {
    return {
      id: 'budget-warning',
      tone: 'warning',
      title: "You're close to your monthly budget",
      detail: `You've used ${Math.round(pct)}% of your budget for this month.`,
    };
  }
  return null;
}
