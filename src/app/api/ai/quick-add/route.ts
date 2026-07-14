import OpenAI from 'openai';
import {
  computeBalances,
  getCategories,
  getCurrentProfile,
  getDirectory,
  getGroups,
  getSplitShares,
} from '@/lib/data/dashboard';
import { inferCategory } from '@/lib/categories/auto';

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

type ParsedSubscriptionDraft = {
  name: string;
  amount: number | null;
  billingDay?: number | null;
  nextDueOn?: string | null;
  categoryId?: string | null;
  groupId?: string | null;
  notes?: string | null;
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

function cheapReply(transcript: string) {
  const text = transcript.trim().toLowerCase();
  if (/^(hi|hello|hey|yo|namaste|sup)\b/.test(text)) {
    return 'Hey, tell me what you spent, earned, or want to check.';
  }
  if (text.length < 4) {
    return 'I am here. Type or speak a money note when ready.';
  }
  if (/\b(help|what can you do|how to use)\b/.test(text)) {
    return 'Say things like “spent 250 on chai”, “got 5000 from dad”, or “Netflix 499 monthly”.';
  }
  return null;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function isOutstandingQuestion(transcript: string) {
  const text = transcript.trim().toLowerCase();
  const asksForStatus = /\b(who|how much|kitna|kya|show|list|tell|pending|outstanding|balance|balances|summary)\b/.test(text);
  const mentionsOwing = /\b(owe|owes|owed|owing|split|splits|udhaar|pending|outstanding|balance|balances)\b/.test(text);
  const soundsLikeEntry = /\b(spent|paid|got|earned|received|income|add|bought|subscription|monthly|every month)\b/.test(text);
  return asksForStatus && mentionsOwing && !soundsLikeEntry;
}

async function outstandingReply(userId: string) {
  const splitShares = await getSplitShares();
  const balances = computeBalances(splitShares, userId);
  const peopleWhoOweYou = balances.filter((balance) => balance.net > 0);
  const peopleYouOwe = balances.filter((balance) => balance.net < 0);
  const totalOwedToYou = peopleWhoOweYou.reduce((sum, balance) => sum + balance.net, 0);
  const totalYouOwe = peopleYouOwe.reduce((sum, balance) => sum + Math.abs(balance.net), 0);

  if (peopleWhoOweYou.length === 0 && peopleYouOwe.length === 0) {
    return 'No outstanding split balances right now.';
  }

  const topOwed = peopleWhoOweYou
    .slice(0, 3)
    .map((balance) => `${balance.fullName}: ${formatCurrency(balance.net)}`)
    .join(', ');
  const topYouOwe = peopleYouOwe
    .slice(0, 2)
    .map((balance) => `${balance.fullName}: ${formatCurrency(Math.abs(balance.net))}`)
    .join(', ');

  const parts = [];
  if (totalOwedToYou > 0) {
    parts.push(`People owe you ${formatCurrency(totalOwedToYou)}${topOwed ? ` (${topOwed})` : ''}.`);
  }
  if (totalYouOwe > 0) {
    parts.push(`You owe ${formatCurrency(totalYouOwe)}${topYouOwe ? ` (${topYouOwe})` : ''}.`);
  }

  return parts.join(' ');
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError('Please sign in again.', 401);

    const contentType = request.headers.get('content-type') ?? '';
    let transcript = '';
    let audio: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const audioFile = form.get('audio');
      const typedNote = form.get('message');

      if (audioFile instanceof File && audioFile.size > 0) {
        audio = audioFile;
        if (audio.size > 10 * 1024 * 1024) {
          return jsonError('Voice note is too large. Keep it under 10 MB.');
        }
      }

      if (typeof typedNote === 'string') {
        transcript = typedNote;
      }
    } else {
      const body = await request.json().catch(() => null);
      transcript = typeof body?.message === 'string' ? body.message : '';
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey && audio) {
      return jsonError('AI voice is not configured. Add OPENAI_API_KEY in Vercel, then redeploy.', 503);
    }

    const openai = apiKey ? new OpenAI({ apiKey }) : null;

    if (audio && openai) {
      const transcription = await openai.audio.transcriptions.create({
        file: audio,
        model: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
      });
      transcript = transcription.text || transcript;
    }

    transcript = transcript.trim();
    if (!transcript) return jsonError('Say or type what happened first.');

    const noTokenReply = cheapReply(transcript);
    if (noTokenReply) {
      return Response.json({ transcript, reply: noTokenReply, drafts: [], subscriptionDrafts: [] });
    }

    if (isOutstandingQuestion(transcript)) {
      return Response.json({
        transcript,
        reply: await outstandingReply(profile.id),
        drafts: [],
        subscriptionDrafts: [],
      });
    }

    if (!apiKey || !openai) {
      return jsonError('AI is not configured. Add OPENAI_API_KEY in Vercel, then redeploy.', 503);
    }

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
            'Act like a concise friendly chat assistant. Reply normally if the user is chatting, greeting, or asking non-entry questions.',
            'Do not force a transaction draft if there is no clear money event.',
            'Keep reply under 22 words.',
            'Use IDs from the provided context whenever you can match a category, friend, or group.',
            'For dates, return YYYY-MM-DD. Resolve today/yesterday using context.today.',
            'For equal splits, peopleIds should include only other people, not the current user.',
            'For custom splits, customAmounts are amounts owed by each other person.',
            'If the user mentions multiple unrelated money events, return multiple drafts.',
            'One long voice note can contain many entries. Split every clear expense, income, investment, and subscription into its own draft.',
            'Use commas, "and", "also", "then", pauses, or sentence breaks as hints for separate drafts.',
            'Example: "spent 100 chai and 250 cab and got 5000 from dad" means two expense drafts and one income draft.',
            'If the user mentions subscriptions, recurring payments, renewals, EMI, rent, membership, or every month, return subscriptionDrafts.',
            'Do not also create a normal expense draft for a subscription unless the user clearly says it was paid today.',
            'For subscription billingDay, infer day of month if mentioned, otherwise use today day.',
            'If unsure, keep confidence lower and add short questions.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            context,
            transcript,
            outputShape: {
              reply: 'short friendly assistant reply',
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
              subscriptionDrafts: [
                {
                  name: 'subscription or recurring bill name',
                  amount: 'number or null',
                  billingDay: '1 to 31 or null',
                  nextDueOn: 'YYYY-MM-DD or null',
                  categoryId: 'matching expense category id or null',
                  groupId: 'matching group id or null',
                  notes: 'short note or null',
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

    const parsed = extractJson(content) as { reply?: string; drafts?: ParsedDraft[]; subscriptionDrafts?: ParsedSubscriptionDraft[] };
    const drafts = (parsed.drafts ?? []).map((draft) => ({
      kind: draft.kind,
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      description: draft.description ?? '',
      source: draft.source ?? null,
      occurredOn: draft.occurredOn || today,
      categoryId: draft.categoryId ?? inferCategory(draft.kind, `${draft.description ?? ''} ${draft.source ?? ''}`, categories)?.id ?? null,
      groupId: draft.groupId ?? null,
      split: draft.split ?? { enabled: false, mode: 'equal', peopleIds: [] },
      confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
      questions: draft.questions ?? [],
    }));
    const subscriptionDrafts = (parsed.subscriptionDrafts ?? []).map((draft) => ({
      name: draft.name ?? '',
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      billingDay: typeof draft.billingDay === 'number' ? Math.min(Math.max(Math.trunc(draft.billingDay), 1), 31) : new Date(today).getDate(),
      nextDueOn: draft.nextDueOn || today,
      categoryId: draft.categoryId ?? inferCategory('expense', draft.name ?? '', categories)?.id ?? null,
      groupId: draft.groupId ?? null,
      notes: draft.notes ?? null,
      confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
      questions: draft.questions ?? [],
    }));

    return Response.json({
      transcript,
      reply: parsed.reply ?? (drafts.length > 0 || subscriptionDrafts.length > 0 ? 'I made a draft. Review it before saving.' : 'Got it.'),
      drafts,
      subscriptionDrafts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed.';
    return jsonError(message, 500);
  }
}
