alter table public.profiles add column if not exists upi_id text;
alter table public.groups add column if not exists created_by uuid references public.profiles(id) on delete cascade;
update public.groups set created_by = owner_id where created_by is null;
alter table public.groups alter column created_by set not null;

alter table public.group_members add column if not exists id uuid default gen_random_uuid();
alter table public.group_members add column if not exists contact_name text;
alter table public.group_members add column if not exists phone text;
alter table public.group_members add column if not exists upi_id text;
alter table public.group_members drop constraint if exists group_members_pkey;
alter table public.group_members alter column user_id drop not null;
alter table public.group_members add constraint group_members_pkey primary key (id);
alter table public.group_members add constraint group_member_identity_check check (user_id is not null or nullif(trim(contact_name), '') is not null);
create unique index if not exists group_members_group_user_key on public.group_members(group_id, user_id) where user_id is not null;

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  member_id uuid not null references public.group_members(id) on delete cascade,
  share_amount numeric(12,2) not null check (share_amount >= 0),
  share_percent numeric(7,4),
  is_settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(transaction_id, member_id)
);
alter table public.expense_splits enable row level security;
create policy "Authenticated users manage expense splits" on public.expense_splits
  for all to authenticated using (true) with check (true);
create index if not exists expense_splits_transaction_idx on public.expense_splits(transaction_id, is_settled);
