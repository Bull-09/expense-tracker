import { CategoriesManager } from '@/components/dashboard/CategoriesManager';
import { getAllCategories, getMerchantRules, getTransactions } from '@/lib/data/dashboard';

export default async function CategoriesPage() {
  const [categories, rules, transactions] = await Promise.all([getAllCategories(), getMerchantRules(), getTransactions()]);
  const month = new Date().toISOString().slice(0, 7);
  const categorySpend = transactions.reduce<Record<string, number>>((totals, transaction) => {
    if (transaction.kind === 'expense' && transaction.category_id && transaction.occurred_on.startsWith(month)) totals[transaction.category_id] = (totals[transaction.category_id] ?? 0) + Number(transaction.amount);
    return totals;
  }, {});
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Settings</p>
        <h1 className="mt-1 text-2xl font-bold">Categories & rules</h1>
        <p className="mt-1 text-sm text-paper/50">Shape the capture chips. C-137 learns merchant choices when you correct a suggestion.</p>
      </div>
      <CategoriesManager initialCategories={categories} rules={rules} categorySpend={categorySpend} />
    </div>
  );
}
