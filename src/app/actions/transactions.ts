'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { TransactionKind } from '@/lib/types';

export interface SplitInput {
  userId: string;
  amount: number;
}

export async function createTransaction(input: {
  kind: TransactionKind;
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

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      kind: input.kind,
      category_id: input.categoryId,
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
