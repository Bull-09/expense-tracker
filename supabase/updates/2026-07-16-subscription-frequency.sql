-- Allows subscriptions to repeat weekly or monthly.
-- Run this in Supabase SQL Editor before saving weekly subscriptions.

alter table public.subscriptions
  drop constraint if exists subscriptions_frequency_check;

alter table public.subscriptions
  add constraint subscriptions_frequency_check
  check (frequency in ('weekly', 'monthly'));

comment on constraint subscriptions_frequency_check on public.subscriptions
  is 'Allowed subscription recurrence values.';
