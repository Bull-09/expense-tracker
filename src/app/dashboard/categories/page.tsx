import { CategoriesManager } from '@/components/dashboard/CategoriesManager';
import { getAllCategories } from '@/lib/data/dashboard';

export default async function CategoriesPage() {
  const categories = await getAllCategories();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mint">Settings</p>
        <h1 className="mt-1 text-2xl font-bold">Categories & rules</h1>
        <p className="mt-1 text-sm text-paper/50">Shape the capture chips. C-137 learns merchant choices when you correct a suggestion.</p>
      </div>
      <CategoriesManager initialCategories={categories} />
    </div>
  );
}
