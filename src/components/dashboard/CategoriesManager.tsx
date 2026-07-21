'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Briefcase, Car, Circle, Eye, EyeOff, Film, HeartPulse, Home, Pencil, Plane, Plus, Receipt, ShoppingBag, Trash2, Utensils, X } from 'lucide-react';
import { deleteCategory, reorderCategory, saveCategory, setCategoryHidden } from '@/app/actions/categories';
import type { Category, CategoryKind } from '@/lib/types';
import { cn } from '@/lib/utils/format';

const ICONS = { utensils: Utensils, car: Car, 'shopping-bag': ShoppingBag, receipt: Receipt, film: Film, 'heart-pulse': HeartPulse, plane: Plane, home: Home, briefcase: Briefcase, circle: Circle } as const;
const COLORS = ['#62D99A', '#F2A57E', '#E4C36B', '#B79BCB', '#7FB4C7'];

type Draft = { id?: string; name: string; kind: CategoryKind; icon: string; color: string };
const EMPTY: Draft = { name: '', kind: 'expense', icon: 'circle', color: COLORS[0] };

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(optimistic: () => void, action: () => Promise<void>) {
    const previous = categories;
    optimistic();
    setError(null);
    startTransition(async () => {
      try { await action(); }
      catch (reason) { setCategories(previous); setError(reason instanceof Error ? reason.message : 'Could not update categories.'); }
    });
  }

  function move(category: Category, direction: -1 | 1) {
    run(() => {
      setCategories((current) => {
        const next = [...current];
        const index = next.findIndex((item) => item.id === category.id);
        const target = index + direction;
        if (target < 0 || target >= next.length) return current;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    }, () => reorderCategory(category.id, direction));
  }

  function toggle(category: Category) {
    run(
      () => setCategories((current) => current.map((item) => item.id === category.id ? { ...item, is_hidden: !item.is_hidden } : item)),
      () => setCategoryHidden(category.id, !category.is_hidden)
    );
  }

  function remove(category: Category) {
    run(() => setCategories((current) => current.filter((item) => item.id !== category.id)), () => deleteCategory(category.id));
  }

  async function submit() {
    if (!draft?.name.trim()) return;
    try {
      setError(null);
      await saveCategory(draft);
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save category.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-ink-border bg-ink-raised p-4">
        <div><p className="font-semibold">Capture categories</p><p className="text-xs text-paper/45">Most-used categories still rise to the front automatically.</p></div>
        <button type="button" onClick={() => setDraft(EMPTY)} className="flex h-10 items-center gap-2 rounded-xl bg-mint px-4 text-sm font-bold text-ink"><Plus size={16} /> Add</button>
      </div>

      {error && <p role="alert" className="rounded-xl border border-peach/30 bg-peach/10 px-3 py-2 text-sm text-peach">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-ink-border bg-ink-raised">
        {categories.map((category, index) => {
          const CategoryIcon = ICONS[category.icon as keyof typeof ICONS] ?? Circle;
          return (
          <div key={category.id} className={cn('flex items-center gap-3 px-4 py-3', index > 0 && 'border-t border-ink-border', category.is_hidden && 'opacity-45')}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink" style={{ backgroundColor: category.color }} aria-hidden="true"><CategoryIcon size={18} /></span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{category.name}</p><p className="text-xs text-paper/40">{category.kind} · {category.icon}{category.is_default ? ' · default' : ''} · used {category.usage_count ?? 0}×</p></div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={index === 0 || pending} onClick={() => move(category, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55 disabled:opacity-25" aria-label={`Move ${category.name} up`}><ArrowUp size={15} /></button>
              <button type="button" disabled={index === categories.length - 1 || pending} onClick={() => move(category, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55 disabled:opacity-25" aria-label={`Move ${category.name} down`}><ArrowDown size={15} /></button>
              <button type="button" onClick={() => toggle(category)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55" aria-label={`${category.is_hidden ? 'Show' : 'Hide'} ${category.name}`}>{category.is_hidden ? <Eye size={15} /> : <EyeOff size={15} />}</button>
              {!category.is_default && <button type="button" onClick={() => setDraft({ id: category.id, name: category.name, kind: category.kind, icon: category.icon, color: category.color })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55" aria-label={`Edit ${category.name}`}><Pencil size={15} /></button>}
              {!category.is_default && <button type="button" onClick={() => remove(category)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-peach" aria-label={`Delete ${category.name}`}><Trash2 size={15} /></button>}
            </div>
          </div>
          );
        })}
      </div>

      {draft && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <button type="button" className="absolute inset-0" onClick={() => setDraft(null)} aria-label="Close" />
          <section role="dialog" aria-modal="true" className="relative w-full rounded-t-[28px] border border-ink-border bg-ink-raised p-5 sm:max-w-md sm:rounded-[28px]">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{draft.id ? 'Edit category' : 'New category'}</h2><button type="button" onClick={() => setDraft(null)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper/60"><X size={17} /></button></div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-paper/40">Name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-ink-border bg-ink px-3 text-sm normal-case tracking-normal text-paper outline-none focus:border-mint" /></label>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-paper/40">Type<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CategoryKind })} className="mt-2 h-11 w-full rounded-xl border border-ink-border bg-ink px-3 text-sm normal-case text-paper"><option value="expense">Expense</option><option value="income">Income</option></select></label>
            <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-paper/40">Icon</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(ICONS).map(([name, Icon]) => <button key={name} type="button" onClick={() => setDraft({ ...draft, icon: name })} className={cn('flex h-10 w-10 items-center justify-center rounded-xl border-2 bg-ink text-paper/65', draft.icon === name ? 'border-mint text-mint' : 'border-ink-border')} aria-label={name}><Icon size={18} /></button>)}</div></div>
            <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-paper/40">Color</p><div className="mt-2 flex flex-wrap gap-2">{COLORS.map((color) => <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} className={cn('h-9 w-9 rounded-full border-2', draft.color === color ? 'border-paper' : 'border-transparent')} style={{ backgroundColor: color }} aria-label={color} />)}</div></div>
            <button type="button" onClick={() => void submit()} className="mt-5 h-12 w-full rounded-xl bg-mint text-sm font-bold text-ink">Save category</button>
          </section>
        </div>
      )}
    </div>
  );
}
