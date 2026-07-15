-- One-shot repair for the live app schema.
-- Run in Supabase SQL Editor if production shows hidden Server Components
-- errors after saving transactions, transfers, or subscriptions.

alter table public.transactions
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists transactions_group_date_idx
  on public.transactions (group_id, occurred_on desc);

alter table public.transactions
  drop constraint if exists transactions_kind_check;

alter table public.transactions
  add constraint transactions_kind_check
  check (kind in ('expense', 'income', 'investment', 'transfer'));

alter table public.subscriptions
  drop constraint if exists subscriptions_frequency_check;

alter table public.subscriptions
  add constraint subscriptions_frequency_check
  check (frequency in ('weekly', 'monthly'));

notify pgrst, 'reload schema';
