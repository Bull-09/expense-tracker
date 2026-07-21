-- Phase 3: shared categories and merchant learning rules.
-- Additive: transactions.category_id already exists in the base schema.

alter table public.categories alter column user_id drop not null;
alter table public.categories add column if not exists is_default boolean not null default false;
alter table public.categories add column if not exists is_hidden boolean not null default false;
alter table public.categories add column if not exists sort_order integer not null default 0;
alter table public.categories add column if not exists usage_count integer not null default 0;
alter table public.categories add column if not exists last_used_at timestamptz;

create unique index if not exists categories_system_name_kind_key
  on public.categories (lower(name), kind) where user_id is null;

drop policy if exists "Users manage their own categories" on public.categories;
drop policy if exists "Authenticated users read categories" on public.categories;
drop policy if exists "Authenticated users create categories" on public.categories;
drop policy if exists "Authenticated users update categories" on public.categories;
drop policy if exists "Authenticated users delete categories" on public.categories;

create policy "Authenticated users read categories" on public.categories
  for select to authenticated using (true);
create policy "Authenticated users create categories" on public.categories
  for insert to authenticated with check (true);
create policy "Authenticated users update categories" on public.categories
  for update to authenticated using (true) with check (true);
create policy "Authenticated users delete categories" on public.categories
  for delete to authenticated using (true);

insert into public.categories
  (user_id, name, kind, icon, color, is_default, sort_order)
values
  (null, 'Food',          'expense', 'utensils',     '#A8E6CF', true, 10),
  (null, 'Transport',     'expense', 'car',          '#FFD3B6', true, 20),
  (null, 'Shopping',      'expense', 'shopping-bag', '#F4E4BA', true, 30),
  (null, 'Bills',         'expense', 'receipt',      '#B8C0FF', true, 40),
  (null, 'Entertainment', 'expense', 'film',         '#FFAAA5', true, 50),
  (null, 'Health',        'expense', 'heart-pulse',  '#FF8B94', true, 60),
  (null, 'Travel',        'expense', 'plane',        '#9EE7E5', true, 70),
  (null, 'Other',         'expense', 'circle',       '#D8CFBC', true, 80)
on conflict do nothing;

create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  merchant_pattern text not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  usage_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists merchant_rules_user_pattern_key
  on public.merchant_rules (user_id, lower(merchant_pattern));
create index if not exists merchant_rules_user_recency_idx
  on public.merchant_rules (user_id, usage_count desc, last_used_at desc);

alter table public.merchant_rules enable row level security;
drop policy if exists "Authenticated users manage merchant rules" on public.merchant_rules;
create policy "Authenticated users manage merchant rules" on public.merchant_rules
  for all to authenticated using (true) with check (true);

create or replace function public.bump_category_usage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and new.kind <> 'transfer' then
    update public.categories
      set usage_count = usage_count + 1, last_used_at = now()
      where id = new.category_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_transaction_category_usage on public.transactions;
create trigger on_transaction_category_usage
  after insert on public.transactions
  for each row execute procedure public.bump_category_usage();
