'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { TransactionKind } from '@/lib/types';
import { inferCategory } from '@/lib/categories/auto';
import { format } from 'date-fns';

export interface SplitInput {
  userId: string;
  amount: number;
}

function normalizeCategoryName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isTransactionKindConstraintError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes('transactions_kind_check') || message.includes('violates check constraint');
}

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? '';
  return (
    error?.code === '42P01'
    || error?.code === '42703'
    || error?.code === 'PGRST200'
    || message.includes('could not find')
    || message.includes('does not exist')
    || message.includes('schema cache')
  );
}

function withoutGroupId<T extends { group_id?: string | null }>(row: T) {
  const next = { ...row };
  delete next.group_id;
  return next;
}

export async function createCategory(input: {
  name: string;
  kind: 'expense' | 'income';
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const name = normalizeCategoryName(input.name);
  if (!name) throw new Error('Category name is required.');

  const { data, error } = await supabase
    .from('categories')
    .upsert({
      user_id: user.id,
      name,
      kind: input.kind,
      color: input.kind === 'income' ? '#3F7A5C' : '#B5544B',
      icon: 'circle',
    }, { onConflict: 'user_id,name,kind' })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/transactions');
  revalidatePath('/dashboard/subscriptions');

  return data as { id: string; name: string };
}

export async function createTransaction(input: {
  kind: TransactionKind;
  groupId?: string | null;
  categoryId: string | null;
  createCategoryName?: string | null;
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

  if (input.kind === 'transfer') {
    categoryId = null;
  } else if (!categoryId && input.createCategoryName?.trim()) {
    const category = await createCategory({
      name: input.createCategoryName,
      kind: input.kind === 'income' ? 'income' : 'expense',
    });
    categoryId = category.id;
  }

  if (!categoryId && input.kind !== 'transfer') {
    const { data: categories } = await supabase.from('categories').select('*');
    const inferred = inferCategory(input.kind, `${input.description} ${input.source ?? ''}`, categories ?? []);
    categoryId = inferred?.id ?? null;
  }

  const transactionRow = {
    user_id: user.id,
    ...(input.groupId ? { group_id: input.groupId } : {}),
    kind: input.kind,
    category_id: categoryId,
    amount: input.amount,
    description: input.description,
    source: input.kind === 'income' || input.kind === 'transfer' ? input.source ?? null : null,
    occurred_on: input.occurredOn,
    is_split: isSplit,
  };

  let { data: transaction, error } = await supabase
    .from('transactions')
    .insert(transactionRow)
    .select()
    .single();

  if (error && input.groupId && isMissingSchemaError(error)) {
    const fallback = await supabase
      .from('transactions')
      .insert(withoutGroupId(transactionRow))
      .select()
      .single();
    transaction = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (input.kind === 'transfer' && isTransactionKindConstraintError(error)) {
      throw new Error('Transfer activity needs the latest Supabase migration. Run supabase/updates/2026-07-16-transfer-transactions.sql once.');
    }
    throw new Error(error.message);
  }

  if (!transaction) throw new Error('Could not create transaction.');

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

export async function createFriendLedgerEntry(input: {
  direction: 'borrowed' | 'lent';
  personId: string;
  amount: number;
  description?: string | null;
  occurredOn: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  if (!input.amount || input.amount <= 0) throw new Error('Enter a valid amount.');
  if (input.personId === user.id) throw new Error('Pick another person.');

  const { data: person } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', input.personId)
    .single();
  if (!person) throw new Error('Friend not found. Ask them to sign up first.');

  const borrowed = input.direction === 'borrowed';
  const description = input.description?.trim()
    || (borrowed ? `Borrowed from ${person.full_name}` : `Lent to ${person.full_name}`);

  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      kind: 'transfer',
      category_id: null,
      amount: input.amount,
      description,
      source: borrowed ? `From ${person.full_name}` : `To ${person.full_name}`,
      occurred_on: input.occurredOn,
      is_split: true,
    })
    .select()
    .single();

  if (error) {
    if (isTransactionKindConstraintError(error)) {
      throw new Error('Friend money tracking needs the latest Supabase migration. Run supabase/updates/2026-07-16-transfer-transactions.sql once.');
    }
    throw new Error(error.message);
  }

  const { error: splitError } = await supabase.from('split_shares').insert({
    transaction_id: transaction.id,
    payer_id: borrowed ? input.personId : user.id,
    owed_by_id: borrowed ? user.id : input.personId,
    amount: input.amount,
  });

  if (splitError) {
    throw new Error(
      borrowed
        ? `${splitError.message}. Run the latest Supabase split policy update so borrowed money can be tracked.`
        : splitError.message
    );
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/transactions');
  revalidatePath('/dashboard/splits');
}

function nextDueDateFromBillingDay(billingDay: number, from = new Date()) {
  const safeDay = Math.min(Math.max(Math.trunc(billingDay), 1), 31);
  const thisMonthLastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  const thisMonthDue = new Date(from.getFullYear(), from.getMonth(), Math.min(safeDay, thisMonthLastDay));
  if (thisMonthDue >= new Date(from.toDateString())) return format(thisMonthDue, 'yyyy-MM-dd');

  const nextMonthLastDay = new Date(from.getFullYear(), from.getMonth() + 2, 0).getDate();
  return format(new Date(from.getFullYear(), from.getMonth() + 1, Math.min(safeDay, nextMonthLastDay)), 'yyyy-MM-dd');
}

export async function createSubscription(input: {
  name: string;
  amount: number;
  billingDay: number;
  frequency?: 'weekly' | 'monthly';
  categoryId?: string | null;
  groupId?: string | null;
  nextDueOn?: string | null;
  notes?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const name = input.name.trim();
  if (!name) throw new Error('Subscription name is required.');
  if (!input.amount || input.amount <= 0) throw new Error('Subscription needs a valid amount.');

  const billingDay = Math.min(Math.max(Math.trunc(input.billingDay || new Date().getDate()), 1), 31);
  const frequency = input.frequency === 'weekly' ? 'weekly' : 'monthly';
  let categoryId = input.categoryId ?? null;

  if (!categoryId) {
    const { data: categories } = await supabase.from('categories').select('*').eq('user_id', user.id);
    categoryId = inferCategory('expense', name, categories ?? [])?.id ?? null;
  }

  const { error } = await supabase.from('subscriptions').insert({
    user_id: user.id,
    group_id: input.groupId ?? null,
    category_id: categoryId,
    name,
    amount: input.amount,
    billing_day: billingDay,
    frequency,
    next_due_on: input.nextDueOn || nextDueDateFromBillingDay(billingDay),
    notes: input.notes?.trim() || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/subscriptions');
  revalidatePath('/dashboard/transactions');
}

export async function updateSubscription(input: {
  id: string;
  name: string;
  amount: number;
  billingDay: number;
  frequency?: 'weekly' | 'monthly';
  categoryId?: string | null;
  groupId?: string | null;
  nextDueOn: string;
  active: boolean;
  notes?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const name = input.name.trim();
  if (!name) throw new Error('Subscription name is required.');
  if (!input.amount || input.amount <= 0) throw new Error('Subscription needs a valid amount.');

  const billingDay = Math.min(Math.max(Math.trunc(input.billingDay), 1), 31);
  const frequency = input.frequency === 'weekly' ? 'weekly' : 'monthly';
  const { error } = await supabase
    .from('subscriptions')
    .update({
      group_id: input.groupId ?? null,
      category_id: input.categoryId ?? null,
      name,
      amount: input.amount,
      billing_day: billingDay,
      frequency,
      next_due_on: input.nextDueOn,
      active: input.active,
      notes: input.notes?.trim() || null,
    })
    .eq('id', input.id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/subscriptions');
  revalidatePath('/dashboard/transactions');
}

export async function deleteSubscription(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('subscriptions').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/subscriptions');
  revalidatePath('/dashboard/transactions');
}

export async function updateTransaction(input: {
  id: string;
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

  let categoryId = input.kind === 'transfer' ? null : input.categoryId;
  if (!categoryId && input.kind !== 'transfer') {
    const { data: categories } = await supabase.from('categories').select('*');
    const inferred = inferCategory(input.kind, `${input.description} ${input.source ?? ''}`, categories ?? []);
    categoryId = inferred?.id ?? null;
  }

  const isSplit = (input.kind === 'expense' || input.kind === 'transfer') && !!(input.splits && input.splits.length > 0);

  const transactionPatch = {
    group_id: input.groupId ?? null,
    kind: input.kind,
    category_id: categoryId,
    amount: input.amount,
    description: input.description,
    source: input.kind === 'income' || input.kind === 'transfer' ? input.source ?? null : null,
    occurred_on: input.occurredOn,
    is_split: isSplit,
  };

  let { error } = await supabase
    .from('transactions')
    .update(transactionPatch)
    .eq('id', input.id)
    .eq('user_id', user.id);

  if (error && isMissingSchemaError(error)) {
    const fallback = await supabase
      .from('transactions')
      .update(withoutGroupId(transactionPatch))
      .eq('id', input.id)
      .eq('user_id', user.id);
    error = fallback.error;
  }

  if (error) {
    if (input.kind === 'transfer' && isTransactionKindConstraintError(error)) {
      throw new Error('Transfer activity needs the latest Supabase migration. Run supabase/updates/2026-07-16-transfer-transactions.sql once.');
    }
    throw new Error(error.message);
  }

  const { error: deleteSplitError } = await supabase
    .from('split_shares')
    .delete()
    .eq('transaction_id', input.id)
    .eq('payer_id', user.id);
  if (deleteSplitError) throw new Error(deleteSplitError.message);

  if (isSplit && input.splits) {
    const rows = input.splits
      .filter((s) => s.userId !== user.id)
      .map((s) => ({
        transaction_id: input.id,
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

export async function recordSplitReminder(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: share, error: shareError } = await supabase
    .from('split_shares')
    .select('*, transaction:transactions(description)')
    .eq('id', id)
    .eq('payer_id', user.id)
    .single();

  if (shareError) throw new Error(shareError.message);
  if (!share) throw new Error('You can remind only people who owe you.');

  const description = share.transaction?.description ?? 'split expense';
  const { error } = await supabase.from('split_reminders').insert({
    split_share_id: id,
    sender_id: user.id,
    recipient_id: share.owed_by_id,
    message: `Reminder for ${description}`,
  });

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
