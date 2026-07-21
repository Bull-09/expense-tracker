'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import { createBalanceShare } from '@/app/actions/balance-shares';
import { formatCurrency } from '@/lib/utils/format';

export function BalanceShareButton({ counterpartyName, direction, amount, context, phone }: {
  counterpartyName: string;
  direction: 'owes_you' | 'you_owe';
  amount: number;
  context: string;
  phone?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const digits = phone?.replace(/\D/g, '') ?? '';
  const whatsappPhone = digits.length === 10 ? `91${digits}` : digits;
  const message = `${direction === 'owes_you' ? `Hi ${counterpartyName}, you owe me` : `Hi ${counterpartyName}, I owe you`} ${formatCurrency(amount)} for ${context}. View the balance: ${url}`;

  function generate() {
    setError('');
    startTransition(async () => {
      try {
        const result = await createBalanceShare({ counterpartyName, direction, amount, context, phone });
        setUrl(`${window.location.origin}/share/balance/${result.token}`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not create preview.');
      }
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="relative">
    <button type="button" onClick={generate} disabled={pending} className="flex items-center gap-1 rounded-lg border border-ink-border px-2.5 py-1.5 text-xs font-semibold text-paper/55 hover:border-teal/40 hover:text-teal disabled:opacity-40"><Share2 size={14} />{pending ? 'Generating…' : 'Share'}</button>
    {url && <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-ink-border bg-ink-raised p-3 shadow-2xl">
      <p className="text-xs font-semibold text-paper">Balance preview ready</p><p className="mt-1 truncate text-[11px] text-paper/35">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2"><a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-teal/10 px-2.5 py-1.5 text-xs font-semibold text-teal"><ExternalLink size={13} /> Preview</a><button type="button" onClick={() => void copy()} className="flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-paper/60">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>{whatsappPhone && <a href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-mint px-2.5 py-1.5 text-xs font-bold text-ink"><MessageCircle size={13} /> WhatsApp</a>}</div>
    </div>}
    {error && <span className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-peach/30 bg-ink-raised px-2.5 py-2 text-xs text-peach">{error}</span>}
  </div>;
}
