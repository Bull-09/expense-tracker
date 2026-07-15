-- Lets C-137 create private contact friends from AI drafts.
-- Use this when someone says "lent 2000 to Rahul" and Rahul has not signed up.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists contact_owner_id uuid references auth.users(id) on delete cascade;

drop policy if exists "Profiles are viewable by all authenticated users" on public.profiles;
create policy "Profiles are viewable by all authenticated users"
  on public.profiles for select
  to authenticated
  using (contact_owner_id is null or contact_owner_id = auth.uid());

create or replace function public.create_contact_profile(contact_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  clean_name text := nullif(trim(regexp_replace(contact_name, '\s+', ' ', 'g')), '');
  contact_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if clean_name is null then
    raise exception 'Contact name is required';
  end if;

  insert into public.profiles (id, full_name, email, avatar_color, contact_owner_id)
  values (
    contact_id,
    clean_name,
    lower(regexp_replace(clean_name, '[^a-zA-Z0-9]+', '.', 'g')) || '.' || replace(contact_id::text, '-', '') || '@contact.local',
    '#3F7A5C',
    auth.uid()
  );

  return contact_id;
end;
$$;

create or replace view public.directory as
  select id, full_name, email, avatar_color
  from public.profiles
  where contact_owner_id is null or contact_owner_id = auth.uid();

notify pgrst, 'reload schema';
