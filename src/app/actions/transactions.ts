'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { TransactionKind } from '@/lib/types';
import { inferCategory } from '@/lib/categories/auto';

export interface SplitInput {
  userId: string;
  amount: number;
}

export async function createTransaction(input: {
  kind: TransactionKind;
  groupId?: string | null;
  categoryId: string | null;
  amount: number;
  description: string;
  source?: string;
  occurredOn: string;
  splits?: SplitInput[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const isSplit = !!(input.splits && input.splits.length > 0);
  let categoryId = input.categoryId;

  if (!categoryId) {
    const { data: categories } = await supabase.from('categories').select('*');
    const inferred = inferCategory(input.kind, `${input.description} ${input.source ?? ''}`, categories ?? []);
    categoryId = inferred?.id ?? null;
  }

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      ...(input.groupId ? { group_id: input.groupId } : {}),
      kind: input.kind,
      category_id: categoryId,
      amount: input.amount,
      description: input.description,
      source: input.source ?? null,
      occurred_on: input.occurredOn,
      is_split: isSplit,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (isSplit && input.splits) {
    const rows = input.splits
      .filter((s) => s.userId !== user.id)
      .map((s) => ({
        transaction_id: transaction.id,
        payer_id: user.id,
        owed_by_id: s.userId,
        amount: s.amount,
      }));

    if (rows.length > 0) {
      const { error: splitError } = await supabase.from('split_shares').insert(rows);
      if (splitError) throw new Error(splitError.message);
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/transactions');
  revalidatePath('/dashboard/splits');
}

export async function createGroup(input: {
  name: string;
  emoji: string;
  memberIds: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const name = input.name.trim();
  const emoji = input.emoji.trim() || '💸';
  if (!name) throw new Error('Group name is required.');

  const { data: group, error } = await supabase
    .from('groups')
    .insert({
      owner_id: user.id,
      name,
      emoji,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const uniqueMemberIds = [...new Set([user.id, ...input.memberIds])];
  const memberRows = uniqueMemberIds.map((memberId) => ({
    group_id: group.id,
    user_id: memberId,
    role: memberId === user.id ? 'owner' : 'member',
  }));

  const { error: memberError } = await supabase.from('group_members').insert(memberRows);
  if (memberError) throw new Error(memberError.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/groups');
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/transactions');
  revalidatePath('/dashboard/splits');
}

export async function settleSplitShare(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('split_shares')
    .update({ settled: true, settled_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/splits');
}

export async function updateBudget(monthlyBudget: number | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ monthly_budget: monthlyBudget })
    .eq('id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
}
