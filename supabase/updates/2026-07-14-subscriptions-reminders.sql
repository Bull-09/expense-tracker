-- Subscriptions and split reminders for C-137 Capital.
-- Run in Supabase SQL Editor after the app deploys.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  billing_day integer not null check (billing_day between 1 and 31),
  frequency text not null default 'monthly' check (frequency = 'monthly'),
  next_due_on date not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users manage their own subscriptions" on public.subscriptions;
create policy "Users manage their own subscriptions"
  on public.subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

create unique index if not exists transactions_subscription_due_unique
  on public.transactions (user_id, subscription_id, occurred_on)
  where subscription_id is not null;

create index if not exists subscriptions_user_due_idx
  on public.subscriptions (user_id, active, next_due_on);

create table if not exists public.split_reminders (
  id uuid primary key default gen_random_uuid(),
  split_share_id uuid not null references public.split_shares(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.split_reminders enable row level security;

drop policy if exists "Split reminder participants can view reminders" on public.split_reminders;
create policy "Split reminder participants can view reminders"
  on public.split_reminders for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Payers can create split reminders" on public.split_reminders;
create policy "Payers can create split reminders"
  on public.split_reminders for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.split_shares s
      where s.id = split_share_id
        and s.payer_id = auth.uid()
        and s.owed_by_id = recipient_id
        and s.settled = false
    )
  );

create index if not exists split_reminders_share_idx
  on public.split_reminders (split_share_id, created_at desc);
