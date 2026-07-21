'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { merchantPatternFromText } from '@/lib/categories/rules';

const CATEGORY_KINDS = new Set(['expense', 'income']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, user };
}

function refreshCategories() {
  revalidatePath('/dashboard', 'layout');
  revalidatePath('/dashboard/categories');
}

export async function saveCategory(input: { id?: string; name: string; kind: string; icon: string; color: string; monthlyBudget?: number | null }) {
  const { supabase, user } = await authenticatedClient();
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw new Error('Category name is required.');
  if (!CATEGORY_KINDS.has(input.kind)) throw new Error('Invalid category type.');
  if (!HEX_COLOR.test(input.color)) throw new Error('Choose a valid category color.');

  if (input.id) {
    const { data: existing, error: lookupError } = await supabase.from('categories').select('user_id').eq('id', input.id).single();
    if (lookupError) throw new Error(lookupError.message);
    const patch = existing.user_id
      ? { name, kind: input.kind, icon: input.icon, color: input.color, monthly_budget: input.monthlyBudget ?? null }
      : { monthly_budget: input.monthlyBudget ?? null };
    const { error } = await supabase.from('categories').update(patch).eq('id', input.id);
    if (error) throw new Error(error.message);
  } else {
    const { data: last } = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from('categories').insert({ user_id: user.id, name, kind: input.kind, icon: input.icon, color: input.color, monthly_budget: input.monthlyBudget ?? null, sort_order: (last?.sort_order ?? 0) + 10 });
    if (error) throw new Error(error.message);
  }
  refreshCategories();
}

export async function setCategoryHidden(id: string, hidden: boolean) {
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.from('categories').update({ is_hidden: hidden }).eq('id', id);
  if (error) throw new Error(error.message);
  refreshCategories();
}

export async function reorderCategory(id: string, direction: -1 | 1) {
  const { supabase } = await authenticatedClient();
  const { data, error } = await supabase.from('categories').select('id, sort_order').order('sort_order').order('name');
  if (error) throw new Error(error.message);
  const index = (data ?? []).findIndex((category) => category.id === id);
  const swap = data?.[index + direction];
  const current = data?.[index];
  if (!current || !swap) return;
  const currentOrder = current.sort_order || index * 10;
  const swapOrder = swap.sort_order || (index + direction) * 10;
  const { error: updateError } = await supabase.from('categories').upsert([
    { id: current.id, sort_order: swapOrder },
    { id: swap.id, sort_order: currentOrder },
  ]);
  if (updateError) throw new Error(updateError.message);
  refreshCategories();
}

export async function deleteCategory(id: string) {
  const { supabase, user } = await authenticatedClient();
  const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw new Error(error.message);
  refreshCategories();
}

export async function learnMerchantRule(input: { text: string; categoryId: string }) {
  const { supabase, user } = await authenticatedClient();
  const merchantPattern = merchantPatternFromText(input.text);
  if (merchantPattern.length < 2 || !input.categoryId) return;

  const { data: existing } = await supabase
    .from('merchant_rules')
    .select('id, usage_count')
    .eq('user_id', user.id)
    .ilike('merchant_pattern', merchantPattern)
    .maybeSingle();
  const values = { user_id: user.id, merchant_pattern: merchantPattern, category_id: input.categoryId, usage_count: (existing?.usage_count ?? 0) + 1, last_used_at: new Date().toISOString() };
  const query = existing
    ? supabase.from('merchant_rules').update(values).eq('id', existing.id)
    : supabase.from('merchant_rules').insert(values);
  const { error } = await query;
  if (error) throw new Error(error.message);
}
