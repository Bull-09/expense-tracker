-- Adds neutral transfer activity for borrowed/lent friend money.
-- Run this in Supabase SQL Editor before using the updated app.

alter table public.transactions
  drop constraint if exists transactions_kind_check;

alter table public.transactions
  add constraint transactions_kind_check
  check (kind in ('expense', 'income', 'investment', 'transfer'));

comment on constraint transactions_kind_check on public.transactions
  is 'Allowed transaction kinds. transfer is neutral and should not affect income or expense totals.';
