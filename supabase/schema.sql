-- ============================================================================
-- LEDGER: Expense Tracker Database Schema
-- Run this once in your Supabase project's SQL Editor.
-- Project: Settings -> SQL Editor -> New Query -> paste this whole file -> Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- Mirrors auth.users with public-safe fields (name, avatar) other users can see.
-- Created automatically on signup via trigger below.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New User',
  email text not null,
  avatar_color text not null default '#3F7A5C',
  monthly_budget numeric(12,2),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by all authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES
-- Per-user expense/income categories. A default set is seeded on signup.
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense', 'income')),
  color text not null default '#6B7280',
  icon text not null default 'circle',
  created_at timestamptz not null default now(),
  unique (user_id, name, kind)
);

alter table public.categories enable row level security;

create policy "Users manage their own categories"
  on public.categories for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. TRANSACTIONS
-- Single table for expenses, income, and investments (distinguished by `kind`).
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income', 'investment')),
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  description text not null default '',
  source text, -- for income: e.g. "Upwork", "Client X", "Retainer"
  occurred_on date not null default current_date,
  is_split boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "Users manage their own transactions"
  on public.transactions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc);

-- ----------------------------------------------------------------------------
-- 3B. GROUPS
-- Friend circles for flatmates, trips, couples, events, and shared costs.
-- ----------------------------------------------------------------------------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '💸',
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
  );
$$;

create policy "Group members can view their groups"
  on public.groups for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_group_member(id)
  );

create policy "Authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Owners can update their groups"
  on public.groups for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners can delete their groups"
  on public.groups for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "Group members can view memberships"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "Group owners can add members"
  on public.group_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.groups g
      where g.id = public.group_members.group_id and g.owner_id = auth.uid()
    )
  );

create policy "Group owners can update members"
  on public.group_members for update
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = public.group_members.group_id and g.owner_id = auth.uid()
    )
  );

create policy "Group owners can remove members"
  on public.group_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = public.group_members.group_id and g.owner_id = auth.uid()
    )
  );

alter table public.transactions
  add column if not exists group_id uuid references public.groups(id) on delete set null;

-- Recurring subscriptions generate normal expense transactions while keeping
-- their source visible and idempotent.
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

create policy "Users manage their own subscriptions"
  on public.subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

create index if not exists transactions_group_date_idx
  on public.transactions (group_id, occurred_on desc);

create unique index if not exists transactions_subscription_due_unique
  on public.transactions (user_id, subscription_id, occurred_on)
  where subscription_id is not null;

create index if not exists subscriptions_user_due_idx
  on public.subscriptions (user_id, active, next_due_on);

-- ----------------------------------------------------------------------------
-- 4. SPLIT GROUPS & PARTICIPANTS
-- A split expense references a transaction, then fans out into shares.
-- ----------------------------------------------------------------------------
create table if not exists public.split_shares (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  owed_by_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_owe check (payer_id <> owed_by_id)
);

alter table public.split_shares enable row level security;

-- Visible to both the payer and the person who owes, so balances compute correctly.
create policy "Split shares visible to payer and ower"
  on public.split_shares for select
  to authenticated
  using (auth.uid() = payer_id or auth.uid() = owed_by_id);

create policy "Users can create split shares for their own ledger entries"
  on public.split_shares for insert
  to authenticated
  with check (
    (auth.uid() = payer_id or auth.uid() = owed_by_id)
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.user_id = auth.uid()
    )
  );

create policy "Payer or ower can update settle status"
  on public.split_shares for update
  to authenticated
  using (auth.uid() = payer_id or auth.uid() = owed_by_id);

create policy "Payer can delete split shares for their transactions"
  on public.split_shares for delete
  to authenticated
  using (auth.uid() = payer_id);

create index if not exists split_shares_owed_by_idx on public.split_shares (owed_by_id);
create index if not exists split_shares_payer_idx on public.split_shares (payer_id);

create table if not exists public.split_reminders (
  id uuid primary key default gen_random_uuid(),
  split_share_id uuid not null references public.split_shares(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.split_reminders enable row level security;

create policy "Split reminder participants can view reminders"
  on public.split_reminders for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

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

-- ----------------------------------------------------------------------------
-- 5. FRIENDS (lightweight directory so the split-picker can find people)
-- Since signup is open, "friends" = anyone who has signed up. We expose a
-- minimal public view rather than a separate friend-request system, kept
-- simple on purpose. Can be replaced with a request/accept flow later.
-- ----------------------------------------------------------------------------
create or replace view public.directory as
  select id, full_name, email, avatar_color from public.profiles;

-- ----------------------------------------------------------------------------
-- 6. DEFAULT CATEGORY SEEDING
-- Seed sensible categories for every new user.
-- ----------------------------------------------------------------------------
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind, color, icon) values
    (new.id, 'Food & Dining', 'expense', '#B5544B', 'utensils'),
    (new.id, 'Travel', 'expense', '#B5544B', 'plane'),
    (new.id, 'Rent & Utilities', 'expense', '#B5544B', 'home'),
    (new.id, 'Software & Tools', 'expense', '#B5544B', 'laptop'),
    (new.id, 'Entertainment', 'expense', '#B5544B', 'film'),
    (new.id, 'Health', 'expense', '#B5544B', 'heart-pulse'),
    (new.id, 'Shopping', 'expense', '#B5544B', 'shopping-bag'),
    (new.id, 'Other Expense', 'expense', '#B5544B', 'circle'),
    (new.id, 'Project Income', 'income', '#3F7A5C', 'briefcase'),
    (new.id, 'Retainer', 'income', '#3F7A5C', 'repeat'),
    (new.id, 'Consulting', 'income', '#3F7A5C', 'message-square'),
    (new.id, 'Other Income', 'income', '#3F7A5C', 'circle');
  return new;
end;
$$;

drop trigger if exists on_profile_created_seed_categories on public.profiles;
create trigger on_profile_created_seed_categories
  after insert on public.profiles
  for each row execute procedure public.seed_default_categories();

-- ----------------------------------------------------------------------------
-- Done. After running this, go to Authentication -> Providers and make sure
-- Email provider is enabled. Disable "Confirm email" under Authentication ->
-- Settings if you want friends to sign up and start using it immediately
-- without verifying an email first (optional, your call).
-- ----------------------------------------------------------------------------
