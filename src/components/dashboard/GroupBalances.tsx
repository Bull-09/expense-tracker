'use client';

import { useTransition } from 'react';
import { CheckCircle2, MessageCircle, Smartphone } from 'lucide-react';
import { settleExpenseSplit } from '@/app/actions/transactions';
import { simplifyDebts, upiPaymentLink, whatsappReminderLink } from '@/lib/splits/simplify';
import type { ExpenseSplit, Group } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';

function memberName(group: Group, id: string) {
  const member = group.members?.find((item) => item.id === id);
  return member?.profile?.full_name ?? member?.contact_name ?? 'Member';
}

export function GroupBalances({ groups, splits }: { groups: Group[]; splits: ExpenseSplit[] }) {
  const [pending, startTransition] = useTransition();
  return <div className="space-y-4">{groups.map((group) => {
    const groupSplits = splits.filter((split) => split.transaction?.group_id === group.id);
    const unsettled = groupSplits.filter((split) => !split.is_settled);
    const simplified = simplifyDebts(unsettled.flatMap((split) => {
      const payer = group.members?.find((member) => member.user_id === split.transaction?.user_id);
      return payer?.id ? [{ payerId: payer.id, memberId: split.member_id, amount: split.share_amount }] : [];
    }));
    return <section key={group.id} className="rounded-2xl border border-ink-border bg-ink-raised p-4">
      <div className="flex items-center justify-between"><div><h2 className="font-bold">{group.emoji} {group.name}</h2><p className="text-xs text-paper/40">{groupSplits.length} split shares · {simplified.length} simplified payments</p></div></div>
      {simplified.length > 0 ? <div className="mt-4 space-y-2">{simplified.map((debt) => {
        const creditor = group.members?.find((member) => member.id === debt.to);
        const debtor = group.members?.find((member) => member.id === debt.from);
        const upi = creditor?.upi_id ?? creditor?.profile?.upi_id;
        const phone = debtor?.phone;
        return <div key={`${debt.from}-${debt.to}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-border bg-ink p-3"><p className="min-w-48 flex-1 text-sm"><strong>{memberName(group, debt.from)}</strong> pays <strong>{memberName(group, debt.to)}</strong> <span className="font-ledger font-bold text-peach">{formatCurrency(debt.amount)}</span></p>{upi && <a href={upiPaymentLink(upi, memberName(group, debt.to), debt.amount, group.name)} className="flex items-center gap-1 rounded-lg bg-mint px-2.5 py-1.5 text-xs font-bold text-ink"><Smartphone size={14} /> Pay via UPI</a>}{phone && <a href={whatsappReminderLink(phone, debt.amount, group.name)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-mint/30 px-2.5 py-1.5 text-xs font-semibold text-mint"><MessageCircle size={14} /> WhatsApp</a>}</div>;
      })}</div> : <p className="mt-4 rounded-xl bg-mint/5 py-4 text-center text-sm text-paper/40">All square.</p>}
      {unsettled.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-paper/45">Expense history and settlement</summary><div className="mt-2 space-y-2">{unsettled.map((split) => <div key={split.id} className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-xs"><span>{split.transaction?.description || 'Group expense'} · {memberName(group, split.member_id)} · {formatCurrency(split.share_amount)}</span><button disabled={pending} onClick={() => startTransition(() => settleExpenseSplit(split.id))} className="flex items-center gap-1 font-semibold text-mint"><CheckCircle2 size={14} /> Settled</button></div>)}</div></details>}
    </section>;
  })}</div>;
}
