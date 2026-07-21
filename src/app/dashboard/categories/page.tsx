import { LayoutGrid } from 'lucide-react';

export default function CategoriesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold">Categories</h1>
        <p className="mt-1 text-sm text-paper/50">Category budgets and auto-rules arrive in Phase 3.</p>
      </div>
      <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-border-soft bg-ink-raised p-8 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-mint/10 text-mint">
          <LayoutGrid size={21} />
        </span>
        <p className="font-semibold">Your categories are still available when adding entries.</p>
        <p className="mt-1 max-w-md text-sm text-paper/45">This navigation destination is ready; management controls will be added in the categories phase.</p>
      </div>
    </div>
  );
}
