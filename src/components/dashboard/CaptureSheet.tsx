'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Delete, ImagePlus, Mic, ReceiptText, RotateCcw, ScanLine, Square, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createTransaction, deleteTransaction } from '@/app/actions/transactions';
import { learnMerchantRule } from '@/app/actions/categories';
import { Category, DirectoryUser, Group, MerchantRule, Transaction, TransactionKind } from '@/lib/types';
import { matchMerchantRule } from '@/lib/categories/rules';
import { parseVoiceTranscript } from '@/lib/capture/voice';
import { prepareReceiptImage } from '@/lib/capture/image';
import { createClient } from '@/lib/supabase/client';
import { cn, formatCurrency } from '@/lib/utils/format';
import {
  confirmOptimisticTransaction,
  publishOptimisticTransaction,
  rollbackOptimisticTransaction,
  removeOptimisticTransaction,
} from '@/lib/transactions/optimistic';

type SpeechRecognitionEventLike = Event & { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type SpeechRecognitionLike = EventTarget & {
  continuous: boolean; interimResults: boolean; lang: string;
  start(): void; stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};

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
  merchantRules,
  directory,
  groups,
  currentUserId,
}: {
  categories: Category[];
  merchantRules: MerchantRule[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'keypad' | 'voice' | 'scan'>('keypad');
  const [kind, setKind] = useState<KeypadKind>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState('');
  const [categoryWasChosen, setCategoryWasChosen] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [splitEditorOpen, setSplitEditorOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<'equal' | 'amount' | 'percent'>('equal');
  const [customShares, setCustomShares] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceDraftReady, setVoiceDraftReady] = useState(false);
  const [resolution, setResolution] = useState<'local' | 'llm' | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [editVersion, setEditVersion] = useState(0);
  const [undoItem, setUndoItem] = useState<{ id: string; description: string; receiptPath?: string } | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptMeta, setReceiptMeta] = useState<{ merchant: string; lineItems: unknown[]; confidence: number | null } | null>(null);
  const [scanning, setScanning] = useState(false);
  const sheetRootRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  const relevantCategories = useMemo(
    () => categories.filter((category) => category.kind === (kind === 'income' ? 'income' : 'expense')),
    [categories, kind]
  );
  const matchedRule = useMemo(() => kind === 'expense' ? matchMerchantRule(description, merchantRules) : null, [description, kind, merchantRules]);
  const effectiveCategoryId = categoryId || matchedRule?.rule.category_id || '';
  const selectedCategory = relevantCategories.find((category) => category.id === effectiveCategoryId) ?? relevantCategories[0];
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

    function showVoiceCapture() {
      setMode('voice');
      setOpen(true);
      setError(null);
    }

    window.addEventListener('c137:open-capture', showCapture);
    window.addEventListener('c137:open-voice-capture', showVoiceCapture);
    return () => {
      window.removeEventListener('c137:open-capture', showCapture);
      window.removeEventListener('c137:open-voice-capture', showVoiceCapture);
    };
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
    setOccurredOn(new Date().toISOString().slice(0, 10));
    setCategoryId('');
    setCategoryWasChosen(false);
    setSelectedFriends([]);
    setSelectedGroupId(''); setSelectedMemberIds([]); setSplitMode('equal'); setCustomShares({}); setSplitEditorOpen(false);
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setVoiceDraftReady(false);
    setResolution(null);
    setCountdown(3);
    setReceiptFile(null);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(null);
    setReceiptMeta(null);
  }

  function close() {
    recognitionRef.current?.stop();
    setOpen(false);
  }

  function selectVoice() {
    setMode('voice');
    setError(null);
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const available = Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition);
    setSpeechAvailable(available);
    if (!available) setError('Voice capture is not supported in this browser. Use the keypad to add this entry.');
  }

  function selectScan() {
    recognitionRef.current?.stop();
    setMode('scan');
    setError(null);
  }

  async function scanImage(file: File) {
    if (!file.type.startsWith('image/')) { setError('Choose a photo or screenshot image.'); return; }
    setScanning(true); setError(null); setVoiceDraftReady(false);
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    const preview = URL.createObjectURL(file);
    setReceiptPreview(preview);
    try {
      const prepared = await prepareReceiptImage(file);
      setReceiptFile(prepared);
      const form = new FormData(); form.append('image', prepared);
      const response = await fetch('/api/ai/receipt-scan', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not scan this image.');
      const merchant = typeof data.merchant === 'string' ? data.merchant : '';
      const merchantMatch = matchMerchantRule(merchant, merchantRules);
      const suggested = categories.find((category) => category.kind === 'expense' && category.name.toLowerCase() === String(data.suggestedCategory ?? '').toLowerCase());
      const resolvedCategoryId = merchantMatch?.rule.category_id ?? suggested?.id ?? '';
      setKind('expense'); setAmount(data.total ? String(data.total) : ''); setDescription(merchant || 'Receipt'); setCategoryId(resolvedCategoryId);
      if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) setOccurredOn(data.date);
      setReceiptMeta({ merchant, lineItems: Array.isArray(data.lineItems) ? data.lineItems : [], confidence: typeof data.confidence === 'number' ? data.confidence : null });
      setResolution('llm'); setVoiceDraftReady(true); setCountdown(3);
      const method = merchantMatch ? 'llm+local-rule' : 'llm';
      const log = { source: 'scan', method, confidence: data.confidence ?? null, tokens: data.usage?.totalTokens ?? null, at: new Date().toISOString() };
      console.info('[capture-resolution]', log);
      try { const prior = JSON.parse(localStorage.getItem('c137:capture-resolution-log') ?? '[]'); localStorage.setItem('c137:capture-resolution-log', JSON.stringify([log, ...(Array.isArray(prior) ? prior : [])].slice(0, 100))); } catch { /* non-blocking */ }
      if (!data.total || !resolvedCategoryId) setError('Some fields are unclear. Review the image and complete the draft manually.');
    } catch (reason) {
      setKind('expense'); setAmount(''); setDescription(''); setCategoryId(''); setReceiptMeta(null); setVoiceDraftReady(true);
      setError(reason instanceof Error ? reason.message : 'Could not read this image. Fill the fields manually.');
    } finally { setScanning(false); }
  }

  function markEdited() {
    if (voiceDraftReady) { setCountdown(3); setEditVersion((value) => value + 1); }
  }

  async function resolveTranscript(finalText: string) {
    const local = parseVoiceTranscript(finalText, merchantRules);
    let draft = local;
    let method: 'local' | 'llm' = 'local';

    if (!local.resolvedLocally) {
      method = 'llm';
      const response = await fetch('/api/ai/quick-add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalText, source: 'voice-web-speech' }),
      });
      const data = await response.json();
      const aiDraft = data.drafts?.[0];
      if (!response.ok || !aiDraft) throw new Error(data.error ?? 'I could not find a clear expense in that.');
      draft = {
        ...local,
        amount: aiDraft.amount ?? local.amount,
        categoryId: aiDraft.categoryId ?? local.categoryId,
        description: aiDraft.description || local.description,
        confidence: aiDraft.confidence ?? local.confidence,
        resolvedLocally: false,
      };
    }

    setAmount(draft.amount ? String(draft.amount) : '');
    setCategoryId(draft.categoryId ?? '');
    setDescription(draft.description);
    setResolution(method);
    setVoiceDraftReady(true);
    setCountdown(3);
    const resolutionLog = { source: 'voice', method, confidence: draft.confidence, at: new Date().toISOString() };
    console.info('[capture-resolution]', resolutionLog);
    try {
      const previous = JSON.parse(localStorage.getItem('c137:capture-resolution-log') ?? '[]');
      localStorage.setItem('c137:capture-resolution-log', JSON.stringify([resolutionLog, ...(Array.isArray(previous) ? previous : [])].slice(0, 100)));
    } catch { /* Logging must never block capture. */ }
    if (!draft.amount || !draft.categoryId) setError('Review the draft and add the missing amount or category before saving.');
  }

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!speechAvailable) { setMode('keypad'); setError('Voice capture is unavailable here. Enter the expense with the keypad.'); return; }
    const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false; recognition.interimResults = true; recognition.lang = 'en-IN';
    let finalText = '';
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = 0; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) finalText += event.results[index][0].transcript;
        else interim += event.results[index][0].transcript;
      }
      setInterimTranscript(interim);
      setTranscript(finalText);
    };
    recognition.onerror = () => { setListening(false); setError('I could not access the microphone. Allow microphone access or use the keypad.'); };
    recognition.onend = () => {
      setListening(false); setInterimTranscript(''); recognitionRef.current = null;
      if (finalText.trim()) void resolveTranscript(finalText.trim()).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not parse that voice note.'));
    };
    recognitionRef.current = recognition;
    setTranscript(''); setVoiceDraftReady(false); setError(null); setListening(true);
    recognition.start();
  }

  const toggleFriend = useCallback((id: string) => {
    setSelectedGroupId('');
    setSelectedMemberIds([]);
    setSelectedFriends((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  const categoryChips = useMemo(() => relevantCategories.map((category) => {
    const selected = category.id === selectedCategory?.id;
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => { if (voiceDraftReady) { setCountdown(3); setEditVersion((value) => value + 1); } setCategoryId(category.id); setCategoryWasChosen(true); }}
        className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium', selected ? 'border-mint/60 bg-mint/10 text-mint' : 'border-ink-border text-paper/50')}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
        {category.name}
        {selected && <Check size={13} />}
      </button>
    );
  }), [relevantCategories, selectedCategory?.id, voiceDraftReady]);

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

  async function save(autoSave = false) {
    if (numericAmount <= 0 || submitting) return;
    setSubmitting(true);
    setError(null);

    const temporaryId = `optimistic-${crypto.randomUUID()}`;
    const finalDescription = description.trim() || selectedCategory?.name || (kind === 'income' ? 'Income' : kind === 'investment' ? 'Investment' : 'Expense');
    const optimisticTransaction: Transaction = {
      id: temporaryId,
      user_id: currentUserId,
      group_id: selectedGroupId || null,
      subscription_id: null,
      kind,
      category_id: selectedCategory?.id ?? null,
      amount: numericAmount,
      currency: 'INR',
      description: finalDescription,
      source: null,
      occurred_on: occurredOn,
      is_split: kind === 'expense' && (selectedFriends.length > 0 || selectedMemberIds.length > 0),
      created_at: new Date().toISOString(),
      category: selectedCategory ?? null,
    };

    publishOptimisticTransaction(optimisticTransaction);
    close();
    let storedReceiptPath: string | undefined;

    try {
      const transaction = await createTransaction({
        kind,
        groupId: selectedGroupId || null,
        categoryId: selectedCategory?.id ?? null,
        amount: numericAmount,
        description: finalDescription,
        occurredOn,
        splits: kind === 'expense' && selectedFriends.length > 0
          ? selectedFriends.map((userId) => ({ userId, amount: equalShare }))
          : undefined,
        expenseSplits: kind === 'expense' && selectedGroupId && selectedMemberIds.length > 0
          ? selectedMemberIds.map((memberId) => {
              const raw = Number(customShares[memberId]) || 0;
              const amount = splitMode === 'equal' ? numericAmount / (selectedMemberIds.length + 1) : splitMode === 'percent' ? numericAmount * raw / 100 : raw;
              return { memberId, amount, percent: splitMode === 'percent' ? raw : null };
            }) : undefined,
      });
      if (receiptFile && mode === 'scan') {
        const supabase = createClient();
        const path = `${currentUserId}/${transaction.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receiptFile, { contentType: receiptFile.type, upsert: false });
        if (uploadError) {
          await deleteTransaction(transaction.id);
          throw new Error(`Receipt upload failed: ${uploadError.message}`);
        }
        const { error: linkError } = await supabase.from('transaction_receipts').insert({ transaction_id: transaction.id, user_id: currentUserId, storage_path: path, merchant: receiptMeta?.merchant || null, line_items: receiptMeta?.lineItems ?? [], confidence: receiptMeta?.confidence ?? null });
        if (linkError) {
          await supabase.storage.from('receipts').remove([path]);
          await deleteTransaction(transaction.id);
          throw new Error(`Receipt linking failed: ${linkError.message}`);
        }
        storedReceiptPath = path;
      }
      if (kind === 'expense' && categoryWasChosen && description.trim() && selectedCategory) {
        void learnMerchantRule({ text: description, categoryId: selectedCategory.id }).catch(() => undefined);
      }
      confirmOptimisticTransaction(temporaryId, { ...transaction, category: selectedCategory ?? null });
      if (autoSave) {
        setUndoItem({ id: transaction.id, description: finalDescription, receiptPath: storedReceiptPath });
        window.setTimeout(() => setUndoItem((current) => current?.id === transaction.id ? null : current), 3000);
      }
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

  useEffect(() => {
    saveRef.current = () => save(true);
  });

  useEffect(() => {
    if (!open || (mode !== 'voice' && mode !== 'scan') || !voiceDraftReady || numericAmount <= 0 || !categoryId || !selectedCategory || submitting) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => setCountdown(Math.max(0, 3 - Math.floor((Date.now() - startedAt) / 1000))), 250);
    const timeout = window.setTimeout(() => void saveRef.current(), 3000);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [categoryId, editVersion, mode, numericAmount, open, selectedCategory, submitting, voiceDraftReady]);

  async function undoAutoSave() {
    if (!undoItem) return;
    const item = undoItem;
    setUndoItem(null);
    try {
      if (item.receiptPath) await createClient().storage.from('receipts').remove([item.receiptPath]);
      await deleteTransaction(item.id);
      removeOptimisticTransaction(item.id);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not undo that save.');
      setOpen(true);
    }
  }

  return <>
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
          <button type="button" role="tab" aria-selected={mode === 'keypad'} onClick={() => setMode('keypad')} className={cn('flex h-12 items-center justify-center gap-2 border-b-2 text-sm font-semibold', mode === 'keypad' ? 'border-mint text-mint' : 'border-transparent text-paper/55')}>
            <ReceiptText size={17} /> Keypad
          </button>
          <button type="button" role="tab" aria-selected={mode === 'voice'} onClick={selectVoice} className={cn('flex h-12 items-center justify-center gap-2 border-b-2 text-sm font-medium', mode === 'voice' ? 'border-mint text-mint' : 'border-transparent text-paper/55 hover:text-paper')}>
            <Mic size={17} /> Voice
          </button>
          <button type="button" role="tab" aria-selected={mode === 'scan'} onClick={selectScan} className={cn('flex h-12 items-center justify-center gap-2 border-b-2 text-sm font-medium', mode === 'scan' ? 'border-mint text-mint' : 'border-transparent text-paper/55 hover:text-paper')}>
            <ScanLine size={17} /> Scan
          </button>
        </div>

        <div className="thin-scroll overflow-y-auto px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-4">
          <div className="grid grid-cols-3 rounded-xl bg-ink p-1">
            {ENTRY_TYPES.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => { setKind(entry.value); setCategoryId(''); setCategoryWasChosen(false); setSelectedFriends([]); }}
                className={cn('rounded-lg py-2 text-xs font-semibold transition-colors', kind === entry.value ? 'bg-ink-border-soft text-paper' : 'text-paper/40')}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {mode === 'voice' && !voiceDraftReady && (
            <div className="flex min-h-64 flex-col items-center justify-center py-6 text-center">
              <div className="mb-5 flex h-16 items-end justify-center gap-1" aria-hidden="true">
                {[18, 34, 52, 40, 60, 30, 46, 22].map((height, index) => <span key={index} className={cn('w-1.5 rounded-full bg-mint transition-all', listening && 'animate-pulse')} style={{ height: listening ? `${height}px` : '10px', animationDelay: `${index * 70}ms` }} />)}
              </div>
              <button type="button" onClick={toggleListening} className={cn('flex h-20 w-20 items-center justify-center rounded-full border-4 shadow-xl transition-transform active:scale-95', listening ? 'border-peach/40 bg-peach text-ink' : 'border-mint/30 bg-mint text-ink')} aria-label={listening ? 'Stop listening' : 'Start voice capture'}>
                {listening ? <Square size={25} fill="currentColor" /> : <Mic size={30} />}
              </button>
              <p className="mt-4 font-semibold">{listening ? 'Listening… tap to stop' : 'Tap to start'}</p>
              <p className="mt-1 max-w-xs text-sm text-paper/45">{interimTranscript || transcript || 'Try “Spent 450 at Swiggy”'}</p>
              {!speechAvailable && <button type="button" onClick={() => setMode('keypad')} className="mt-4 text-sm font-semibold text-mint">Use keypad instead</button>}
            </div>
          )}

          {mode === 'scan' && !voiceDraftReady && (
            <div className="flex min-h-64 flex-col items-center justify-center py-6 text-center">
              {receiptPreview ? <Image unoptimized width={360} height={240} src={receiptPreview} alt="Selected receipt" className="mb-5 max-h-52 w-auto rounded-xl border border-ink-border object-contain" /> : <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-sand/10 text-sand"><ImagePlus size={34} /></span>}
              <p className="font-semibold">{scanning ? 'Reading receipt…' : 'Scan a receipt or screenshot'}</p>
              <p className="mt-1 max-w-xs text-sm text-paper/45">Images are compressed to 1024px before vision processing.</p>
              <div className="mt-5 flex gap-2">
                <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-mint px-4 text-sm font-bold text-ink"><Camera size={17} /> Camera<input type="file" accept="image/*" capture="environment" disabled={scanning} onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanImage(file); event.target.value = ''; }} className="sr-only" /></label>
                <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-border px-4 text-sm font-semibold text-paper/70"><ImagePlus size={17} /> Upload<input type="file" accept="image/*" disabled={scanning} onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanImage(file); event.target.value = ''; }} className="sr-only" /></label>
              </div>
            </div>
          )}

          {(mode === 'keypad' || voiceDraftReady) && <>
          {(mode === 'voice' || mode === 'scan') && voiceDraftReady && (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-mint/25 bg-mint/10 px-3 py-2 text-xs text-mint">
              <span>{mode === 'scan' ? 'Extracted with vision' : resolution === 'local' ? 'Resolved locally · zero AI tokens' : 'Transcript refined with AI'} — editable draft</span>
              {numericAmount > 0 && categoryId && <span className="font-ledger font-bold">Saving in {countdown}s</span>}
            </div>
          )}
          {mode === 'scan' && receiptPreview && <Image unoptimized width={360} height={240} src={receiptPreview} alt="Receipt being reviewed" className="mx-auto mb-3 max-h-48 w-auto rounded-xl border border-ink-border object-contain" />}
          <div className="flex min-h-24 items-center justify-center py-3 text-center">
            <span className="mr-1 font-ledger text-2xl text-paper/35">₹</span>
            {mode === 'voice' ? (
              <input inputMode="decimal" value={amount} onChange={(event) => { markEdited(); setAmount(event.target.value.replace(/[^0-9.]/g, '')); }} aria-label="Amount" className="w-48 bg-transparent text-center font-ledger text-[clamp(44px,13vw,56px)] font-semibold tracking-[-0.06em] text-paper outline-none" />
            ) : (
              <span className="font-ledger text-[clamp(44px,13vw,56px)] font-semibold tracking-[-0.06em] text-paper" aria-label={`Amount ${numericAmount}`}>{amount || '0'}</span>
            )}
          </div>

          {mode === 'keypad' && <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => { markEdited(); setAmount((current) => updateAmount(current, key)); }}
                className="flex h-12 items-center justify-center rounded-xl bg-ink text-lg font-semibold text-paper/80 transition-colors hover:bg-ink-border-soft active:bg-mint/15"
                aria-label={key === 'backspace' ? 'Delete digit' : key}
              >
                {key === 'backspace' ? <Delete size={20} /> : key}
              </button>
            ))}
          </div>}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-paper/35">Description <span className="normal-case tracking-normal">(optional)</span></span>
            <input
              value={description}
              onChange={(event) => { markEdited(); setDescription(event.target.value); }}
              placeholder={selectedCategory?.name || 'What was this for?'}
              className="h-11 w-full rounded-xl border border-ink-border bg-ink px-3.5 text-sm text-paper placeholder:text-paper/30 focus:border-mint/60 focus:outline-none"
            />
          </label>
          {mode === 'scan' && (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-paper/35">Receipt date</span>
              <input type="date" value={occurredOn} onChange={(event) => { markEdited(); setOccurredOn(event.target.value); }} className="h-11 w-full rounded-xl border border-ink-border bg-ink px-3.5 text-sm text-paper focus:border-mint/60 focus:outline-none" />
            </label>
          )}
          {mode === 'scan' && receiptMeta && receiptMeta.lineItems.length > 0 && (
            <details className="mt-3 rounded-xl border border-ink-border bg-ink px-3.5 py-3 text-sm">
              <summary className="cursor-pointer font-semibold text-paper/65">{receiptMeta.lineItems.length} extracted line items</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-paper/45">{receiptMeta.lineItems.map((item) => typeof item === 'object' && item ? `${String((item as { name?: unknown }).name ?? 'Item')} · ₹${String((item as { amount?: unknown }).amount ?? '—')}` : String(item)).join('\n')}</pre>
            </details>
          )}

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-paper/35">Category</p>
            {relevantCategories.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1 thin-scroll">
                {categoryChips}
              </div>
            ) : <p className="text-sm text-paper/40">This entry will be saved uncategorized.</p>}
            {matchedRule && !categoryWasChosen && selectedCategory && (
              <p className="mt-2 text-xs text-mint/75">Suggested from “{matchedRule.rule.merchant_pattern}”</p>
            )}
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

          {kind === 'expense' && groups.length > 0 && (
            <button type="button" onClick={() => setSplitEditorOpen(true)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-ink-border bg-ink px-3.5 py-3 text-left">
              <span><span className="block text-sm font-semibold">Group split</span><span className="text-xs text-paper/40">{selectedGroupId ? `${groups.find((group) => group.id === selectedGroupId)?.name} · ${selectedMemberIds.length} shares · ${splitMode}` : 'Equal, custom amount, or percentage'}</span></span>
              <span className="text-sm font-bold text-mint">Edit</span>
            </button>
          )}

          {error && <p role="alert" className="mt-4 rounded-xl border border-peach/30 bg-peach/10 px-3 py-2 text-sm text-peach">{error}</p>}

          <button
            type="button"
            onClick={() => void save(false)}
            disabled={numericAmount <= 0 || submitting}
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-mint text-sm font-bold text-ink transition-colors hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {submitting ? 'Saving…' : numericAmount > 0 ? `Save ${formatCurrency(numericAmount)}` : 'Enter an amount'}
          </button>
          </>}
        </div>
      </section>
    </div>
    {undoItem && (
      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[90] flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-mint/25 bg-ink-raised px-4 py-3 shadow-2xl">
        <Check size={18} className="text-mint" /><p className="min-w-0 flex-1 truncate text-sm">Saved {undoItem.description}</p>
        <button type="button" onClick={() => void undoAutoSave()} className="flex items-center gap-1.5 text-sm font-bold text-mint"><RotateCcw size={15} /> Undo</button>
      </div>
    )}
    {splitEditorOpen && (
      <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 sm:items-center sm:p-5">
        <button className="absolute inset-0" onClick={() => setSplitEditorOpen(false)} aria-label="Close split editor" />
        <section className="relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] border border-ink-border bg-ink-raised p-5 sm:max-w-lg sm:rounded-[28px]">
          <div className="flex items-center justify-between"><div><h3 className="font-bold">Split editor</h3><p className="text-xs text-paper/45">Choose a group and the people who owe a share.</p></div><button onClick={() => setSplitEditorOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-ink"><X size={17} /></button></div>
          <select value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setSelectedMemberIds([]); setSelectedFriends([]); setCustomShares({}); }} className="mt-4 h-11 w-full rounded-xl border border-ink-border bg-ink px-3 text-sm"><option value="">Choose group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>)}</select>
          <div className="mt-3 grid grid-cols-3 rounded-xl bg-ink p-1">{(['equal','amount','percent'] as const).map((option) => <button key={option} onClick={() => setSplitMode(option)} className={cn('rounded-lg py-2 text-xs font-semibold capitalize', splitMode === option ? 'bg-ink-border-soft text-mint' : 'text-paper/40')}>{option}</button>)}</div>
          <div className="mt-4 space-y-2">
            {groups.find((group) => group.id === selectedGroupId)?.members?.filter((member) => member.user_id !== currentUserId).map((member) => {
              const id = member.id ?? '';
              const selected = selectedMemberIds.includes(id);
              const name = member.profile?.full_name ?? member.contact_name ?? 'Member';
              return <div key={id} className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink p-3"><button type="button" onClick={() => id && setSelectedMemberIds((current) => selected ? current.filter((value) => value !== id) : [...current, id])} className={cn('flex h-7 w-7 items-center justify-center rounded-full border', selected ? 'border-mint bg-mint text-ink' : 'border-paper/20')}>{selected && <Check size={14} />}</button><span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>{selected && splitMode !== 'equal' && <div className="flex items-center gap-1"><input inputMode="decimal" value={customShares[id] ?? ''} onChange={(event) => setCustomShares((current) => ({ ...current, [id]: event.target.value }))} className="h-9 w-20 rounded-lg border border-ink-border bg-ink-raised px-2 text-right font-ledger text-sm" /><span className="text-xs text-paper/40">{splitMode === 'percent' ? '%' : '₹'}</span></div>}</div>;
            })}
          </div>
          <button type="button" onClick={() => setSplitEditorOpen(false)} disabled={!selectedGroupId || selectedMemberIds.length === 0} className="mt-5 h-11 w-full rounded-xl bg-mint text-sm font-bold text-ink disabled:opacity-35">Apply split</button>
        </section>
      </div>
    )}
  </>;
}
