import { Transaction } from '@/lib/types';

export interface MoneyEstimate {
  projectedIncome: number;
  projectedExpense: number;
  projectedInvestment: number;
  projectedNet: number;
  yearlyIncome: number;
  yearlyExpense: number;
  yearlyInvestment: number;
  yearlyNet: number;
  confidence: 'low' | 'medium' | 'high';
  basis: string;
}

type MonthlyTotals = {
  income: number;
  expense: number;
  investment: number;
};

function emptyTotals(): MonthlyTotals {
  return { income: 0, expense: 0, investment: 0 };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function blend(currentPace: number, historyAverage: number, historyCount: number) {
  if (historyCount === 0) return currentPace;
  if (currentPace === 0) return historyAverage;

  const historyWeight = Math.min(0.65, historyCount * 0.14);
  const paceWeight = 1 - historyWeight;
  return currentPace * paceWeight + historyAverage * historyWeight;
}

export function estimateMoneyFlow(transactions: Transaction[], now = new Date()): MoneyEstimate {
  const currentKey = monthKey(now);
  const dayOfMonth = Math.max(1, now.getDate());
  const monthDays = daysInMonth(now);
  const monthly = new Map<string, MonthlyTotals>();

  for (const transaction of transactions) {
    if (transaction.kind === 'transfer') continue;
    const date = new Date(transaction.occurred_on);
    const key = monthKey(date);
    const totals = monthly.get(key) ?? emptyTotals();
    totals[transaction.kind] += transaction.amount;
    monthly.set(key, totals);
  }

  const current = monthly.get(currentKey) ?? emptyTotals();
  const historical = [...monthly.entries()]
    .filter(([key]) => key !== currentKey)
    .map(([, totals]) => totals)
    .slice(-6);

  const paceMultiplier = monthDays / dayOfMonth;
  const paceIncome = current.income * paceMultiplier;
  const paceExpense = current.expense * paceMultiplier;
  const paceInvestment = current.investment * paceMultiplier;

  const avgIncome = average(historical.map((totals) => totals.income));
  const avgExpense = average(historical.map((totals) => totals.expense));
  const avgInvestment = average(historical.map((totals) => totals.investment));

  const projectedIncome = blend(paceIncome, avgIncome, historical.length);
  const projectedExpense = blend(paceExpense, avgExpense, historical.length);
  const projectedInvestment = blend(paceInvestment, avgInvestment, historical.length);
  const projectedNet = projectedIncome - projectedExpense - projectedInvestment;

  const yearlyIncome = projectedIncome * 12;
  const yearlyExpense = projectedExpense * 12;
  const yearlyInvestment = projectedInvestment * 12;
  const yearlyNet = projectedNet * 12;

  const transactionCount = transactions.length;
  const confidence = historical.length >= 4 && transactionCount >= 20
    ? 'high'
    : historical.length >= 2 && transactionCount >= 8
      ? 'medium'
      : 'low';

  const basis = historical.length > 0
    ? `Uses this month's pace blended with your last ${historical.length} month${historical.length === 1 ? '' : 's'}.`
    : "Uses this month's pace. It gets smarter after you log more months.";

  return {
    projectedIncome,
    projectedExpense,
    projectedInvestment,
    projectedNet,
    yearlyIncome,
    yearlyExpense,
    yearlyInvestment,
    yearlyNet,
    confidence,
    basis,
  };
}
