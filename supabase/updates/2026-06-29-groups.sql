-- Run this once in Supabase SQL Editor if your project already has the
-- original Ledger schema and you want to add Groups support.

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

drop policy if exists "Group members can view their groups" on public.groups;
create policy "Group members can view their groups"
  on public.groups for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_group_member(id)
  );

drop policy if exists "Authenticated users can create groups" on public.groups;
create policy "Authenticated users can create groups"
  on public.groups for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update their groups" on public.groups;
create policy "Owners can update their groups"
  on public.groups for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners can delete their groups" on public.groups;
create policy "Owners can delete their groups"
  on public.groups for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Group members can view memberships" on public.group_members;
create policy "Group members can view memberships"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Group owners can add members" on public.group_members;
create policy "Group owners can add members"
  on public.group_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.groups g
      where g.id = public.group_members.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists "Group owners can update members" on public.group_members;
create policy "Group owners can update members"
  on public.group_members for update
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = public.group_members.group_id and g.owner_id = auth.uid()
    )
  );

drop policy if exists "Group owners can remove members" on public.group_members;
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

create index if not exists transactions_group_date_idx
  on public.transactions (group_id, occurred_on desc);
