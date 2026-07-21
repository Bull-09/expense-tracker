'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Briefcase, Car, Circle, Eye, EyeOff, Film, HeartPulse, Home, Pencil, Plane, Plus, Receipt, ShoppingBag, Trash2, Utensils, X } from 'lucide-react';
import { deleteCategory, reorderCategory, saveCategory, setCategoryHidden } from '@/app/actions/categories';
import type { Category, CategoryKind, MerchantRule } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils/format';

const ICONS = { utensils: Utensils, car: Car, 'shopping-bag': ShoppingBag, receipt: Receipt, film: Film, 'heart-pulse': HeartPulse, plane: Plane, home: Home, briefcase: Briefcase, circle: Circle } as const;
const COLORS = ['#62D99A', '#F2A57E', '#E4C36B', '#B79BCB', '#7FB4C7'];

type Draft = { id?: string; name: string; kind: CategoryKind; icon: string; color: string; monthlyBudget: string };
const EMPTY: Draft = { name: '', kind: 'expense', icon: 'circle', color: COLORS[0], monthlyBudget: '' };

export function CategoriesManager({ initialCategories, rules, categorySpend }: { initialCategories: Category[]; rules: MerchantRule[]; categorySpend: Record<string, number> }) {
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
      await saveCategory({ ...draft, monthlyBudget: draft.monthlyBudget ? Number(draft.monthlyBudget) : null });
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((category, index) => {
          const CategoryIcon = ICONS[category.icon as keyof typeof ICONS] ?? Circle;
          const spent = categorySpend[category.id] ?? 0;
          const budget = Number(category.monthly_budget) || 0;
          const progress = budget > 0 ? Math.min(100, spent / budget * 100) : 0;
          return (
          <article key={category.id} className={cn('rounded-2xl border border-ink-border bg-ink-raised p-4', category.is_hidden && 'opacity-45')}>
            <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink" style={{ backgroundColor: category.color }} aria-hidden="true"><CategoryIcon size={19} /></span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{category.name}</p><p className="text-xs text-paper/40">{category.kind}{category.is_default ? ' · default' : ''} · used {category.usage_count ?? 0}×</p></div>
            <div className="flex items-center gap-1">
              <button type="button" disabled={index === 0 || pending} onClick={() => move(category, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55 disabled:opacity-25" aria-label={`Move ${category.name} up`}><ArrowUp size={15} /></button>
              <button type="button" disabled={index === categories.length - 1 || pending} onClick={() => move(category, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55 disabled:opacity-25" aria-label={`Move ${category.name} down`}><ArrowDown size={15} /></button>
            </div>
            </div>
            <div className="mt-4"><div className="flex items-center justify-between text-[11px] text-paper/40"><span>{budget > 0 ? `${formatCurrency(spent)} spent` : `${formatCurrency(spent)} this month`}</span><span>{budget > 0 ? `of ${formatCurrency(budget)}` : 'No budget set'}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink"><span className="block h-full rounded-full bg-mint" style={{ width: `${progress}%` }} /></div></div>
            <div className="mt-4 flex items-center justify-end gap-1 border-t border-ink-border pt-3"><button type="button" onClick={() => toggle(category)} className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2 text-xs text-paper/55" aria-label={`${category.is_hidden ? 'Show' : 'Hide'} ${category.name}`}>{category.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}{category.is_hidden ? 'Show' : 'Hide'}</button><button type="button" onClick={() => setDraft({ id: category.id, name: category.name, kind: category.kind, icon: category.icon, color: category.color, monthlyBudget: category.monthly_budget ? String(category.monthly_budget) : '' })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper/55" aria-label={`Edit ${category.name}`}><Pencil size={15} /></button>{!category.is_default && <button type="button" onClick={() => remove(category)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-peach" aria-label={`Delete ${category.name}`}><Trash2 size={15} /></button>}</div>
          </article>
          );
        })}
      </div>
      <aside className="rounded-2xl border border-ink-border bg-ink-raised p-4 lg:sticky lg:top-6"><p className="text-xs font-semibold uppercase tracking-[.14em] text-mint">Auto-rules</p><h2 className="mt-1 font-bold">Merchant matches</h2><p className="mt-1 text-xs leading-5 text-paper/45">Corrections teach C-137 locally before any AI call.</p><div className="mt-4 space-y-2">{rules.slice(0, 12).map((rule) => { const category = categories.find((item) => item.id === rule.category_id); const RuleIcon = ICONS[category?.icon as keyof typeof ICONS] ?? Circle; return <div key={rule.id} className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg text-ink" style={{ backgroundColor: category?.color ?? COLORS[0] }}><RuleIcon size={14} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{rule.merchant_pattern}</p><p className="truncate text-[11px] text-paper/40">→ {category?.name ?? 'Category'} · {rule.usage_count} matches</p></div></div>; })}{rules.length === 0 && <p className="rounded-xl border border-dashed border-ink-border px-3 py-5 text-center text-xs text-paper/40">Rules appear as you correct merchant categories.</p>}</div></aside>
      </div>

      {draft && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5">
          <button type="button" className="absolute inset-0" onClick={() => setDraft(null)} aria-label="Close" />
          <section role="dialog" aria-modal="true" className="relative w-full rounded-t-[28px] border border-ink-border bg-ink-raised p-5 sm:max-w-md sm:rounded-[28px]">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{draft.id ? 'Edit category' : 'New category'}</h2><button type="button" onClick={() => setDraft(null)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper/60"><X size={17} /></button></div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-paper/40">Name<input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-ink-border bg-ink px-3 text-sm normal-case tracking-normal text-paper outline-none focus:border-mint" /></label>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-paper/40">Type<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CategoryKind })} className="mt-2 h-11 w-full rounded-xl border border-ink-border bg-ink px-3 text-sm normal-case text-paper"><option value="expense">Expense</option><option value="income">Income</option></select></label>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-paper/40">Monthly budget<input type="number" min="0" step="100" value={draft.monthlyBudget} onChange={(event) => setDraft({ ...draft, monthlyBudget: event.target.value })} placeholder="No limit" className="mt-2 h-11 w-full rounded-xl border border-ink-border bg-ink px-3 font-ledger text-sm normal-case tracking-normal text-paper outline-none focus:border-mint" /></label>
            <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-paper/40">Icon</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(ICONS).map(([name, Icon]) => <button key={name} type="button" onClick={() => setDraft({ ...draft, icon: name })} className={cn('flex h-10 w-10 items-center justify-center rounded-xl border-2 bg-ink text-paper/65', draft.icon === name ? 'border-mint text-mint' : 'border-ink-border')} aria-label={name}><Icon size={18} /></button>)}</div></div>
            <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wider text-paper/40">Color</p><div className="mt-2 flex flex-wrap gap-2">{COLORS.map((color) => <button key={color} type="button" onClick={() => setDraft({ ...draft, color })} className={cn('h-9 w-9 rounded-full border-2', draft.color === color ? 'border-paper' : 'border-transparent')} style={{ backgroundColor: color }} aria-label={color} />)}</div></div>
            <button type="button" onClick={() => void submit()} className="mt-5 h-12 w-full rounded-xl bg-mint text-sm font-bold text-ink">Save category</button>
          </section>
        </div>
      )}
    </div>
  );
}
