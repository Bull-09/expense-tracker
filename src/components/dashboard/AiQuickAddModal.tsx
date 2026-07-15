'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CalendarClock, Check, ChevronDown, ChevronUp, HandCoins, Loader2, Mic, Repeat2, Send, Square, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createFriendLedgerEntry, createSubscription, createTransaction } from '@/app/actions/transactions';
import { Category, DirectoryUser, Group, TransactionKind } from '@/lib/types';
import { cn } from '@/lib/utils/format';

type Draft = {
  kind: Exclude<TransactionKind, 'transfer'>;
  amount: number | null;
  description: string;
  source?: string | null;
  occurredOn: string;
  categoryId?: string | null;
  suggestedCategoryName?: string | null;
  createCategoryName?: string | null;
  groupId?: string | null;
  split?: {
    enabled: boolean;
    mode: 'equal' | 'custom';
    peopleIds: string[];
    customAmounts?: Record<string, number>;
  };
  confidence: number;
  questions?: string[];
};

type FriendLedgerDraft = {
  direction: 'borrowed' | 'lent';
  amount: number | null;
  personId?: string | null;
  personName?: string | null;
  description?: string | null;
  occurredOn: string;
  confidence: number;
  questions?: string[];
};

type SubscriptionDraft = {
  name: string;
  amount: number | null;
  billingDay: number;
  frequency: 'weekly' | 'monthly';
  nextDueOn: string;
  categoryId?: string | null;
  groupId?: string | null;
  notes?: string | null;
  confidence: number;
  questions?: string[];
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  usage?: TokenUsage | null;
};

type TokenUsage = {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  estimatedTranscriptionCostUsd?: number | null;
  estimatedTotalCostUsd?: number | null;
  pricingNote?: string | null;
};

type AiResponse = {
  reply?: string;
  correctedTranscript?: string;
  normalizedTranscript?: string;
  transcript?: string;
  usage?: TokenUsage | null;
  drafts?: Draft[];
  subscriptionDrafts?: SubscriptionDraft[];
  friendLedgerDrafts?: FriendLedgerDraft[];
  questions?: string[];
};

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

type MoneyEntryKind = Exclude<TransactionKind, 'transfer'>;

const KIND_LABELS: Record<MoneyEntryKind, string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
};

function normalizeMoneyEntryKind(kind: unknown): MoneyEntryKind {
  if (kind === 'income' || kind === 'investment') return kind;
  return 'expense';
}

function normalizeIncomingDraft(item: Draft): Draft {
  return {
    ...item,
    kind: normalizeMoneyEntryKind(item.kind),
    createCategoryName: item.categoryId ? null : item.suggestedCategoryName ?? null,
  };
}

function normalizePersonLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function friendDraftName(item: FriendLedgerDraft) {
  return item.personName?.trim()
    || item.description?.replace(/\b(borrowed|lent|money|from|to|for|gave|got|paid)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    || '';
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function formatUsd(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value > 0 && value < 0.00001) return '<$0.00001';
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function formatTokenUsage(usage: TokenUsage) {
  const total = typeof usage.totalTokens === 'number'
    ? `${usage.totalTokens.toLocaleString('en-IN')} tokens`
    : 'Token usage';
  const parts = typeof usage.promptTokens === 'number' && typeof usage.completionTokens === 'number'
    ? ` (${usage.promptTokens.toLocaleString('en-IN')} in / ${usage.completionTokens.toLocaleString('en-IN')} out)`
    : '';
  const cost = formatUsd(usage.estimatedTotalCostUsd ?? usage.estimatedCostUsd);
  const voiceCost = formatUsd(usage.estimatedTranscriptionCostUsd);
  const estimate = cost ? ` • ~${cost}` : '';
  const voice = voiceCost ? ` incl. voice ${voiceCost}` : '';

  return `${total}${parts}${estimate}${voice}`;
}

function assistantReplyText(data: {
  reply?: string;
  drafts?: unknown[];
  subscriptionDrafts?: unknown[];
  friendLedgerDrafts?: unknown[];
}) {
  const reply = data.reply?.trim();
  const weakReply = !reply || /^(got it|done|ok|okay|sure)[.!]*$/i.test(reply);
  if (!weakReply) return reply;

  const drafts = data.drafts?.length ?? 0;
  const subscriptions = data.subscriptionDrafts?.length ?? 0;
  const friends = data.friendLedgerDrafts?.length ?? 0;
  const parts = [
    drafts ? `${drafts} entr${drafts === 1 ? 'y' : 'ies'}` : '',
    subscriptions ? `${subscriptions} subscription${subscriptions === 1 ? '' : 's'}` : '',
    friends ? `${friends} friend balance${friends === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  if (friends > 0 && drafts === 0 && subscriptions === 0) {
    return `I made ${parts.join(', ')}. It will be saved in Splits. Review it, then save.`;
  }
  if (parts.length > 0) return `I made ${parts.join(', ')}. Review it, then save.`;
  return reply || 'I am here. Ask me anything, or tell me a money note to add.';
}

export function AiQuickAddModal({
  categories,
  directory,
  groups,
  currentUserId,
}: {
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'hello',
      role: 'assistant',
      text: 'Tell me naturally. I can chat, or make entries when you mention money.',
    },
  ]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [subscriptionDrafts, setSubscriptionDrafts] = useState<SubscriptionDraft[]>([]);
  const [friendLedgerDrafts, setFriendLedgerDrafts] = useState<FriendLedgerDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState(0);
  const [selectedSubscriptionDraft, setSelectedSubscriptionDraft] = useState(0);
  const [selectedFriendDraft, setSelectedFriendDraft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [processingLabel, setProcessingLabel] = useState('Thinking');
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveVoiceTextRef = useRef('');
  const voiceStartedAtRef = useRef<number | null>(null);

  const draft = drafts[selectedDraft];
  const subscriptionDraft = subscriptionDrafts[selectedSubscriptionDraft];
  const friendDraft = friendLedgerDrafts[selectedFriendDraft];
  const relevantCategories = useMemo(
    () => categories.filter((category) => category.kind === (draft?.kind === 'income' ? 'income' : 'expense')),
    [categories, draft?.kind]
  );
  const selectedGroup = groups.find((group) => group.id === draft?.groupId);
  const allowedMemberIds = selectedGroup?.members?.map((member) => member.user_id) ?? [];
  const splitPeople = directory.filter((person) =>
    person.id !== currentUserId && (!selectedGroup || allowedMemberIds.includes(person.id))
  );
  const expenseCategories = categories.filter((category) => category.kind === 'expense');
  const voicePreview = message.trim();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading, drafts.length, subscriptionDrafts.length, friendLedgerDrafts.length]);

  function resolveFriendDraft(item: FriendLedgerDraft): FriendLedgerDraft {
    const friendDirectory = directory.filter((person) => person.id !== currentUserId);
    if (item.personId && friendDirectory.some((person) => person.id === item.personId)) return item;
    const lookup = normalizePersonLookup(item.personName ?? item.description ?? '');
    if (!lookup) return item;

    const exact = friendDirectory.find((person) => normalizePersonLookup(person.full_name) === lookup);
    const lookupParts = lookup.split(' ').filter(Boolean);
    const partial = exact ?? friendDirectory.find((person) => {
      const nameParts = normalizePersonLookup(person.full_name).split(' ');
      return lookupParts.some((part) => nameParts.includes(part));
    });

    if (partial) return { ...item, personId: partial.id, personName: partial.full_name };
    return item.personId === currentUserId ? { ...item, personId: null } : item;
  }

  function appendMessage(role: ChatMessage['role'], text: string, usage?: TokenUsage | null) {
    const id = `${role}-${Date.now()}-${Math.random()}`;
    setMessages((current) => [
      ...current.slice(-5),
      { id, role, text, usage },
    ]);
    return id;
  }

  function clientStateSnapshot() {
    return {
      currentDrafts: drafts.slice(0, 8).map((item) => ({
        kind: item.kind,
        amount: item.amount,
        description: item.description,
        source: item.source ?? null,
        occurredOn: item.occurredOn,
        categoryId: item.categoryId ?? null,
        suggestedCategoryName: item.suggestedCategoryName ?? null,
        createCategoryName: item.createCategoryName ?? null,
        groupId: item.groupId ?? null,
        split: item.split ?? null,
      })),
      currentSubscriptionDrafts: subscriptionDrafts.slice(0, 5),
      currentFriendLedgerDrafts: friendLedgerDrafts.slice(0, 5),
      recentMessages: messages.slice(-4).map((item) => ({
        role: item.role,
        text: item.text,
      })),
    };
  }

  function applyAiResponse(data: AiResponse) {
    appendMessage('assistant', assistantReplyText(data), data.usage ?? null);
    setDrafts((data.drafts ?? []).map(normalizeIncomingDraft));
    setSubscriptionDrafts(data.subscriptionDrafts ?? []);
    setFriendLedgerDrafts((data.friendLedgerDrafts ?? []).map(resolveFriendDraft));
    setFollowUpQuestions((data.questions ?? []).filter(Boolean).slice(0, 3));
    setSelectedDraft(0);
    setSelectedSubscriptionDraft(0);
    setSelectedFriendDraft(0);
  }

  function updateMessage(id: string, text: string) {
    setMessages((current) => current.map((item) => (item.id === id ? { ...item, text } : item)));
  }

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((item, index) => (index === selectedDraft ? { ...item, ...patch } : item))
    );
  }

  function updateSubscriptionDraft(patch: Partial<SubscriptionDraft>) {
    setSubscriptionDrafts((current) =>
      current.map((item, index) => (index === selectedSubscriptionDraft ? { ...item, ...patch } : item))
    );
  }

  function updateFriendDraft(patch: Partial<FriendLedgerDraft>) {
    setFriendLedgerDrafts((current) =>
      current.map((item, index) => (index === selectedFriendDraft ? { ...item, ...patch } : item))
    );
  }

  function updateSplit(patch: Partial<NonNullable<Draft['split']>>) {
    if (!draft) return;
    updateDraft({
      split: {
        enabled: false,
        mode: 'equal',
        peopleIds: [],
        ...(draft.split ?? {}),
        ...patch,
      },
    });
  }

  function removeDraft(indexToRemove: number) {
    setDrafts((current) => current.filter((_, index) => index !== indexToRemove));
    setSelectedDraft((current) => {
      if (current > indexToRemove) return current - 1;
      if (current === indexToRemove) return Math.max(0, current - 1);
      return current;
    });
  }

  function removeFriendDraft(indexToRemove: number) {
    setFriendLedgerDrafts((current) => current.filter((_, index) => index !== indexToRemove));
    setSelectedFriendDraft((current) => {
      if (current > indexToRemove) return current - 1;
      if (current === indexToRemove) return Math.max(0, current - 1);
      return current;
    });
  }

  function removeSubscriptionDraft(indexToRemove: number) {
    setSubscriptionDrafts((current) => current.filter((_, index) => index !== indexToRemove));
    setSelectedSubscriptionDraft((current) => {
      if (current > indexToRemove) return current - 1;
      if (current === indexToRemove) return Math.max(0, current - 1);
      return current;
    });
  }

  async function readJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) {
      throw new Error(response.ok ? 'AI returned an empty response.' : `AI request failed (${response.status}).`);
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(response.ok ? 'AI returned an unreadable response.' : `AI request failed (${response.status}).`);
    }
  }

  function stopAiResponse() {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setLoading(false);
    setVoiceMode('idle');
    setProcessingLabel('Thinking');
    setError(null);
    appendMessage('assistant', 'Stopped. Edit your note and send again when ready.');
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setOpen(true);
    setError(null);
    setFollowUpQuestions([]);
    appendMessage('user', trimmed);
    setMessage('');
    setLoading(true);
    setProcessingLabel('Understanding your note');
    const controller = new AbortController();
    aiAbortRef.current = controller;

    try {
      const response = await fetch('/api/ai/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, clientState: clientStateSnapshot() }),
        signal: controller.signal,
      });
      setProcessingLabel('Making smart drafts');
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Could not understand that.');

      applyAiResponse(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const text = err instanceof Error ? err.message : 'Could not understand that.';
      setError(text);
      setMessage(trimmed);
      appendMessage('assistant', text);
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setLoading(false);
      setProcessingLabel('Thinking');
      textareaRef.current?.focus();
    }
  }

  async function sendVoiceNote(audio: Blob, visibleTranscript: string, durationMs = 0) {
    if (loading || audio.size === 0) return;

    setOpen(true);
    setError(null);
    setFollowUpQuestions([]);
    setLoading(true);
    setVoiceMode('transcribing');
    setProcessingLabel('Correcting voice');

    const shownText = visibleTranscript.trim() || 'Voice note';
    const voiceMessageId = appendMessage('user', shownText);
    const controller = new AbortController();
    aiAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('audio', audio, 'c137-voice.webm');
      formData.append('durationMs', String(Math.max(0, Math.round(durationMs))));
      formData.append('clientState', JSON.stringify(clientStateSnapshot()));
      if (visibleTranscript.trim()) formData.append('message', visibleTranscript.trim());

      const response = await fetch('/api/ai/quick-add', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      setProcessingLabel('Making smart drafts');
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Could not understand that voice note.');

      const cleanedTranscript = data.correctedTranscript ?? data.normalizedTranscript ?? data.transcript;
      if (typeof cleanedTranscript === 'string' && cleanedTranscript.trim()) {
        updateMessage(voiceMessageId, cleanedTranscript.trim());
      }
      applyAiResponse(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const text = err instanceof Error ? err.message : 'Could not understand that voice note.';
      setError(text);
      appendMessage('assistant', text);
    } finally {
      if (aiAbortRef.current === controller) aiAbortRef.current = null;
      setLoading(false);
      setVoiceMode('idle');
      setProcessingLabel('Thinking');
      textareaRef.current?.focus();
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      recorderRef.current?.stop();
      setListening(false);
      return;
    }

    const Recognition = getSpeechRecognition();
    setOpen(true);
    setError(null);
    setVoiceMode('recording');
    voiceStartedAtRef.current = Date.now();
    liveVoiceTextRef.current = message.trim();

    if (Recognition) {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-IN';
      recognition.continuous = true;
      recognition.interimResults = true;
      let finalText = message.trim();

      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const chunk = event.results[index][0].transcript;
          if (event.results[index].isFinal) {
            finalText = `${finalText} ${chunk}`.trim();
          } else {
            interim += chunk;
          }
        }
        const visibleText = `${finalText} ${interim}`.trim();
        liveVoiceTextRef.current = visibleText;
        setMessage(visibleText);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
      };
      recognition.onerror = () => {
        recognitionRef.current = null;
      };
      recognition.start();
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (!Recognition) {
        setVoiceMode('idle');
        setError('Voice recording is not supported here. Use phone keyboard dictation or type it.');
        return;
      }
      setListening(true);
      return;
    }

    void navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const visibleTranscript = liveVoiceTextRef.current;
          const durationMs = voiceStartedAtRef.current ? Date.now() - voiceStartedAtRef.current : 0;
          voiceStartedAtRef.current = null;
          setListening(false);
          setMessage('');
          void sendVoiceNote(audio, visibleTranscript, durationMs);
        };
        recorder.start();
        setListening(true);
      })
      .catch(() => {
        setVoiceMode('idle');
        setListening(false);
        recognitionRef.current?.stop();
        setError('Microphone permission was blocked. Allow mic access or type it.');
      });
  }

  function togglePerson(id: string) {
    const split = draft?.split ?? { enabled: true, mode: 'equal' as const, peopleIds: [] };
    const peopleIds = split.peopleIds.includes(id)
      ? split.peopleIds.filter((personId) => personId !== id)
      : [...split.peopleIds, id];
    updateSplit({ enabled: peopleIds.length > 0, peopleIds });
  }

  async function saveDrafts() {
    setError(null);
    setSaving(true);
    try {
      for (const item of drafts) {
        if (!item.amount || item.amount <= 0) {
          throw new Error('Every draft needs a valid amount before saving.');
        }
        const kind = normalizeMoneyEntryKind(item.kind);

        const split = item.split;
        const equalShare = split?.peopleIds?.length ? item.amount / (split.peopleIds.length + 1) : 0;

        await createTransaction({
          kind,
          groupId: item.groupId ?? null,
          categoryId: item.categoryId ?? null,
          createCategoryName: item.categoryId ? null : item.createCategoryName ?? null,
          amount: item.amount,
          description: item.description,
          source: kind === 'income' ? item.source ?? undefined : undefined,
          occurredOn: item.occurredOn,
          splits: split?.enabled
            ? split.peopleIds.map((personId) => ({
                userId: personId,
                amount: split.mode === 'custom' ? split.customAmounts?.[personId] ?? 0 : equalShare,
              }))
            : undefined,
        });
      }
      appendMessage('assistant', drafts.length === 1 ? 'Saved it.' : `Saved ${drafts.length} entries.`);
      setDrafts([]);
      setFollowUpQuestions([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save drafts.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSubscriptionDrafts() {
    setError(null);
    setSaving(true);
    try {
      for (const item of subscriptionDrafts) {
        if (!item.amount || item.amount <= 0) {
          throw new Error('Every subscription needs a valid amount before saving.');
        }
        await createSubscription({
          name: item.name,
          amount: item.amount,
          billingDay: item.billingDay,
          frequency: item.frequency,
          nextDueOn: item.nextDueOn,
          categoryId: item.categoryId ?? null,
          groupId: item.groupId ?? null,
          notes: item.notes,
        });
      }
      appendMessage('assistant', subscriptionDrafts.length === 1 ? 'Subscription saved.' : `Saved ${subscriptionDrafts.length} subscriptions.`);
      setSubscriptionDrafts([]);
      setFollowUpQuestions([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save subscriptions.');
    } finally {
      setSaving(false);
    }
  }

  async function saveFriendLedgerDrafts() {
    setError(null);
    setSaving(true);
    try {
      for (const item of friendLedgerDrafts) {
        if (!item.amount || item.amount <= 0) {
          throw new Error('Every friend money draft needs a valid amount.');
        }
        const name = friendDraftName(item);
        if (!item.personId && !name) {
          throw new Error('Pick or type the friend for each friend money draft.');
        }
        await createFriendLedgerEntry({
          direction: item.direction,
          personId: item.personId ?? null,
          personName: name || null,
          amount: item.amount,
          description: item.description,
          occurredOn: item.occurredOn,
        });
      }
      appendMessage('assistant', friendLedgerDrafts.length === 1 ? 'Friend balance saved.' : `Saved ${friendLedgerDrafts.length} friend balances.`);
      setFriendLedgerDrafts([]);
      setFollowUpQuestions([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save friend money drafts.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEverything() {
    setError(null);
    setSaving(true);
    try {
      for (const item of drafts) {
        if (!item.amount || item.amount <= 0) {
          throw new Error('Every entry needs a valid amount before saving.');
        }
        const kind = normalizeMoneyEntryKind(item.kind);
        const split = item.split;
        const equalShare = split?.peopleIds?.length ? item.amount / (split.peopleIds.length + 1) : 0;
        await createTransaction({
          kind,
          groupId: item.groupId ?? null,
          categoryId: item.categoryId ?? null,
          createCategoryName: item.categoryId ? null : item.createCategoryName ?? null,
          amount: item.amount,
          description: item.description,
          source: kind === 'income' ? item.source ?? undefined : undefined,
          occurredOn: item.occurredOn,
          splits: split?.enabled
            ? split.peopleIds.map((personId) => ({
                userId: personId,
                amount: split.mode === 'custom' ? split.customAmounts?.[personId] ?? 0 : equalShare,
              }))
            : undefined,
        });
      }

      for (const item of subscriptionDrafts) {
        if (!item.amount || item.amount <= 0) {
          throw new Error('Every subscription needs a valid amount before saving.');
        }
        await createSubscription({
          name: item.name,
          amount: item.amount,
          billingDay: item.billingDay,
          frequency: item.frequency,
          nextDueOn: item.nextDueOn,
          categoryId: item.categoryId ?? null,
          groupId: item.groupId ?? null,
          notes: item.notes,
        });
      }

      for (const item of friendLedgerDrafts) {
        if (!item.amount || item.amount <= 0) {
          throw new Error('Every friend money draft needs a valid amount.');
        }
        const name = friendDraftName(item);
        if (!item.personId && !name) {
          throw new Error('Pick or type the friend for each friend money draft.');
        }
        await createFriendLedgerEntry({
          direction: item.direction,
          personId: item.personId ?? null,
          personName: name || null,
          amount: item.amount,
          description: item.description,
          occurredOn: item.occurredOn,
        });
      }

      appendMessage('assistant', `Saved ${drafts.length + subscriptionDrafts.length + friendLedgerDrafts.length} items.`);
      setDrafts([]);
      setSubscriptionDrafts([]);
      setFriendLedgerDrafts([]);
      setFollowUpQuestions([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save everything.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 px-3 lg:bottom-5 lg:left-64">
      <div className="mx-auto flex max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink-border bg-ink-raised/95 shadow-2xl shadow-black/30 backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center justify-between gap-3 border-b border-ink-border px-4 py-2.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald/15 text-emerald">
              <Bot size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">C-137 AI</span>
              <span className="block truncate text-xs text-paper/45">Lazy expense chat. Speak or type.</span>
            </span>
          </span>
          {open ? <ChevronDown size={18} className="text-paper/40" /> : <ChevronUp size={18} className="text-paper/40" />}
        </button>

        {open && (
          <div className="max-h-[58vh] overflow-y-auto p-3 thin-scroll">
            <div className="mb-3 flex flex-col gap-2">
              {messages.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                    item.role === 'user'
                      ? 'ml-auto bg-emerald text-paper'
                      : 'mr-auto bg-ink text-paper/75'
                  )}
                >
                  <span>{item.text}</span>
                  {item.role === 'assistant' && item.usage?.totalTokens && (
                    <span
                      className="mt-1 block border-t border-paper/10 pt-1 text-[10px] font-medium text-paper/35"
                      title={item.usage.pricingNote ?? 'Estimated from configured model pricing. Actual OpenAI billing can vary.'}
                    >
                      {formatTokenUsage(item.usage)}
                    </span>
                  )}
                </div>
              ))}
              {loading && (
                <div className="mr-auto flex items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-sm text-paper/50">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{processingLabel}</span>
                  <button
                    type="button"
                    onClick={stopAiResponse}
                    className="ml-1 rounded-full border border-clay/40 px-2 py-0.5 text-xs font-semibold text-clay hover:bg-clay/10"
                  >
                    Stop
                  </button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {followUpQuestions.length > 0 && (
              <div className="mb-3 rounded-xl border border-gold/30 bg-gold/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold">Needs one detail</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {followUpQuestions.map((question) => (
                    <span
                      key={question}
                      className="rounded-full border border-gold/30 bg-ink/70 px-3 py-1.5 text-xs font-medium text-paper/75"
                    >
                      {question}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(drafts.length > 0 || subscriptionDrafts.length > 0 || friendLedgerDrafts.length > 0)
              && [drafts.length, subscriptionDrafts.length, friendLedgerDrafts.length].filter(Boolean).length > 1 && (
              <div className="mb-3 rounded-xl border border-emerald/30 bg-emerald/5 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-paper/70">
                    Found {[
                      drafts.length ? `${drafts.length} entr${drafts.length === 1 ? 'y' : 'ies'}` : '',
                      subscriptionDrafts.length ? `${subscriptionDrafts.length} subscription${subscriptionDrafts.length === 1 ? '' : 's'}` : '',
                      friendLedgerDrafts.length ? `${friendLedgerDrafts.length} friend-money draft${friendLedgerDrafts.length === 1 ? '' : 's'}` : '',
                    ].filter(Boolean).join(', ')}.
                  </p>
                  <Button type="button" size="sm" onClick={saveEverything} disabled={saving}>
                    {saving ? 'Saving...' : 'Save everything'}
                  </Button>
                </div>
              </div>
            )}

            {drafts.length > 0 && draft && (
              <div className="mb-3 rounded-xl border border-emerald/30 bg-emerald/5 p-3">
                <div className="mb-3 flex flex-wrap gap-2">
                  {drafts.map((item, index) => (
                    <span
                      key={index}
                      className={cn(
                        'inline-flex items-center overflow-hidden rounded-full border text-xs font-medium',
                        selectedDraft === index ? 'border-emerald bg-emerald/15 text-emerald' : 'border-ink-border text-paper/50'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDraft(index)}
                        className="px-3 py-1"
                      >
                        Draft {index + 1}: {item.amount ? `₹${item.amount}` : 'Needs amount'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDraft(index)}
                        className="border-l border-current/15 px-2 py-1 text-current/70 hover:text-clay"
                        aria-label={`Delete draft ${index + 1}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium text-paper/70">Entry type</label>
                    <select
                      value={draft.kind}
                      onChange={(event) => updateDraft({
                        kind: event.target.value as MoneyEntryKind,
                        categoryId: null,
                        createCategoryName: null,
                        split: event.target.value === 'expense' ? draft.split : { enabled: false, mode: 'equal', peopleIds: [] },
                      })}
                      className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                    >
                      {(Object.keys(KIND_LABELS) as MoneyEntryKind[]).map((kind) => (
                        <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
                      ))}
                    </select>
                  </div>
                  <Input label="Amount" type="number" min="0.01" step="0.01" value={draft.amount ?? ''} onChange={(event) => updateDraft({ amount: parseFloat(event.target.value) || null })} />
                  <Input label="Date" type="date" value={draft.occurredOn} onChange={(event) => updateDraft({ occurredOn: event.target.value })} />
                  <Input label="Description" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} className="sm:col-span-2" />

                  {draft.kind === 'income' && (
                    <Input label="Source" value={draft.source ?? ''} onChange={(event) => updateDraft({ source: event.target.value })} />
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-paper/70">Category</label>
                    <select
                      value={draft.categoryId ?? ''}
                      onChange={(event) => updateDraft({
                        categoryId: event.target.value || null,
                        createCategoryName: event.target.value ? null : draft.createCategoryName,
                      })}
                      className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                    >
                      <option value="">Uncategorized</option>
                      {relevantCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                    {!draft.categoryId && (
                      <div className="rounded-lg border border-ink-border bg-ink px-3 py-2">
                        <p className="text-xs text-paper/45">
                          This will save as Uncategorized unless you pick or create a category.
                        </p>
                        <Input
                          label="New category (optional)"
                          value={draft.createCategoryName ?? ''}
                          onChange={(event) => updateDraft({ createCategoryName: event.target.value })}
                          placeholder="Create while saving"
                          className="mt-2"
                        />
                      </div>
                    )}
                    {!draft.categoryId && draft.suggestedCategoryName && !draft.createCategoryName && (
                      <button
                        type="button"
                        onClick={() => updateDraft({ createCategoryName: draft.suggestedCategoryName })}
                        className="self-start text-xs font-medium text-emerald"
                      >
                        Use &quot;{draft.suggestedCategoryName}&quot;
                      </button>
                    )}
                  </div>

                  {groups.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-paper/70">Group</label>
                      <select
                        value={draft.groupId ?? ''}
                        onChange={(event) => updateDraft({ groupId: event.target.value || null })}
                        className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                      >
                        <option value="">Personal / no group</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {draft.kind === 'expense' && splitPeople.length > 0 && (
                  <div className="mt-3 border-t border-ink-border pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-paper/70">Split settings</p>
                      <button type="button" onClick={() => updateSplit({ enabled: !draft.split?.enabled })} className="text-xs font-medium text-emerald">
                        {draft.split?.enabled ? 'Turn off split' : 'Split this'}
                      </button>
                    </div>
                    {draft.split?.enabled && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {splitPeople.map((person) => {
                          const selected = draft.split?.peopleIds.includes(person.id);
                          return (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => togglePerson(person.id)}
                              className={cn('flex items-center justify-between rounded-lg border px-3 py-2 text-sm', selected ? 'border-emerald bg-emerald/10' : 'border-ink-border bg-ink')}
                            >
                              <span className="truncate">{person.full_name}</span>
                              {selected && <Check size={16} className="text-emerald" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {draft.questions && draft.questions.length > 0 && (
                  <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-paper/70">
                    {draft.questions.join(' ')}
                  </p>
                )}

                <Button type="button" size="lg" onClick={saveDrafts} disabled={saving} className="mt-3 w-full">
                  {saving ? 'Saving...' : drafts.length === 1 ? 'Save draft' : `Save ${drafts.length} drafts`}
                </Button>
              </div>
            )}

            {friendLedgerDrafts.length > 0 && friendDraft && (
              <div className="mb-3 rounded-xl border border-emerald/30 bg-emerald/5 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald/15 text-emerald">
                      <HandCoins size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Friend money draft</p>
                      <p className="text-xs text-paper/45">Borrowed and lent money goes into split balances.</p>
                    </div>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {friendLedgerDrafts.map((item, index) => (
                    <span
                      key={index}
                      className={cn(
                        'inline-flex items-center overflow-hidden rounded-full border text-xs font-medium',
                        selectedFriendDraft === index ? 'border-emerald bg-emerald/15 text-emerald' : 'border-ink-border text-paper/50'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFriendDraft(index)}
                        className="px-3 py-1"
                      >
                        Friend {index + 1}: {item.amount ? `₹${item.amount}` : 'Needs amount'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFriendDraft(index)}
                        className="border-l border-current/15 px-2 py-1 text-current/70 hover:text-clay"
                        aria-label={`Delete friend draft ${index + 1}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium text-paper/70">Transfer type</label>
                    <select
                      value={friendDraft.direction}
                      onChange={(event) => updateFriendDraft({ direction: event.target.value as FriendLedgerDraft['direction'] })}
                      className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                    >
                      <option value="borrowed">I borrowed from this person</option>
                      <option value="lent">I lent to this person</option>
                    </select>
                  </div>

                  <Input label="Amount" type="number" min="0.01" step="0.01" value={friendDraft.amount ?? ''} onChange={(event) => updateFriendDraft({ amount: parseFloat(event.target.value) || null })} />
                  <Input label="Date" type="date" value={friendDraft.occurredOn} onChange={(event) => updateFriendDraft({ occurredOn: event.target.value })} />

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-paper/70">Friend</label>
                    <select
                      value={friendDraft.personId ?? ''}
                      onChange={(event) => {
                        const selected = directory.find((person) => person.id === event.target.value);
                        updateFriendDraft({
                          personId: event.target.value || null,
                          personName: selected?.full_name ?? friendDraft.personName ?? null,
                        });
                      }}
                      className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                    >
                      <option value="">
                        {friendDraft.personName ? `Create ${friendDraft.personName} on save` : 'Pick existing friend'}
                      </option>
                      {directory.filter((person) => person.id !== currentUserId).map((person) => (
                        <option key={person.id} value={person.id}>{person.full_name}</option>
                      ))}
                    </select>
                    {!friendDraft.personId && (
                      <Input
                        label="New friend name"
                        value={friendDraft.personName ?? ''}
                        onChange={(event) => updateFriendDraft({ personName: event.target.value })}
                        placeholder="Rahul"
                      />
                    )}
                  </div>

                  <Input label="Note" value={friendDraft.description ?? ''} onChange={(event) => updateFriendDraft({ description: event.target.value })} />
                </div>

                {friendDraft.questions && friendDraft.questions.length > 0 && (
                  <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-paper/70">
                    {friendDraft.questions.join(' ')}
                  </p>
                )}

                <Button type="button" size="lg" onClick={saveFriendLedgerDrafts} disabled={saving} className="mt-3 w-full">
                  {saving ? 'Saving...' : friendLedgerDrafts.length === 1 ? 'Save friend balance' : `Save ${friendLedgerDrafts.length} friend balances`}
                </Button>
              </div>
            )}

            {subscriptionDrafts.length > 0 && subscriptionDraft && (
              <div className="mb-3 rounded-xl border border-gold/30 bg-gold/10 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
                      <Repeat2 size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Subscription draft</p>
                      <p className="text-xs text-paper/45">Adds recurring expenses when due.</p>
                    </div>
                  </div>
                  <CalendarClock size={17} className="text-paper/40" />
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {subscriptionDrafts.map((item, index) => (
                    <span
                      key={index}
                      className={cn(
                        'inline-flex items-center overflow-hidden rounded-full border text-xs font-medium',
                        selectedSubscriptionDraft === index ? 'border-gold bg-gold/15 text-gold' : 'border-ink-border text-paper/50'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSubscriptionDraft(index)}
                        className="px-3 py-1"
                      >
                        Sub {index + 1}: {item.amount ? `₹${item.amount}` : 'Needs amount'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSubscriptionDraft(index)}
                        className="border-l border-current/15 px-2 py-1 text-current/70 hover:text-clay"
                        aria-label={`Delete subscription draft ${index + 1}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Name" value={subscriptionDraft.name} onChange={(event) => updateSubscriptionDraft({ name: event.target.value })} />
                  <Input label="Amount" type="number" min="0.01" step="0.01" value={subscriptionDraft.amount ?? ''} onChange={(event) => updateSubscriptionDraft({ amount: parseFloat(event.target.value) || null })} />
                  <Input label={subscriptionDraft.frequency === 'weekly' ? 'Due day hint' : 'Billing day'} type="number" min="1" max="31" value={subscriptionDraft.billingDay} onChange={(event) => updateSubscriptionDraft({ billingDay: parseInt(event.target.value, 10) || 1 })} />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-paper/70">Repeats</label>
                    <select
                      value={subscriptionDraft.frequency}
                      onChange={(event) => updateSubscriptionDraft({ frequency: event.target.value as SubscriptionDraft['frequency'] })}
                      className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <Input label="Next due" type="date" value={subscriptionDraft.nextDueOn} onChange={(event) => updateSubscriptionDraft({ nextDueOn: event.target.value })} />

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-paper/70">Category</label>
                    <select
                      value={subscriptionDraft.categoryId ?? ''}
                      onChange={(event) => updateSubscriptionDraft({ categoryId: event.target.value || null })}
                      className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                    >
                      <option value="">Auto category</option>
                      {expenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>

                  {groups.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-paper/70">Group</label>
                      <select
                        value={subscriptionDraft.groupId ?? ''}
                        onChange={(event) => updateSubscriptionDraft({ groupId: event.target.value || null })}
                        className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                      >
                        <option value="">Personal</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>{group.emoji} {group.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <Input label="Notes" value={subscriptionDraft.notes ?? ''} onChange={(event) => updateSubscriptionDraft({ notes: event.target.value })} className="sm:col-span-2" />
                </div>

                {subscriptionDraft.questions && subscriptionDraft.questions.length > 0 && (
                  <p className="mt-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-paper/70">
                    {subscriptionDraft.questions.join(' ')}
                  </p>
                )}

                <Button type="button" size="lg" onClick={saveSubscriptionDrafts} disabled={saving} className="mt-3 w-full">
                  {saving ? 'Saving...' : subscriptionDrafts.length === 1 ? 'Save subscription' : `Save ${subscriptionDrafts.length} subscriptions`}
                </Button>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-lg border border-clay/30 bg-clay-soft/10 px-3 py-2 text-sm text-clay">
                {error}
              </div>
            )}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(message);
          }}
          className="flex flex-col gap-2 p-3"
        >
          {voiceMode !== 'idle' && (
            <div className="rounded-xl border border-emerald/20 bg-emerald/10 px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-emerald">
                  {voiceMode === 'transcribing' ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <div className="flex h-5 items-end gap-0.5" aria-hidden="true">
                      <span className="h-2 w-1 rounded-full bg-emerald animate-pulse" />
                      <span className="h-4 w-1 rounded-full bg-emerald animate-pulse [animation-delay:120ms]" />
                      <span className="h-3 w-1 rounded-full bg-emerald animate-pulse [animation-delay:240ms]" />
                      <span className="h-5 w-1 rounded-full bg-emerald animate-pulse [animation-delay:360ms]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald">
                    {voiceMode === 'transcribing' ? 'Correcting voice note' : 'Listening live'}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-paper/75">
                    {voiceMode === 'transcribing'
                      ? 'Cleaning the words and making smart drafts...'
                      : voicePreview || 'Speak naturally. I will clean it after you stop.'}
                  </p>
                </div>
              </div>
              {voiceMode === 'recording' && voicePreview && (
                <p className="mt-2 rounded-lg bg-ink/70 px-3 py-2 text-sm leading-relaxed text-paper/85">
                  {voicePreview}
                </p>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={message}
              onFocus={() => setOpen(true)}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={voiceMode === 'recording' ? 'Listening...' : 'Ask or add: spent 250 on chai...'}
              rows={1}
              className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-ink-border bg-ink px-3 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-emerald/60 focus:outline-none focus:ring-2 focus:ring-emerald/60"
            />
            <button
              type="button"
              onClick={toggleListening}
              className={cn(
                'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border transition-colors',
                listening ? 'border-clay bg-clay text-paper' : voiceMode === 'transcribing' ? 'border-gold bg-gold/15 text-gold' : 'border-ink-border bg-ink text-paper/70 hover:text-paper'
              )}
              aria-label={listening ? 'Stop voice note' : 'Start voice note'}
              disabled={voiceMode === 'transcribing'}
            >
              {voiceMode === 'transcribing' ? <Loader2 size={18} className="animate-spin" /> : listening ? <Square size={17} /> : <Mic size={18} />}
            </button>
            <button
              type="submit"
              disabled={loading || listening || !message.trim()}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald text-paper transition-colors hover:bg-emerald/90 disabled:opacity-40"
              aria-label="Send message"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
