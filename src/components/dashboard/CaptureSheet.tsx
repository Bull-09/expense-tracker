'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Delete, Mic, ReceiptText, ScanLine, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createTransaction } from '@/app/actions/transactions';
import { Category, DirectoryUser, Transaction, TransactionKind } from '@/lib/types';
import { cn, formatCurrency } from '@/lib/utils/format';
import {
  confirmOptimisticTransaction,
  publishOptimisticTransaction,
  rollbackOptimisticTransaction,
} from '@/lib/transactions/optimistic';

type KeypadKind = Extract<TransactionKind, 'expense' | 'income' | 'investment'>;

const ENTRY_TYPES: { value: KeypadKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'investment', label: 'Invest' },
];

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'] as const;

function updateAmount(current: string, key: (typeof KEYS)[number]) {
  if (key === 'backspace') return current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
  if (current === '0') return key;

  const decimals = current.split('.')[1];
  if (decimals?.length === 2) return current;
  if (current.replace('.', '').length >= 9) return current;
  return `${current}${key}`;
}

export function CaptureSheet({
  categories,
  directory,
  currentUserId,
}: {
  categories: Category[];
  directory: DirectoryUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<KeypadKind>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetRootRef = useRef<HTMLDivElement | null>(null);

  const relevantCategories = useMemo(
    () => categories.filter((category) => category.kind === (kind === 'income' ? 'income' : 'expense')),
    [categories, kind]
  );
  const selectedCategory = relevantCategories.find((category) => category.id === categoryId) ?? relevantCategories[0];
  const friends = useMemo(
    () => directory.filter((person) => person.id !== currentUserId),
    [currentUserId, directory]
  );
  const numericAmount = Number.parseFloat(amount) || 0;
  const equalShare = numericAmount / (selectedFriends.length + 1);

  useEffect(() => {
    function showCapture() {
      setOpen(true);
      setError(null);
    }

    window.addEventListener('c137:open-capture', showCapture);
    return () => window.removeEventListener('c137:open-capture', showCapture);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const requested = performance.getEntriesByName('c137-capture-requested').at(-1);
      if (!requested || !sheetRootRef.current) return;
      const duration = performance.now() - requested.startTime;
      sheetRootRef.current.dataset.openMs = duration.toFixed(1);
      performance.measure('c137-capture-open', { start: requested.startTime, end: performance.now() });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function reset() {
    setKind('expense');
    setAmount('');
    setDescription('');
    setCategoryId('');
    setSelectedFriends([]);
    setError(null);
  }

  function close() {
    setOpen(false);
  }

  function openVoice() {
    close();
    window.setTimeout(() => window.dispatchEvent(new Event('c137:open-ai-capture')), 0);
  }

  const toggleFriend = useCallback((id: string) => {
    setSelectedFriends((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  const categoryChips = useMemo(() => relevantCategories.map((category) => {
    const selected = category.id === selectedCategory?.id;
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => setCategoryId(category.id)}
        className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium', selected ? 'border-mint/60 bg-mint/10 text-mint' : 'border-ink-border text-paper/50')}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
        {category.name}
        {selected && <Check size={13} />}
      </button>
    );
  }), [relevantCategories, selectedCategory?.id]);

  const friendChips = useMemo(() => friends.map((friend) => {
    const selected = selectedFriends.includes(friend.id);
    return (
      <button key={friend.id} type="button" onClick={() => toggleFriend(friend.id)} className="flex w-14 shrink-0 flex-col items-center gap-1.5 text-center">
        <span className={cn('relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold text-ink', selected ? 'border-mint' : 'border-transparent')} style={{ backgroundColor: friend.avatar_color }}>
          {friend.full_name.charAt(0).toUpperCase()}
          {selected && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-mint text-ink"><Check size={10} strokeWidth={3} /></span>}
        </span>
        <span className={cn('w-full truncate text-[10px]', selected ? 'text-mint' : 'text-paper/40')}>{friend.full_name.split(' ')[0]}</span>
      </button>
    );
  }), [friends, selectedFriends, toggleFriend]);

  async function save() {
    if (numericAmount <= 0 || submitting) return;
    setSubmitting(true);
    setError(null);

    const temporaryId = `optimistic-${crypto.randomUUID()}`;
    const occurredOn = new Date().toISOString().slice(0, 10);
    const finalDescription = description.trim() || selectedCategory?.name || (kind === 'income' ? 'Income' : kind === 'investment' ? 'Investment' : 'Expense');
    const optimisticTransaction: Transaction = {
      id: temporaryId,
      user_id: currentUserId,
      group_id: null,
      subscription_id: null,
      kind,
      category_id: selectedCategory?.id ?? null,
      amount: numericAmount,
      currency: 'INR',
      description: finalDescription,
      source: null,
      occurred_on: occurredOn,
      is_split: kind === 'expense' && selectedFriends.length > 0,
      created_at: new Date().toISOString(),
      category: selectedCategory ?? null,
    };

    publishOptimisticTransaction(optimisticTransaction);
    close();

    try {
      const transaction = await createTransaction({
        kind,
        categoryId: selectedCategory?.id ?? null,
        amount: numericAmount,
        description: finalDescription,
        occurredOn,
        splits: kind === 'expense' && selectedFriends.length > 0
          ? selectedFriends.map((userId) => ({ userId, amount: equalShare }))
          : undefined,
      });
      confirmOptimisticTransaction(temporaryId, { ...transaction, category: selectedCategory ?? null });
      reset();
      router.refresh();
    } catch (saveError) {
      rollbackOptimisticTransaction(temporaryId);
      setError(saveError instanceof Error ? saveError.message : 'Could not save this entry.');
      setOpen(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={sheetRootRef}
      className={cn(
        'fixed inset-0 z-[70] flex items-end justify-center bg-black/65 backdrop-blur-sm transition-[opacity,visibility] duration-[90ms] md:items-center md:p-5',
        open ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'
      )}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-labelledby={open ? 'capture-title' : undefined}
      aria-hidden={!open}
      inert={!open}
    >
      <button type="button" className="absolute inset-0" onClick={close} aria-label="Close capture" />
      <section className={cn('relative flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-ink-border bg-ink-raised shadow-2xl transition-transform duration-[90ms] md:max-h-[92dvh] md:max-w-[520px] md:rounded-[28px]', open ? 'translate-y-0' : 'translate-y-3')}>
        <div className="flex items-center justify-between border-b border-ink-border px-5 py-4">
          <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper/60 md:hidden" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 text-center md:text-left">
            <h2 id="capture-title" className="font-semibold">New entry</h2>
            <p className="text-xs text-paper/40">Log it while it is fresh</p>
          </div>
          <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper/60" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 border-b border-ink-border px-5 pt-2" role="tablist" aria-label="Capture mode">
          <button type="button" role="tab" aria-selected="true" className="flex h-12 items-center justify-center gap-2 border-b-2 border-mint text-sm font-semibold text-mint">
            <ReceiptText size={17} /> Keypad
          </button>
          <button type="button" role="tab" aria-selected="false" onClick={openVoice} className="flex h-12 items-center justify-center gap-2 border-b-2 border-transparent text-sm font-medium text-paper/55 hover:text-paper">
            <Mic size={17} /> Voice
          </button>
          <button type="button" role="tab" aria-selected="false" disabled className="flex h-12 cursor-not-allowed items-center justify-center gap-2 border-b-2 border-transparent text-sm font-medium text-paper/25" title="Coming soon">
            <ScanLine size={17} /> Scan
          </button>
        </div>

        <div className="thin-scroll overflow-y-auto px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-4">
          <div className="grid grid-cols-3 rounded-xl bg-ink p-1">
            {ENTRY_TYPES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => { setKind(entry.value); setCategoryId(''); setSelectedFriends([]); }}
                className={cn('rounded-lg py-2 text-xs font-semibold transition-colors', kind === entry.value ? 'bg-ink-border-soft text-paper' : 'text-paper/40')}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="flex min-h-24 items-center justify-center py-3 text-center">
            <span className="font-ledger text-[clamp(44px,13vw,56px)] font-semibold tracking-[-0.06em] text-paper" aria-label={`Amount ${numericAmount}`}>
              <span className="mr-1 text-[0.55em] text-paper/35">₹</span>{amount || '0'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAmount((current) => updateAmount(current, key))}
                className="flex h-12 items-center justify-center rounded-xl bg-ink text-lg font-semibold text-paper/80 transition-colors hover:bg-ink-border-soft active:bg-mint/15"
                aria-label={key === 'backspace' ? 'Delete digit' : key}
              >
                {key === 'backspace' ? <Delete size={20} /> : key}
              </button>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-paper/35">Description <span className="normal-case tracking-normal">(optional)</span></span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={selectedCategory?.name || 'What was this for?'}
              className="h-11 w-full rounded-xl border border-ink-border bg-ink px-3.5 text-sm text-paper placeholder:text-paper/30 focus:border-mint/60 focus:outline-none"
            />
          </label>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-paper/35">Category</p>
            {relevantCategories.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll">
                {categoryChips}
              </div>
            ) : <p className="text-sm text-paper/40">This entry will be saved uncategorized.</p>}
          </div>

          {kind === 'expense' && friends.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-paper/35">Split with</p>
                {selectedFriends.length > 0 && numericAmount > 0 && <span className="font-ledger text-xs font-semibold text-mint">{formatCurrency(equalShare)} each</span>}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {friendChips}
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-4 rounded-xl border border-peach/30 bg-peach/10 px-3 py-2 text-sm text-peach">{error}</p>}

          <button
            type="button"
            onClick={() => void save()}
            disabled={numericAmount <= 0 || submitting}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-mint text-sm font-bold text-ink transition-colors hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? 'Saving…' : numericAmount > 0 ? `Save ${formatCurrency(numericAmount)}` : 'Enter an amount'}
          </button>
        </div>
      </section>
    </div>
  );
}
