import { createClient } from '@/lib/supabase/server';
import { addMonths, addWeeks, format, isAfter, parseISO } from 'date-fns';
import { inferCategory } from '@/lib/categories/auto';
import { Profile, Transaction, SplitShare, Category, BalanceSummary, DashboardTotals, Group, Subscription } from '@/lib/types';

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

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data as Profile | null;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('categories').select('*').order('name');
  return (data ?? []) as Category[];
}

export async function getTransactions(limit = 200): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('*, category:categories(*), subscription:subscriptions(*)')
    .order('occurred_on', { ascending: false })
    .limit(limit);

  if (error && isMissingSchemaError(error)) {
    const { data: fallbackData } = await supabase
      .from('transactions')
      .select('*, category:categories(*)')
      .order('occurred_on', { ascending: false })
      .limit(limit);
    return (fallbackData ?? []) as Transaction[];
  }

  return (data ?? []) as Transaction[];
}

export async function getSubscriptions(): Promise<Subscription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, category:categories(*), group:groups(*)')
    .order('active', { ascending: false })
    .order('next_due_on', { ascending: true });
  if (error && isMissingSchemaError(error)) return [];
  return (data ?? []) as Subscription[];
}

function dueDateForMonth(date: Date, billingDay: number) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth(), Math.min(billingDay, lastDay));
}

function nextMonthlyDue(currentDue: Date, billingDay: number) {
  return dueDateForMonth(addMonths(currentDue, 1), billingDay);
}

function nextSubscriptionDue(currentDue: Date, billingDay: number, frequency: Subscription['frequency']) {
  if (frequency === 'weekly') return addWeeks(currentDue, 1);
  return nextMonthlyDue(currentDue, billingDay);
}

export async function ensureDueSubscriptionTransactions(today = new Date()) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .lte('next_due_on', format(today, 'yyyy-MM-dd'));

  if (subscriptionsError && isMissingSchemaError(subscriptionsError)) return;
  if (subscriptionsError) throw new Error(subscriptionsError.message);
  if (!subscriptions?.length) return;

  const { data: categories } = await supabase.from('categories').select('*').eq('user_id', user.id);

  for (const subscription of subscriptions as Subscription[]) {
    let due = parseISO(subscription.next_due_on);
    const rows = [];

    while (!isAfter(due, today)) {
      const occurredOn = format(due, 'yyyy-MM-dd');
      rows.push({
        user_id: user.id,
        group_id: subscription.group_id,
        subscription_id: subscription.id,
        kind: 'expense',
        category_id: subscription.category_id ?? inferCategory('expense', subscription.name, categories ?? [])?.id ?? null,
        amount: subscription.amount,
        currency: subscription.currency ?? 'INR',
        description: `Subscription: ${subscription.name}`,
        source: null,
        occurred_on: occurredOn,
        is_split: false,
      });
      due = nextSubscriptionDue(due, subscription.billing_day, subscription.frequency);
    }

    if (rows.length > 0) {
      const dueDates = rows.map((row) => row.occurred_on);
      const { data: existing, error: existingError } = await supabase
        .from('transactions')
        .select('occurred_on')
        .eq('user_id', user.id)
        .eq('subscription_id', subscription.id)
        .in('occurred_on', dueDates);
      if (existingError && isMissingSchemaError(existingError)) return;
      if (existingError) throw new Error(existingError.message);

      const existingDates = new Set((existing ?? []).map((row) => row.occurred_on));
      const missingRows = rows.filter((row) => !existingDates.has(row.occurred_on));

      if (missingRows.length > 0) {
        const { error } = await supabase.from('transactions').insert(missingRows);
        if (error) throw new Error(error.message);
      }
    }

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({ next_due_on: format(due, 'yyyy-MM-dd') })
      .eq('id', subscription.id)
      .eq('user_id', user.id);
    if (updateError) throw new Error(updateError.message);
  }
}

export async function getSplitShares(): Promise<SplitShare[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('split_shares')
    .select('*, payer:profiles!split_shares_payer_id_fkey(*), owed_by:profiles!split_shares_owed_by_id_fkey(*), transaction:transactions(*)')
    .order('created_at', { ascending: false });
  return (data ?? []) as SplitShare[];
}

export async function getDirectory() {
  const supabase = await createClient();
  const { data } = await supabase.from('directory').select('*');
  return data ?? [];
}

export async function getGroups(): Promise<Group[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('groups')
    .select('*, members:group_members(*, profile:profiles(*))')
    .order('created_at', { ascending: false });

  if (!data) return [];

  return (data as Group[]).filter((group) =>
    group.owner_id === user.id || group.members?.some((member) => member.user_id === user.id)
  );
}

export function computeTotals(transactions: Transaction[], splitShares: SplitShare[], userId: string): DashboardTotals {
  const now = new Date();
  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.occurred_on);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const totalIncome = thisMonth.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = thisMonth.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalInvestment = thisMonth.filter((t) => t.kind === 'investment').reduce((s, t) => s + t.amount, 0);

  const totalOwedToYou = splitShares
    .filter((s) => s.payer_id === userId && !s.settled)
    .reduce((sum, s) => sum + s.amount, 0);

  const totalYouOwe = splitShares
    .filter((s) => s.owed_by_id === userId && !s.settled)
    .reduce((sum, s) => sum + s.amount, 0);

  return {
    totalIncome,
    totalExpense,
    totalInvestment,
    netCashflow: totalIncome - totalExpense - totalInvestment,
    totalOwedToYou,
    totalYouOwe,
  };
}

export function computeBalances(splitShares: SplitShare[], userId: string): BalanceSummary[] {
  const map = new Map<string, BalanceSummary>();

  for (const share of splitShares) {
    if (share.settled) continue;

    if (share.payer_id === userId && share.owed_by) {
      const existing = map.get(share.owed_by_id) ?? {
        userId: share.owed_by_id,
        fullName: share.owed_by.full_name,
        avatarColor: share.owed_by.avatar_color,
        theyOweYou: 0,
        youOweThem: 0,
        net: 0,
      };
      existing.theyOweYou += share.amount;
      existing.net += share.amount;
      map.set(share.owed_by_id, existing);
    }

    if (share.owed_by_id === userId && share.payer) {
      const existing = map.get(share.payer_id) ?? {
        userId: share.payer_id,
        fullName: share.payer.full_name,
        avatarColor: share.payer.avatar_color,
        theyOweYou: 0,
        youOweThem: 0,
        net: 0,
      };
      existing.youOweThem += share.amount;
      existing.net -= share.amount;
      map.set(share.payer_id, existing);
    }
  }

  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export function computeSubscriptionMonthlyTotal(subscriptions: Subscription[]) {
  return subscriptions
    .filter((subscription) => subscription.active)
    .reduce((sum, subscription) => sum + (subscription.frequency === 'weekly' ? subscription.amount * 52 / 12 : subscription.amount), 0);
}
