'use server';

import { createClient } from '@/lib/supabase/server';

export async function createBalanceShare(input: {
  counterpartyName: string;
  direction: 'owes_you' | 'you_owe';
  amount: number;
  context: string;
  phone?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in to share a balance.');
  const name = input.counterpartyName.trim().slice(0, 80);
  const context = input.context.trim().slice(0, 160) || 'Shared balance';
  if (!name || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error('This balance is incomplete.');

  const { data: profile } = await supabase.from('profiles').select('upi_id').eq('id', user.id).single();
  const { data, error } = await supabase.from('balance_share_links').insert({
    created_by: user.id,
    counterparty_name: name,
    direction: input.direction,
    amount: Math.round(input.amount * 100) / 100,
    context,
    phone: input.phone?.trim() || null,
    payee_upi_id: input.direction === 'owes_you' ? profile?.upi_id ?? null : null,
  }).select('token').single();
  if (error) throw new Error(error.message);
  return { token: data.token as string };
}
