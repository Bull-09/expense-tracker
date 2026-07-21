create table if not exists public.balance_share_links (
  token uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  counterparty_name text not null,
  direction text not null check (direction in ('owes_you', 'you_owe')),
  amount numeric(12,2) not null check (amount > 0),
  context text not null default 'Shared balance',
  phone text,
  payee_upi_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table public.balance_share_links enable row level security;
create policy "Users manage their balance share links" on public.balance_share_links
  for all to authenticated using (auth.uid() = created_by) with check (auth.uid() = created_by);

create or replace function public.get_balance_share(p_token uuid)
returns table (
  counterparty_name text,
  direction text,
  amount numeric,
  context text,
  payee_upi_id text,
  sharer_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select l.counterparty_name, l.direction, l.amount, l.context, l.payee_upi_id,
    coalesce(p.full_name, 'A friend'), l.created_at, l.expires_at
  from public.balance_share_links l
  join public.profiles p on p.id = l.created_by
  where l.token = p_token and l.expires_at > now();
$$;

revoke all on function public.get_balance_share(uuid) from public;
grant execute on function public.get_balance_share(uuid) to anon, authenticated;
