'use client';

import { useMemo, useRef, useState } from 'react';
import { Bot, Check, Mic, Send, Square, Wand2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createTransaction } from '@/app/actions/transactions';
import { Category, DirectoryUser, Group, TransactionKind } from '@/lib/types';
import { cn } from '@/lib/utils/format';

type Draft = {
  kind: TransactionKind;
  amount: number | null;
  description: string;
  source?: string | null;
  occurredOn: string;
  categoryId?: string | null;
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

const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
};

export function AiQuickAddModal({
  categories,
  directory,
  groups,
  currentUserId,
  onClose,
}: {
  categories: Category[];
  directory: DirectoryUser[];
  groups: Group[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [transcript, setTranscript] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const draft = drafts[selectedDraft];
  const relevantCategories = useMemo(
    () => categories.filter((category) => category.kind === (draft?.kind === 'income' ? 'income' : 'expense')),
    [categories, draft?.kind]
  );
  const selectedGroup = groups.find((group) => group.id === draft?.groupId);
  const allowedMemberIds = selectedGroup?.members?.map((member) => member.user_id) ?? [];
  const splitPeople = directory.filter((person) =>
    person.id !== currentUserId && (!selectedGroup || allowedMemberIds.includes(person.id))
  );

  function updateDraft(patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((item, index) => (index === selectedDraft ? { ...item, ...patch } : item))
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

  async function parseWithText(text: string) {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/ai/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Could not parse this.');
      setTranscript(data.transcript);
      setDrafts(data.drafts ?? []);
      setSelectedDraft(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse this.');
    } finally {
      setLoading(false);
    }
  }

  async function parseWithAudio(audio: Blob) {
    setError(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append('audio', audio, 'voice-note.webm');
      const response = await fetch('/api/ai/quick-add', {
        method: 'POST',
        body: form,
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error ?? 'Could not parse your voice note.');
      setTranscript(data.transcript);
      setMessage(data.transcript);
      setDrafts(data.drafts ?? []);
      setSelectedDraft(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse your voice note.');
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice recording is not supported in this browser.');
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const audio = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (audio.size > 0) void parseWithAudio(audio);
    };

    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
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

        const split = item.split;
        const equalShare = split?.peopleIds?.length
          ? item.amount / (split.peopleIds.length + 1)
          : 0;

        await createTransaction({
          kind: item.kind,
          groupId: item.groupId ?? null,
          categoryId: item.categoryId ?? null,
          amount: item.amount,
          description: item.description,
          source: item.kind === 'income' ? item.source ?? undefined : undefined,
          occurredOn: item.occurredOn,
          splits: split?.enabled
            ? split.peopleIds.map((personId) => ({
                userId: personId,
                amount: split.mode === 'custom'
                  ? split.customAmounts?.[personId] ?? 0
                  : equalShare,
              }))
            : undefined,
        });
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save drafts.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-ink-border bg-ink-raised sm:max-w-2xl sm:rounded-2xl thin-scroll">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-border bg-ink-raised px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald/15 text-emerald">
              <Bot size={18} />
            </span>
            <div>
              <h2 className="font-semibold">AI Quick Add</h2>
              <p className="text-xs text-paper/45">Speak naturally. Review before saving.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-paper/50 hover:text-paper">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <div className="rounded-xl border border-ink-border bg-ink p-4">
            <label htmlFor="ai-message" className="text-sm font-medium text-paper/70">
              Tell Mithu what happened
            </label>
            <textarea
              id="ai-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. Spent 850 on dinner yesterday, split equally with Rahul and Ananya"
              className="mt-2 min-h-24 w-full resize-none rounded-lg border border-ink-border bg-ink-raised px-3 py-2.5 text-sm text-paper placeholder:text-paper/30 focus:border-emerald/60 focus:outline-none focus:ring-2 focus:ring-emerald/60"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => parseWithText(message)} disabled={loading || !message.trim()}>
                <Wand2 size={16} />
                {loading ? 'Thinking...' : 'Make draft'}
              </Button>
              <Button
                type="button"
                variant={recording ? 'danger' : 'secondary'}
                onClick={recording ? stopRecording : startRecording}
                disabled={loading}
              >
                {recording ? <Square size={16} /> : <Mic size={16} />}
                {recording ? 'Stop recording' : 'Voice note'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => parseWithText('Spent 250 on chai today')}
                disabled={loading}
              >
                <Send size={16} />
                Try sample
              </Button>
            </div>
            {transcript && (
              <p className="mt-3 rounded-lg bg-emerald/10 px-3 py-2 text-xs text-paper/60">
                Heard: {transcript}
              </p>
            )}
          </div>

          {drafts.length > 0 && draft && (
            <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {drafts.map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedDraft(index)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium',
                      selectedDraft === index
                        ? 'border-emerald bg-emerald/15 text-emerald'
                        : 'border-ink-border text-paper/50'
                    )}
                  >
                    Draft {index + 1}: {item.amount ? `₹${item.amount}` : 'Needs amount'}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                  {(Object.keys(KIND_LABELS) as TransactionKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => updateDraft({ kind, categoryId: null })}
                      className={cn(
                        'rounded-lg border py-2 text-sm font-medium',
                        draft.kind === kind
                          ? 'border-emerald bg-emerald/15 text-emerald'
                          : 'border-ink-border text-paper/60'
                      )}
                    >
                      {KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>

                <Input
                  label="Amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.amount ?? ''}
                  onChange={(event) => updateDraft({ amount: parseFloat(event.target.value) || null })}
                />
                <Input
                  label="Date"
                  type="date"
                  value={draft.occurredOn}
                  onChange={(event) => updateDraft({ occurredOn: event.target.value })}
                />
                <Input
                  label="Description"
                  value={draft.description}
                  onChange={(event) => updateDraft({ description: event.target.value })}
                  className="sm:col-span-2"
                />

                {draft.kind === 'income' && (
                  <Input
                    label="Source"
                    value={draft.source ?? ''}
                    onChange={(event) => updateDraft({ source: event.target.value })}
                  />
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-paper/70">Category</label>
                  <select
                    value={draft.categoryId ?? ''}
                    onChange={(event) => updateDraft({ categoryId: event.target.value || null })}
                    className="w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper focus:outline-none focus:ring-2 focus:ring-emerald/60"
                  >
                    <option value="">Uncategorized</option>
                    {relevantCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
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
                <div className="mt-4 border-t border-ink-border pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-paper/70">Split with</p>
                    <button
                      type="button"
                      onClick={() => updateSplit({ enabled: !draft.split?.enabled })}
                      className="text-xs font-medium text-emerald"
                    >
                      {draft.split?.enabled ? 'Turn off' : 'Turn on'}
                    </button>
                  </div>
                  {draft.split?.enabled && (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        {(['equal', 'custom'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateSplit({ mode })}
                            className={cn(
                              'rounded-lg border py-1.5 text-xs font-medium',
                              draft.split?.mode === mode
                                ? 'border-emerald bg-emerald/15 text-emerald'
                                : 'border-ink-border text-paper/60'
                            )}
                          >
                            {mode === 'equal' ? 'Equal' : 'Custom'}
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {splitPeople.map((person) => {
                          const selected = draft.split?.peopleIds.includes(person.id);
                          return (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => togglePerson(person.id)}
                              className={cn(
                                'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                                selected ? 'border-emerald bg-emerald/10' : 'border-ink-border bg-ink'
                              )}
                            >
                              <span className="truncate">{person.full_name}</span>
                              {selected && <Check size={16} className="text-emerald" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {draft.questions && draft.questions.length > 0 && (
                <div className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-paper/70">
                  {draft.questions.join(' ')}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-clay/30 bg-clay-soft/10 px-3 py-2 text-sm text-clay">
              {error}
            </div>
          )}

          {drafts.length > 0 && (
            <Button type="button" size="lg" onClick={saveDrafts} disabled={saving}>
              {saving ? 'Saving...' : drafts.length === 1 ? 'Save draft' : `Save ${drafts.length} drafts`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
