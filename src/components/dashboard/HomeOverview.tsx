'use client';

import Link from 'next/link';
import { Briefcase, Car, ChevronRight, Circle, Film, HeartPulse, Home, Mic, Plane, Receipt, ShoppingBag, Utensils } from 'lucide-react';
import type { BalanceSummary, Category, DashboardTotals, Profile, Transaction } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';

const ICONS = { utensils: Utensils, car: Car, 'shopping-bag': ShoppingBag, receipt: Receipt, film: Film, 'heart-pulse': HeartPulse, plane: Plane, home: Home, briefcase: Briefcase, circle: Circle } as const;

export function HomeOverview({ profile, totals, categories, transactions, balances }: { profile: Profile; totals: DashboardTotals; categories: Category[]; transactions: Transaction[]; balances: BalanceSummary[] }) {
  const currency = profile.currency ?? 'INR';
  const budget = Number(profile.monthly_budget) || 0;
  const safeToSpend = budget > 0 ? Math.max(0, budget - totals.totalExpense) : Math.max(0, totals.netCashflow);
  const progress = budget > 0 ? Math.min(100, totals.totalExpense / budget * 100) : 0;
  const today = new Date();
  const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
  const month = today.toISOString().slice(0, 7);
  const spendByCategory = transactions.reduce<Record<string, number>>((result, transaction) => {
    if (transaction.kind === 'expense' && transaction.category_id && transaction.occurred_on.startsWith(month)) result[transaction.category_id] = (result[transaction.category_id] ?? 0) + Number(transaction.amount);
    return result;
  }, {});
  const budgetCategories = categories.filter((category) => category.kind === 'expense' && !category.is_hidden).slice(0, 6);
  const netSplit = totals.totalOwedToYou - totals.totalYouOwe;

  return <div className="space-y-5">
    <section className="rounded-[20px] border border-ink-border bg-[linear-gradient(160deg,var(--ink-border-soft),var(--ink-raised))] p-5">
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[.1em] text-paper/45">Safe to spend · {today.toLocaleDateString('en-IN', { month: 'long' })}</p><span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 font-ledger text-[11px] text-mint">{daysLeft} days left</span></div>
      <p className="mt-2 font-ledger text-4xl font-bold tracking-tight text-mint">{formatCurrency(safeToSpend, currency)}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-border"><span className="block h-full rounded-full bg-mint" style={{ width: `${progress}%` }} /></div>
      <p className="mt-2 text-xs text-paper/45">{budget > 0 ? `${formatCurrency(totals.totalExpense, currency)} spent of ${formatCurrency(budget, currency)} budget` : 'Set a monthly budget in Settings to calculate your safe-to-spend amount.'}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">{[{label:'In',value:totals.totalIncome,tone:'text-mint'},{label:'Out',value:totals.totalExpense,tone:'text-peach'},{label:'Invested',value:totals.totalInvestment,tone:'text-sand'}].map((item) => <div key={item.label} className="rounded-xl bg-paper/[.04] p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-paper/35">{item.label}</p><p className={`mt-1 truncate font-ledger text-sm font-bold ${item.tone}`}>{formatCurrency(item.value, currency)}</p></div>)}</div>
    </section>

    <button type="button" onClick={() => window.dispatchEvent(new Event('c137:open-voice-capture'))} className="flex w-full items-center gap-3 rounded-full border border-ink-border bg-ink-raised py-2 pl-4 pr-2 text-left"><span className="min-w-0 flex-1 truncate text-sm text-paper/40">&quot;Chai 30, split with Rahul…&quot;</span><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-ink shadow-[0_0_0_6px_color-mix(in_srgb,var(--mint)_15%,transparent)]"><Mic size={19} /></span></button>

    <section><div className="mb-2.5 flex items-center justify-between"><h2 className="text-sm font-semibold">Category budgets</h2><Link href="/dashboard/categories" className="text-xs font-semibold text-mint">Manage</Link></div><div className="flex gap-2.5 overflow-x-auto pb-1 thin-scroll">{budgetCategories.map((category) => { const Icon = ICONS[category.icon as keyof typeof ICONS] ?? Circle; const spent = spendByCategory[category.id] ?? 0; const categoryBudget = Number(category.monthly_budget) || 0; const categoryProgress = categoryBudget > 0 ? Math.min(100, spent / categoryBudget * 100) : 0; return <article key={category.id} className="w-[112px] shrink-0 rounded-2xl border border-ink-border bg-ink-raised p-3"><span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-ink" style={{ backgroundColor: category.color }}><Icon size={15} /></span><p className="mt-2 truncate text-xs font-semibold">{category.name}</p><div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-border"><span className="block h-full rounded-full" style={{ width: `${categoryProgress}%`, backgroundColor: category.color }} /></div><p className="mt-1.5 truncate font-ledger text-[10px] text-paper/45">{categoryBudget > 0 ? `${formatCurrency(spent, currency)} / ${formatCurrency(categoryBudget, currency)}` : `${formatCurrency(spent, currency)} · set budget`}</p></article>; })}</div></section>

    <Link href="/dashboard/splits" className="flex items-center justify-between rounded-2xl border border-ink-border bg-ink-raised px-4 py-3.5"><div className="flex min-w-0 items-center gap-3"><div className="flex -space-x-2">{balances.slice(0,3).map((balance) => <span key={balance.userId} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink-raised text-xs font-bold text-ink" style={{backgroundColor:balance.avatarColor}}>{balance.fullName.charAt(0)}</span>)}</div><div><p className="text-sm font-semibold">Splits</p><p className="text-xs text-paper/45">{netSplit >= 0 ? <>You&apos;re owed <span className="font-ledger text-mint">{formatCurrency(netSplit, currency)}</span> net</> : <>You owe <span className="font-ledger text-peach">{formatCurrency(Math.abs(netSplit), currency)}</span> net</>}</p></div></div><ChevronRight size={18} className="text-paper/35" /></Link>
  </div>;
}
