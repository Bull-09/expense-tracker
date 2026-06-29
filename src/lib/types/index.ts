export type TransactionKind = 'expense' | 'income' | 'investment';
export type CategoryKind = 'expense' | 'income';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_color: string;
  monthly_budget: number | null;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  group_id: string | null;
  kind: TransactionKind;
  category_id: string | null;
  amount: number;
  currency: string;
  description: string;
  source: string | null;
  occurred_on: string;
  is_split: boolean;
  created_at: string;
  category?: Category | null;
}

export interface Group {
  id: string;
  owner_id: string;
  name: string;
  emoji: string;
  created_at: string;
  members?: GroupMember[];
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
  created_at: string;
  profile?: Profile;
}

export interface SplitShare {
  id: string;
  transaction_id: string;
  payer_id: string;
  owed_by_id: string;
  amount: number;
  settled: boolean;
  settled_at: string | null;
  created_at: string;
  payer?: Profile;
  owed_by?: Profile;
  transaction?: Transaction;
}

export interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
  avatar_color: string;
}

export interface BalanceSummary {
  userId: string;
  fullName: string;
  avatarColor: string;
  theyOweYou: number;
  youOweThem: number;
  net: number; // positive = they owe you overall
}

export interface DashboardTotals {
  totalIncome: number;
  totalExpense: number;
  totalInvestment: number;
  netCashflow: number;
  totalOwedToYou: number;
  totalYouOwe: number;
}
