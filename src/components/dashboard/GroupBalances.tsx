'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { CheckCircle2, MessageCircle, Smartphone } from 'lucide-react';
import { settleExpenseSplits } from '@/app/actions/transactions';
import { simplifyDebts, upiPaymentLink, whatsappReminderLink } from '@/lib/splits/simplify';
import type { ExpenseSplit, Group, GroupMember } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';

function memberName(member?: GroupMember) {
  return member?.profile?.full_name ?? member?.contact_name ?? 'Member';
}

function initials(member?: GroupMember) {
  return memberName(member).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function GroupBalances({ groups, splits, currentUserId }: { groups: Group[]; splits: ExpenseSplit[]; currentUserId: string }) {
  const [pending, startTransition] = useTransition();
  if (!groups.length) return <div className="rounded-2xl border border-dashed border-ink-border bg-ink-raised p-8 text-center"><p className="font-semibold">No split groups yet</p><Link href="/dashboard/groups" className="mt-2 inline-flex text-sm font-semibold text-mint">Create a group</Link></div>;

  return <div className="grid gap-4 lg:grid-cols-2">{groups.map((group) => {
    const groupSplits = splits.filter((split) => split.transaction?.group_id === group.id);
    const unsettled = groupSplits.filter((split) => !split.is_settled);
    const members = group.members ?? [];
    const currentMember = members.find((member) => member.user_id === currentUserId);
    const simplified = simplifyDebts(unsettled.flatMap((split) => {
      const payer = members.find((member) => member.user_id === split.transaction?.user_id);
      return payer?.id ? [{ payerId: payer.id, memberId: split.member_id, amount: split.share_amount }] : [];
    }));

    return <section id={`group-${group.id}`} key={group.id} className="scroll-mt-20 rounded-2xl border border-ink-border bg-ink-raised p-4 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{group.emoji} {group.name}</h2><p className="mt-1 text-xs text-paper/40">{simplified.length ? `${simplified.length} payment${simplified.length === 1 ? '' : 's'} to settle` : 'Everyone is settled up'}</p></div><Link href="/dashboard/groups" className="text-xs font-semibold text-mint">Manage</Link></div>
      <div className="mt-3 flex -space-x-2">{members.slice(0, 8).map((member) => <span key={member.id ?? member.user_id} title={memberName(member)} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink-raised bg-teal text-xs font-bold text-ink">{initials(member)}</span>)}</div>

      <div className="mt-4 space-y-2">
        {simplified.map((debt) => {
          const creditor = members.find((member) => member.id === debt.to);
          const debtor = members.find((member) => member.id === debt.from);
          const currentOwes = currentMember?.id === debt.from;
          const currentIsOwed = currentMember?.id === debt.to;
          const upiId = creditor?.upi_id ?? creditor?.profile?.upi_id ?? null;
          const upiHref = upiId ? upiPaymentLink(upiId, memberName(creditor), debt.amount, group.name) : null;
          const whatsappHref = debtor?.phone ? whatsappReminderLink(debtor.phone, debt.amount, `${group.name}${upiHref ? `. Pay via UPI: ${upiHref}` : ''}`) : null;
          const directShareIds = unsettled.filter((split) => {
            const payer = members.find((member) => member.user_id === split.transaction?.user_id);
            return split.member_id === debt.from && payer?.id === debt.to;
          }).map((split) => split.id);

          return <div key={`${debt.from}-${debt.to}`} className="rounded-xl border border-ink-border bg-ink p-3">
            <p className="text-sm text-paper/75"><strong className="text-paper">{currentOwes ? 'You' : memberName(debtor)}</strong> pays <strong className="text-paper">{currentIsOwed ? 'you' : memberName(creditor)}</strong> <span className="font-ledger font-bold text-peach">{formatCurrency(debt.amount)}</span></p>
            <div className="mt-2 flex flex-wrap gap-2">
              {currentOwes && (upiHref ? <a href={upiHref} className="flex items-center gap-1 rounded-lg bg-mint px-2.5 py-1.5 text-xs font-bold text-ink"><Smartphone size={14} /> Pay via UPI</a> : group.owner_id === currentUserId ? <Link href="/dashboard/groups" className="text-xs text-sand">Add {memberName(creditor)}&apos;s UPI ID</Link> : <span className="text-xs text-sand">{memberName(creditor)} needs to set a UPI ID</span>)}
              {currentIsOwed && (whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-mint/30 px-2.5 py-1.5 text-xs font-semibold text-mint"><MessageCircle size={14} /> Remind</a> : <button disabled title="Add their phone number in the group to enable WhatsApp reminders." className="flex items-center gap-1 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs text-paper/25"><MessageCircle size={14} /> Remind</button>)}
              {(currentOwes || currentIsOwed) && <button disabled={pending || !directShareIds.length} title={directShareIds.length ? 'Mark matching split shares settled' : 'This simplified payment nets multiple indirect shares and must be settled from expense history.'} onClick={() => startTransition(() => settleExpenseSplits(directShareIds))} className="flex items-center gap-1 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs font-semibold text-paper/55 disabled:opacity-30"><CheckCircle2 size={14} /> Mark settled</button>}
            </div>
          </div>;
        })}
        {!simplified.length && <div className="rounded-xl bg-mint/5 py-5 text-center text-sm text-mint">All square ✓</div>}
      </div>
      {groupSplits.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-paper/40">Expense history</summary><div className="mt-2 space-y-1">{groupSplits.slice(0, 12).map((split) => <p key={split.id} className="rounded-lg bg-ink px-3 py-2 text-xs text-paper/45">{split.transaction?.description || 'Group expense'} · {memberName(split.member)} · {formatCurrency(split.share_amount)}{split.is_settled ? ' · settled' : ''}</p>)}</div></details>}
    </section>;
  })}</div>;
}
