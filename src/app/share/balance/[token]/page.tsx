import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, IndianRupee, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils/format';
import { upiPaymentLink } from '@/lib/splits/simplify';

type SharedBalance = { counterparty_name: string; direction: 'owes_you' | 'you_owe'; amount: number; context: string; payee_upi_id: string | null; sharer_name: string; created_at: string; expires_at: string };

export default async function SharedBalancePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_balance_share', { p_token: token }).maybeSingle();
  if (error || !data) notFound();
  const balance = data as SharedBalance;
  const theyOwe = balance.direction === 'owes_you';
  const upiHref = theyOwe && balance.payee_upi_id ? upiPaymentLink(balance.payee_upi_id, balance.sharer_name, Number(balance.amount), balance.context) : null;

  return <main className="flex min-h-dvh items-center justify-center bg-ink px-4 py-10 text-paper">
    <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-ink-border bg-ink-raised shadow-2xl">
      <div className="border-b border-ink-border px-6 py-5"><Link href="/" className="inline-flex items-center gap-2 font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mint text-ink"><IndianRupee size={18} /></span>C-137 Capital</Link></div>
      <div className="p-6 text-center"><span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${theyOwe ? 'bg-peach/15 text-peach' : 'bg-mint/15 text-mint'}`}>{theyOwe ? <ArrowUpRight size={26} /> : <ArrowDownLeft size={26} />}</span><p className="mt-5 text-sm text-paper/45">Balance shared by {balance.sharer_name}</p><h1 className="mt-2 text-xl font-bold">{theyOwe ? `${balance.counterparty_name} owes ${balance.sharer_name}` : `${balance.sharer_name} owes ${balance.counterparty_name}`}</h1><p className={`mt-3 font-ledger text-4xl font-bold ${theyOwe ? 'text-peach' : 'text-mint'}`}>{formatCurrency(Number(balance.amount))}</p><p className="mt-3 rounded-xl bg-ink px-4 py-3 text-sm text-paper/60">{balance.context}</p>{upiHref && <a href={upiHref} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mint font-bold text-ink"><ExternalLink size={17} /> Pay via UPI</a>}<p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-paper/35"><ShieldCheck size={14} /> Private link · expires {new Date(balance.expires_at).toLocaleDateString('en-IN')}</p></div>
    </section>
  </main>;
}
