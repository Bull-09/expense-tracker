import OpenAI from 'openai';
import { getCategories, getCurrentProfile, getDirectory, getGroups } from '@/lib/data/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ParsedDraft = {
  kind: 'expense' | 'income' | 'investment';
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

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function extractJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return jsonError('Please sign in again.', 401);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError('AI is not configured. Add OPENAI_API_KEY in Vercel.', 503);
  }

  const openai = new OpenAI({ apiKey });
  const contentType = request.headers.get('content-type') ?? '';
  let transcript = '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const audio = form.get('audio');
    const typedNote = form.get('message');

    if (audio instanceof File && audio.size > 0) {
      if (audio.size > 10 * 1024 * 1024) {
        return jsonError('Voice note is too large. Keep it under 10 MB.');
      }

      const transcription = await openai.audio.transcriptions.create({
        file: audio,
        model: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
      });
      transcript = transcription.text;
    }

    if (!transcript && typeof typedNote === 'string') {
      transcript = typedNote;
    }
  } else {
    const body = await request.json().catch(() => null);
    transcript = typeof body?.message === 'string' ? body.message : '';
  }

  transcript = transcript.trim();
  if (!transcript) return jsonError('Say or type what happened first.');

  const [categories, directory, groups] = await Promise.all([
    getCategories(),
    getDirectory(),
    getGroups(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const context = {
    today,
    currentUser: {
      id: profile.id,
      name: profile.full_name,
      email: profile.email,
    },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
    friends: directory
      .filter((person) => person.id !== profile.id)
      .map((person) => ({
        id: person.id,
        name: person.full_name,
        email: person.email,
      })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      memberIds: group.members?.map((member) => member.user_id) ?? [],
    })),
  };

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_PARSE_MODEL ?? 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'You convert casual Indian English or Hinglish money notes into transaction drafts for an expense tracker.',
          'Return only valid JSON. Never save automatically.',
          'Use IDs from the provided context whenever you can match a category, friend, or group.',
          'For dates, return YYYY-MM-DD. Resolve today/yesterday using context.today.',
          'For equal splits, peopleIds should include only other people, not the current user.',
          'For custom splits, customAmounts are amounts owed by each other person.',
          'If the user mentions multiple unrelated money events, return multiple drafts.',
          'If unsure, keep confidence lower and add short questions.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          context,
          transcript,
          outputShape: {
            drafts: [
              {
                kind: 'expense | income | investment',
                amount: 'number or null',
                description: 'short human readable text',
                source: 'income source or null',
                occurredOn: 'YYYY-MM-DD',
                categoryId: 'matching category id or null',
                groupId: 'matching group id or null',
                split: {
                  enabled: 'boolean',
                  mode: 'equal | custom',
                  peopleIds: ['matching friend ids'],
                  customAmounts: { friendId: 'number owed by that friend' },
                },
                confidence: '0 to 1',
                questions: ['short confirmation questions if needed'],
              },
            ],
          },
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return jsonError('AI did not return a draft.', 502);

  const parsed = extractJson(content) as { drafts?: ParsedDraft[] };
  const drafts = (parsed.drafts ?? []).map((draft) => ({
    kind: draft.kind,
    amount: typeof draft.amount === 'number' ? draft.amount : null,
    description: draft.description ?? '',
    source: draft.source ?? null,
    occurredOn: draft.occurredOn || today,
    categoryId: draft.categoryId ?? null,
    groupId: draft.groupId ?? null,
    split: draft.split ?? { enabled: false, mode: 'equal', peopleIds: [] },
    confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
    questions: draft.questions ?? [],
  }));

  return Response.json({ transcript, drafts });
}
