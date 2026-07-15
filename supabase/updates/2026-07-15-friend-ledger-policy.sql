-- Allows C-137 AI to track "I borrowed from Rahul" as a split balance where
-- Rahul is the payer and the signed-in user is the person who owes.

drop policy if exists "Payer can create split shares for their transactions" on public.split_shares;
drop policy if exists "Users can create split shares for their own ledger entries" on public.split_shares;

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
