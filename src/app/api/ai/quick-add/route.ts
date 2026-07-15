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
import { format } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ParsedDraft = {
  kind: 'expense' | 'income' | 'investment';
  amount: number | null;
  description: string;
  source?: string | null;
  occurredOn: string;
  categoryId?: string | null;
  suggestedCategoryName?: string | null;
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

function normalizeDraftKind(kind: unknown): ParsedDraft['kind'] {
  if (kind === 'income' || kind === 'investment') return kind;
  return 'expense';
}

function hasExplicitDateClue(transcript: string) {
  return /\b(today|yesterday|tomorrow|last night|this morning|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i.test(transcript)
    || /\b\d{1,2}(?:st|nd|rd|th)\b/i.test(transcript)
    || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(transcript);
}

function hasExplicitYear(transcript: string) {
  return /\b(?:19|20)\d{2}\b/.test(transcript);
}

function normalizeDraftDate(date: unknown, today: string, transcript: string) {
  if (!hasExplicitDateClue(transcript)) return today;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return today;

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return today;

  const currentYear = Number(today.slice(0, 4));
  const parsedYear = parsed.getFullYear();
  if (!hasExplicitYear(transcript) && parsedYear !== currentYear) {
    const monthDay = date.slice(4);
    return `${currentYear}${monthDay}`;
  }

  return date;
}

function looksLikeFriendMoneyDraft(draft: ParsedDraft) {
  const text = `${draft.description ?? ''} ${draft.source ?? ''}`.toLowerCase();
  return /\b(borrowed|borrow|took money|take money|lent|lend|gave money|udhaar|loaned)\b/.test(text);
}

function looksLikeSubscriptionDraft(draft: ParsedDraft) {
  const text = `${draft.description ?? ''} ${draft.source ?? ''} ${draft.suggestedCategoryName ?? ''}`.toLowerCase();
  return /\b(subscription|subscribe|subscribed|recurring|renewal|renews|monthly|weekly|every month|every week|emi|membership|netflix|spotify|prime|youtube premium|icloud|google one|notion|chatgpt|openai)\b/.test(text);
}

function subscriptionNameFromDraft(draft: ParsedDraft) {
  const text = `${draft.description ?? draft.source ?? ''}`
    .replace(/\b(subscription|subscribed|monthly|weekly|recurring|renewal|payment|paid|spent|for|on)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || draft.source || draft.description || 'Subscription';
}

type ParsedFriendLedgerDraft = {
  direction: 'borrowed' | 'lent';
  amount: number | null;
  personId?: string | null;
  personName?: string | null;
  description?: string | null;
  occurredOn: string;
  confidence: number;
  questions?: string[];
};

type ParsedSubscriptionDraft = {
  name: string;
  amount: number | null;
  billingDay?: number | null;
  frequency?: 'weekly' | 'monthly' | null;
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

function normalizeTranscript(input: string) {
  return input
    .replace(/[₹]/g, ' rupees ')
    .replace(/\b(rs|inr)\.?\s*/gi, ' rupees ')
    .replace(/\b(\d+(?:\.\d+)?)\s*k\b/gi, (_, value) => `${Number(value) * 1000}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*(hundred|hundreds)\b/gi, (_, value) => `${Number(value) * 100}`)
    .replace(/\b(\d+(?:\.\d+)?)\s*(thousand|thousands)\b/gi, (_, value) => `${Number(value) * 1000}`)
    .replace(/\bsubcription\b/gi, 'subscription')
    .replace(/\bsubscribtion\b/gi, 'subscription')
    .replace(/\bsubscript(?:ion)?\b/gi, 'subscription')
    .replace(/\bmontly\b/gi, 'monthly')
    .replace(/\bmonthy\b/gi, 'monthly')
    .replace(/\brecurringg?\b/gi, 'recurring')
    .replace(/\bexpence\b/gi, 'expense')
    .replace(/\bexpenditure\b/gi, 'expense')
    .replace(/\bpayed\b/gi, 'paid')
    .replace(/\boweing\b/gi, 'owing')
    .replace(/\budhar\b/gi, 'udhaar')
    .replace(/\budaar\b/gi, 'udhaar')
    .replace(/\budhaar\b/gi, 'udhaar')
    .replace(/\ble liya\b/gi, 'borrowed')
    .replace(/\bliya\b/gi, 'borrowed')
    .replace(/\bliye\b/gi, 'borrowed')
    .replace(/\bde diya\b/gi, 'lent')
    .replace(/\bdiya\b/gi, 'lent')
    .replace(/\bsplit kar\b/gi, 'split')
    .replace(/\bsplit karo\b/gi, 'split')
    .replace(/\bsutta\b/gi, 'smoke')
    .replace(/\bcigger?e?t?t?e?\b/gi, 'cigarette')
    .replace(/\bcigg?\b/gi, 'cigarette')
    .replace(/\bchaii\b/gi, 'chai')
    .replace(/\bchaay\b/gi, 'chai')
    .replace(/\btea\b/gi, 'chai')
    .replace(/\bcoffeee\b/gi, 'coffee')
    .replace(/\bpetrol\b/gi, 'fuel')
    .replace(/\bdiesel\b/gi, 'fuel')
    .replace(/\bcab\b/gi, 'cab')
    .replace(/\buber\b/gi, 'Uber')
    .replace(/\bola\b/gi, 'Ola')
    .replace(/\bnet flix\b/gi, 'Netflix')
    .replace(/\bspotyfy\b/gi, 'Spotify')
    .replace(/\bspoti fi\b/gi, 'Spotify')
    .replace(/\byou tube\b/gi, 'YouTube')
    .replace(/\bprimee\b/gi, 'Prime')
    .replace(/\binsta\b/gi, 'Instagram')
    .replace(/\bswiggy\b/gi, 'Swiggy')
    .replace(/\bzomato\b/gi, 'Zomato')
    .replace(/\bblink it\b/gi, 'Blinkit')
    .replace(/\bsplit between\b/gi, 'split with')
    .replace(/\bdivide with\b/gi, 'split with')
    .replace(/\bshared with\b/gi, 'split with')
    .replace(/\bfrom my friend\b/gi, 'from friend')
    .replace(/\band then\b/gi, ' and ')
    .replace(/\balso\b/gi, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanVoiceTranscript(input: string) {
  const normalized = normalizeTranscript(input);
  return normalized
    .replace(/\bI\s+(?:have\s+)?(?:spent|spend)\b/gi, 'spent')
    .replace(/\bI\s+(?:have\s+)?(?:got|received)\b/gi, 'got')
    .replace(/\bI\s+(?:have\s+)?(?:borrowed|took)\b/gi, 'borrowed')
    .replace(/\bI\s+(?:have\s+)?(?:gave|given|lent)\b/gi, 'lent')
    .replace(/\badd\s+one\s+entry\s+for\b/gi, '')
    .replace(/\bplease\s+add\b/gi, 'add')
    .replace(/\s+/g, ' ')
    .trim();
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
        prompt: [
          'Indian English and Hinglish expense tracker voice note.',
          'Correct obvious speech recognition mistakes into clean readable money notes.',
          'Examples: cigger/cigg/sutta means cigarette or smoke, montly means monthly, udhar/udhaar means borrowed/lent money.',
          'Common words: rupees, chai, sutta, smoke, cigarette, petrol, cab, Uber, Ola, Swiggy, Zomato, Blinkit.',
          'Money actions: spent, paid, got, received, borrowed, lent, udhaar, split, subscription, monthly.',
          'Preserve names of friends, vendors, apps, and amounts.',
        ].join(' '),
      });
      transcript = transcription.text || transcript;
    }

    transcript = transcript.trim();
    if (!transcript) return jsonError('Say or type what happened first.');
    const correctedTranscript = audio ? cleanVoiceTranscript(transcript) : transcript;
    const normalizedTranscript = normalizeTranscript(correctedTranscript);

    const noTokenReply = cheapReply(normalizedTranscript);
    if (noTokenReply) {
      return Response.json({
        transcript,
        correctedTranscript,
        normalizedTranscript,
        reply: noTokenReply,
        drafts: [],
        subscriptionDrafts: [],
        friendLedgerDrafts: [],
      });
    }

    if (isOutstandingQuestion(normalizedTranscript)) {
      return Response.json({
        transcript,
        correctedTranscript,
        normalizedTranscript,
        reply: await outstandingReply(profile.id),
        drafts: [],
        subscriptionDrafts: [],
        friendLedgerDrafts: [],
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

    const today = format(new Date(), 'yyyy-MM-dd');
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
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You convert casual Indian English or Hinglish money notes into transaction drafts for an expense tracker.',
            'Correct obvious speech-to-text mistakes silently before drafting.',
            'Prefer the normalized transcript, but use the raw transcript if it preserves names or meaning better.',
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
            'Friend money is not vendor spend. If user says borrowed/took money from a friend, return friendLedgerDrafts direction borrowed.',
            'If user says lent/gave/paid for a friend and they should return it, return friendLedgerDrafts direction lent.',
            'Phrases like "took money from Rahul", "take money from Rahul", "borrowed from Rahul" mean borrowed.',
            'Use friendLedgerDrafts only when a friend/person is involved in lending or borrowing, not for shops, vendors, salary, or refunds.',
            'For vendor/shop payments, return normal expense drafts and keep the vendor or merchant name in description for history search.',
            'If no category ID matches well, suggest a short category name in suggestedCategoryName.',
            'If the user mentions subscriptions, recurring payments, renewals, EMI, rent, membership, every week, or every month, return subscriptionDrafts.',
            'Words like "Netflix subscription", "Spotify subscription", "Prime subscription", "ChatGPT subscription", or "iCloud subscription" are subscriptionDrafts even if the user does not say monthly.',
            'Do not also create a normal expense draft for a subscription unless the user clearly says it was paid today.',
            'For subscription frequency, use weekly for every week/weekly and monthly for every month/monthly. Default to monthly.',
            'For subscription billingDay, infer day of month if mentioned, otherwise use today day.',
            'If unsure, keep confidence lower and add short questions.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            context,
            rawTranscript: transcript,
            correctedTranscript,
            transcript: normalizedTranscript,
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
                  suggestedCategoryName: 'new category name if no category fits, else null',
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
                  frequency: 'weekly | monthly',
                  nextDueOn: 'YYYY-MM-DD or null',
                  categoryId: 'matching expense category id or null',
                  groupId: 'matching group id or null',
                  notes: 'short note or null',
                  confidence: '0 to 1',
                  questions: ['short confirmation questions if needed'],
                },
              ],
              friendLedgerDrafts: [
                {
                  direction: 'borrowed | lent',
                  amount: 'number or null',
                  personId: 'matching friend id or null',
                  personName: 'friend name if mentioned',
                  description: 'short description',
                  occurredOn: 'YYYY-MM-DD',
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

    const parsed = extractJson(content) as {
      reply?: string;
      drafts?: ParsedDraft[];
      subscriptionDrafts?: ParsedSubscriptionDraft[];
      friendLedgerDrafts?: ParsedFriendLedgerDraft[];
    };
    const rawDrafts = parsed.drafts ?? [];
    const subscriptionFallbacks = rawDrafts
      .filter((draft) => !looksLikeFriendMoneyDraft(draft) && looksLikeSubscriptionDraft(draft))
      .map((draft) => ({
        name: subscriptionNameFromDraft(draft),
        amount: typeof draft.amount === 'number' ? draft.amount : null,
        billingDay: new Date(today).getDate(),
        frequency: 'monthly' as const,
        nextDueOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
        categoryId: draft.categoryId ?? inferCategory('expense', `${draft.description ?? ''} ${draft.source ?? ''}`, categories)?.id ?? null,
        groupId: draft.groupId ?? null,
        notes: draft.description ?? null,
        confidence: typeof draft.confidence === 'number' ? Math.min(draft.confidence, 0.85) : 0.75,
        questions: draft.questions ?? [],
      }));
    const drafts = rawDrafts
      .filter((draft) => !looksLikeFriendMoneyDraft(draft))
      .filter((draft) => !looksLikeSubscriptionDraft(draft))
      .map((draft) => ({
      kind: normalizeDraftKind(draft.kind),
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      description: draft.description ?? '',
      source: draft.source ?? null,
      occurredOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
      categoryId: draft.categoryId ?? inferCategory(normalizeDraftKind(draft.kind), `${draft.description ?? ''} ${draft.source ?? ''}`, categories)?.id ?? null,
      suggestedCategoryName: draft.suggestedCategoryName ?? null,
      groupId: draft.groupId ?? null,
      split: draft.split ?? { enabled: false, mode: 'equal', peopleIds: [] },
      confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
      questions: draft.questions ?? [],
    }));
    const friendLedgerDrafts = (parsed.friendLedgerDrafts ?? []).map((draft) => ({
      direction: draft.direction === 'lent' ? 'lent' : 'borrowed',
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      personId: draft.personId ?? null,
      personName: draft.personName ?? null,
      description: draft.description ?? '',
      occurredOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
      confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
      questions: draft.questions ?? [],
    }));
    const subscriptionDrafts = [
      ...(parsed.subscriptionDrafts ?? []).map((draft) => ({
      name: draft.name ?? '',
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      billingDay: typeof draft.billingDay === 'number' ? Math.min(Math.max(Math.trunc(draft.billingDay), 1), 31) : new Date(today).getDate(),
      frequency: draft.frequency === 'weekly' ? 'weekly' : 'monthly',
      nextDueOn: draft.nextDueOn || today,
      categoryId: draft.categoryId ?? inferCategory('expense', draft.name ?? '', categories)?.id ?? null,
      groupId: draft.groupId ?? null,
      notes: draft.notes ?? null,
      confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
      questions: draft.questions ?? [],
      })),
      ...subscriptionFallbacks,
    ];

    return Response.json({
      transcript,
      correctedTranscript,
      normalizedTranscript,
      reply: parsed.reply ?? (drafts.length > 0 || subscriptionDrafts.length > 0 || friendLedgerDrafts.length > 0 ? 'I made a draft. Review it before saving.' : 'Got it.'),
      drafts,
      subscriptionDrafts,
      friendLedgerDrafts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed.';
    return jsonError(message, 500);
  }
}
