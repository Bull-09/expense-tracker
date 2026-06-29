import { createClient } from '@/lib/supabase/server';
import { Profile, Transaction, SplitShare, Category, BalanceSummary, DashboardTotals } from '@/lib/types';

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
  const { data } = await supabase
    .from('transactions')
    .select('*, category:categories(*)')
    .order('occurred_on', { ascending: false })
    .limit(limit);
  return (data ?? []) as Transaction[];
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
