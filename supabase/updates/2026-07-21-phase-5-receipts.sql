insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880;

create table if not exists public.transaction_receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  merchant text,
  line_items jsonb not null default '[]'::jsonb,
  confidence numeric,
  created_at timestamptz not null default now()
);
alter table public.transaction_receipts enable row level security;
create policy "Authenticated users manage transaction receipts" on public.transaction_receipts
  for all to authenticated using (true) with check (true);
create policy "Authenticated users upload receipts" on storage.objects
  for insert to authenticated with check (bucket_id = 'receipts');
create policy "Authenticated users read receipts" on storage.objects
  for select to authenticated using (bucket_id = 'receipts');
create policy "Authenticated users delete receipts" on storage.objects
  for delete to authenticated using (bucket_id = 'receipts');
