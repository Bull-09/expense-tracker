import OpenAI from 'openai';
import {
  computeBalances,
  getCategories,
  getCurrentProfile,
  getDirectory,
  getGroups,
  getMerchantRules,
  getSubscriptions,
  getSplitShares,
  getTransactions,
} from '@/lib/data/dashboard';
import { inferCategoryMatch, suggestCategoryName } from '@/lib/categories/auto';
import { matchMerchantRule } from '@/lib/categories/rules';
import type { MerchantRule } from '@/lib/types';
import { format } from 'date-fns';
import { TransactionKind } from '@/lib/types';

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
  return /\b(borrowed|borrow|took money|take money|lent|lend|gave money|gave|paid for|udhaar|loaned)\b/.test(text);
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

function normalizePersonLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

type ParsedActionPlan =
  | {
      type: 'set_budget';
      title?: string;
      summary?: string;
      monthlyBudget: number | null;
      confidence?: number;
    }
  | {
      type: 'delete_transaction';
      title?: string;
      summary?: string;
      transactionId: string;
      confidence?: number;
    }
  | {
      type: 'update_transaction';
      title?: string;
      summary?: string;
      transactionId: string;
      kind?: TransactionKind;
      amount?: number;
      description?: string;
      source?: string | null;
      occurredOn?: string;
      categoryId?: string | null;
      suggestedCategoryName?: string | null;
      groupId?: string | null;
      confidence?: number;
    }
  | {
      type: 'delete_subscription';
      title?: string;
      summary?: string;
      subscriptionId: string;
      confidence?: number;
    }
  | {
      type: 'update_subscription';
      title?: string;
      summary?: string;
      subscriptionId: string;
      name?: string;
      amount?: number;
      billingDay?: number;
      frequency?: 'weekly' | 'monthly';
      nextDueOn?: string;
      categoryId?: string | null;
      groupId?: string | null;
      active?: boolean;
      notes?: string | null;
      confidence?: number;
    };

type ClientStateSnapshot = {
  currentDrafts: ParsedDraft[];
  currentSubscriptionDrafts: ParsedSubscriptionDraft[];
  currentFriendLedgerDrafts: ParsedFriendLedgerDraft[];
  recentMessages: Array<{ role?: string; text?: string }>;
};

const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number; note?: string }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60, note: 'Legacy estimate for gpt-4o-mini text tokens.' },
  'gpt-5.4': { input: 2.50, output: 15.00 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gpt-5.4-nano': { input: 0.20, output: 1.25 },
  'gpt-5.4-pro': { input: 15.00, output: 120.00 },
  'gpt-5.5': { input: 5.00, output: 30.00 },
  'gpt-5.5-pro': { input: 21.00, output: 168.00 },
  'gpt-5.6': { input: 1.75, output: 14.00 },
};

const TRANSCRIPTION_USD_PER_MINUTE: Record<string, number> = {
  'gpt-4o-mini-transcribe': 0.003,
  'gpt-4o-transcribe': 0.006,
};

function estimateTokenCostUsd(model: string, promptTokens: number, completionTokens: number) {
  const pricing = MODEL_PRICING_USD_PER_1M[model];
  if (!pricing) return null;

  return ((promptTokens / 1_000_000) * pricing.input) + ((completionTokens / 1_000_000) * pricing.output);
}

function estimateTranscriptionCostUsd(model: string, durationMs: number) {
  const rate = TRANSCRIPTION_USD_PER_MINUTE[model];
  if (!rate || durationMs <= 0) return null;

  return (durationMs / 60_000) * rate;
}

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function extractJson(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

function cleanArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter((item): item is T => Boolean(item) && typeof item === 'object') : [];
}

function parseClientStateSnapshot(value: unknown): ClientStateSnapshot {
  if (!value || typeof value !== 'object') {
    return {
      currentDrafts: [],
      currentSubscriptionDrafts: [],
      currentFriendLedgerDrafts: [],
      recentMessages: [],
    };
  }

  const state = value as Record<string, unknown>;
  return {
    currentDrafts: cleanArray<ParsedDraft>(state.currentDrafts).slice(0, 8),
    currentSubscriptionDrafts: cleanArray<ParsedSubscriptionDraft>(state.currentSubscriptionDrafts).slice(0, 5),
    currentFriendLedgerDrafts: cleanArray<ParsedFriendLedgerDraft>(state.currentFriendLedgerDrafts).slice(0, 5),
    recentMessages: cleanArray<{ role?: string; text?: string }>(state.recentMessages).slice(-6),
  };
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
    .replace(/\bmeeta\b/gi, 'Meta')
    .replace(/\bmeta adds\b/gi, 'Meta Ads')
    .replace(/\bgoogle adds\b/gi, 'Google Ads')
    .replace(/\bcreditcard\b/gi, 'credit card')
    .replace(/\bcred card\b/gi, 'credit card')
    .replace(/\bphonepe\b/gi, 'PhonePe')
    .replace(/\bgpay\b/gi, 'GPay')
    .replace(/\bpaytm\b/gi, 'Paytm')
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

function dateFromText(transcript: string, today: string) {
  const explicitDate = transcript.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (explicitDate) {
    const day = Number(explicitDate[1]);
    const month = Number(explicitDate[2]);
    const yearText = explicitDate[3];
    const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : Number(today.slice(0, 4));
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dayOnly = transcript.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) return `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  }

  if (/\byesterday\b/i.test(transcript)) {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() - 1);
    return format(date, 'yyyy-MM-dd');
  }

  return today;
}

function moneyAmountFromText(transcript: string) {
  const values = [...transcript.matchAll(/\b(?:rupees\s*)?(\d+(?:\.\d+)?)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return null;
  return Math.max(...values);
}

function cleanPersonName(value: string) {
  return value
    .replace(/\b(rupees|rs|inr|on|today|yesterday|tomorrow|me|my|money|for|the|a|an)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function answerLooksLikeOnlyName(transcript: string) {
  return /^[a-z][a-z\s.'-]{1,40}$/i.test(transcript.trim())
    && !/\b(spent|paid|got|received|borrowed|lent|gave|subscription|income|expense|split|delete|update|change|budget)\b/i.test(transcript);
}

function answerLooksLikeOnlyFrequency(transcript: string) {
  return /\b(weekly|every week|monthly|every month)\b/i.test(transcript)
    && !/\d/.test(transcript);
}

function applyPendingClarificationFallback({
  clientState,
  transcript,
  today,
}: {
  clientState: ClientStateSnapshot;
  transcript: string;
  today: string;
}) {
  const amount = moneyAmountFromText(transcript);
  const date = dateFromText(transcript, today);
  const nameAnswer = answerLooksLikeOnlyName(transcript) ? cleanPersonName(transcript) : '';
  const frequency: 'weekly' | 'monthly' | null = answerLooksLikeOnlyFrequency(transcript)
    ? /\b(weekly|every week)\b/i.test(transcript) ? 'weekly' : 'monthly'
    : null;

  if (clientState.currentFriendLedgerDrafts.length === 1) {
    const pending = clientState.currentFriendLedgerDrafts[0];
    const needsAmount = !pending.amount || pending.amount <= 0;
    const needsPerson = !pending.personId && !pending.personName;

    if ((needsAmount && amount) || (needsPerson && nameAnswer) || hasExplicitDateClue(transcript)) {
      return {
        reply: 'Filled that into the friend balance. Review and save.',
        drafts: [],
        subscriptionDrafts: [],
        friendLedgerDrafts: [{
          ...pending,
          amount: needsAmount && amount ? amount : pending.amount,
          personName: needsPerson && nameAnswer ? nameAnswer : pending.personName ?? null,
          occurredOn: hasExplicitDateClue(transcript) ? date : pending.occurredOn,
          confidence: Math.max(pending.confidence ?? 0.5, 0.82),
          questions: [],
        }],
      };
    }
  }

  if (clientState.currentSubscriptionDrafts.length === 1) {
    const pending = clientState.currentSubscriptionDrafts[0];
    const needsAmount = !pending.amount || pending.amount <= 0;
    const needsFrequency = !pending.frequency;

    if ((needsAmount && amount) || (needsFrequency && frequency) || hasExplicitDateClue(transcript)) {
      return {
        reply: 'Filled that into the subscription. Review and save.',
        drafts: [],
        subscriptionDrafts: [{
          ...pending,
          amount: needsAmount && amount ? amount : pending.amount,
          frequency: frequency ?? pending.frequency ?? 'monthly',
          nextDueOn: hasExplicitDateClue(transcript) ? date : pending.nextDueOn ?? today,
          billingDay: pending.billingDay ?? new Date(today).getDate(),
          confidence: Math.max(pending.confidence ?? 0.5, 0.82),
          questions: [],
        }],
        friendLedgerDrafts: [],
      };
    }
  }

  if (clientState.currentDrafts.length === 1) {
    const pending = clientState.currentDrafts[0];
    const needsAmount = !pending.amount || pending.amount <= 0;

    if ((needsAmount && amount) || hasExplicitDateClue(transcript)) {
      return {
        reply: 'Filled that into the draft. Review and save.',
        drafts: [{
          ...pending,
          amount: needsAmount && amount ? amount : pending.amount,
          occurredOn: hasExplicitDateClue(transcript) ? date : pending.occurredOn,
          confidence: Math.max(pending.confidence ?? 0.5, 0.82),
          questions: [],
        }],
        subscriptionDrafts: [],
        friendLedgerDrafts: [],
      };
    }
  }

  return null;
}

function friendLedgerFallbackDraft(rawTranscript: string, normalizedTranscript: string, today: string): ParsedFriendLedgerDraft | null {
  const lower = normalizedTranscript.toLowerCase();
  const amount = moneyAmountFromText(normalizedTranscript);
  if (!amount) return null;

  let direction: ParsedFriendLedgerDraft['direction'] | null = null;
  let name = '';

  const lentBeforeAmount = rawTranscript.match(/\b(?:gave|lent|paid)\s+(?:money\s+)?(?:to\s+)?([a-z][a-z\s]{1,40}?)(?:\s+(?:₹|rs\.?|inr|rupees)?\s*\d|\s+on\b|\s+for\b|$)/i);
  const lentAfterAmount = rawTranscript.match(/\b(?:gave|lent|paid)\s+(?:₹|rs\.?|inr|rupees)?\s*\d+(?:\.\d+)?\s+(?:to\s+)?([a-z][a-z\s]{1,40}?)(?:\s+on\b|\s+for\b|$)/i);
  if (/\b(gave|lent|paid)\b/.test(lower) && (lentBeforeAmount || lentAfterAmount)) {
    direction = 'lent';
    name = cleanPersonName((lentBeforeAmount ?? lentAfterAmount)?.[1] ?? '');
  }

  const borrowedFrom = rawTranscript.match(/\b(?:borrowed|took|got|received)\s+(?:money\s+)?(?:(?:₹|rs\.?|inr|rupees)?\s*\d+(?:\.\d+)?\s+)?from\s+([a-z][a-z\s]{1,40}?)(?:\s+on\b|\s+for\b|$)/i);
  if (!direction && /\b(borrowed|took|got|received)\b/.test(lower) && borrowedFrom) {
    direction = 'borrowed';
    name = cleanPersonName(borrowedFrom[1]);
  }

  const personGaveMe = rawTranscript.match(/\b([a-z][a-z\s]{1,40}?)\s+(?:gave|lent|paid)\s+me\s+(?:₹|rs\.?|inr|rupees)?\s*\d/i);
  if (!direction && personGaveMe) {
    direction = 'borrowed';
    name = cleanPersonName(personGaveMe[1]);
  }

  if (!direction || !name) return null;

  return {
    direction,
    amount,
    personId: null,
    personName: name,
    description: direction === 'lent' ? `Lent ${formatCurrency(amount)} to ${name}` : `Borrowed ${formatCurrency(amount)} from ${name}`,
    occurredOn: dateFromText(rawTranscript, today),
    confidence: 0.92,
    questions: [],
  };
}

function cheapReply(transcript: string) {
  const text = transcript.trim().toLowerCase();
  const hasMoneySignal = /\b(\d|rupees|rs|spent|paid|got|received|earned|borrowed|lent|gave|subscription|monthly|weekly|split|owe|udhaar|emi|income|expense)\b/.test(text);
  if (hasMoneySignal) return null;

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

function humanDraftReply({
  reply,
  draftsCount,
  subscriptionDraftsCount,
  friendLedgerDraftsCount,
}: {
  reply?: string;
  draftsCount: number;
  subscriptionDraftsCount: number;
  friendLedgerDraftsCount: number;
}) {
  const cleanReply = reply?.trim();
  const hasDrafts = draftsCount > 0 || subscriptionDraftsCount > 0 || friendLedgerDraftsCount > 0;
  const weakReply = !cleanReply || /^(got it|done|ok|okay|sure)[.!]*$/i.test(cleanReply);

  if (!weakReply) return cleanReply;

  const parts = [
    draftsCount ? `${draftsCount} entr${draftsCount === 1 ? 'y' : 'ies'}` : '',
    subscriptionDraftsCount ? `${subscriptionDraftsCount} subscription${subscriptionDraftsCount === 1 ? '' : 's'}` : '',
    friendLedgerDraftsCount ? `${friendLedgerDraftsCount} friend balance${friendLedgerDraftsCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean);

  if (hasDrafts) {
    if (friendLedgerDraftsCount > 0 && draftsCount === 0 && subscriptionDraftsCount === 0) {
      return `I made ${parts.join(', ')}. It will be saved in Splits. Review it, then save.`;
    }

    return `I made ${parts.join(', ')}. Review it, then save.`;
  }

  return cleanReply || 'I am here. Ask me anything, or tell me a money note to add.';
}

function fallbackQuestions(transcript: string) {
  const text = transcript.toLowerCase();
  const questions: string[] = [];

  if (!moneyAmountFromText(transcript) && /\b(spent|paid|got|received|borrowed|lent|gave|subscription|emi)\b/.test(text)) {
    questions.push('How much was it?');
  }
  if (/\b(split|borrowed|lent|gave|took money|udhaar)\b/.test(text) && !/\b(from|to|with)\s+[a-z]/i.test(transcript)) {
    questions.push('Who was the person?');
  }
  if (/\b(subscription|emi|recurring)\b/.test(text) && !/\b(monthly|weekly|every month|every week)\b/.test(text)) {
    questions.push('Is this monthly or weekly?');
  }

  return questions.slice(0, 2);
}

function categoryExistsForKind(
  categoryId: string | null | undefined,
  kind: ParsedDraft['kind'] | 'expense',
  categories: Awaited<ReturnType<typeof getCategories>>
) {
  if (!categoryId) return false;
  const expectedKind = kind === 'income' ? 'income' : 'expense';
  return categories.some((category) => category.id === categoryId && category.kind === expectedKind);
}

function resolveCategory(
  kind: ParsedDraft['kind'] | 'expense',
  text: string,
  categoryId: string | null | undefined,
  suggestedCategoryName: string | null | undefined,
  categories: Awaited<ReturnType<typeof getCategories>>,
  merchantRules: MerchantRule[] = []
) {
  const merchantMatch = matchMerchantRule(text, merchantRules);
  if (merchantMatch && categoryExistsForKind(merchantMatch.rule.category_id, kind, categories)) {
    return { categoryId: merchantMatch.rule.category_id, suggestedCategoryName: null };
  }
  const localMatch = inferCategoryMatch(kind, text, categories);
  const validAiCategoryId = categoryExistsForKind(categoryId, kind, categories) ? categoryId ?? null : null;

  if (localMatch && (!validAiCategoryId || localMatch.score >= 10)) {
    return {
      categoryId: localMatch.category.id,
      suggestedCategoryName: null,
    };
  }

  if (validAiCategoryId) {
    return {
      categoryId: validAiCategoryId,
      suggestedCategoryName: null,
    };
  }

  return {
    categoryId: null,
    suggestedCategoryName: suggestedCategoryName ?? suggestCategoryName(kind, text),
  };
}

function isValidActionKind(kind: unknown): kind is TransactionKind {
  return kind === 'expense' || kind === 'income' || kind === 'investment' || kind === 'transfer';
}

function safeIsoDate(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : value;
}

function clampConfidence(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.65;
  return Math.min(Math.max(value, 0), 1);
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

function normalizeActionPlans({
  plans,
  transactions,
  subscriptions,
  categories,
  today,
}: {
  plans: ParsedActionPlan[] | undefined;
  transactions: Awaited<ReturnType<typeof getTransactions>>;
  subscriptions: Awaited<ReturnType<typeof getSubscriptions>>;
  categories: Awaited<ReturnType<typeof getCategories>>;
  today: string;
}) {
  if (!Array.isArray(plans)) return [];

  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  const normalized = [];

  for (const plan of plans.slice(0, 5)) {
    if (!plan || typeof plan !== 'object') continue;

    if (plan.type === 'set_budget') {
      const monthlyBudget = plan.monthlyBudget === null
        ? null
        : typeof plan.monthlyBudget === 'number' && Number.isFinite(plan.monthlyBudget) && plan.monthlyBudget >= 0
          ? plan.monthlyBudget
          : null;

      normalized.push({
        type: 'set_budget' as const,
        title: plan.title?.trim() || 'Update monthly budget',
        summary: plan.summary?.trim() || (monthlyBudget === null ? 'Remove the monthly budget.' : `Set monthly budget to ${formatCurrency(monthlyBudget)}.`),
        monthlyBudget,
        confidence: clampConfidence(plan.confidence),
      });
      continue;
    }

    if (plan.type === 'delete_transaction') {
      const transaction = transactionById.get(plan.transactionId);
      if (!transaction) continue;

      normalized.push({
        type: 'delete_transaction' as const,
        title: plan.title?.trim() || 'Delete transaction',
        summary: plan.summary?.trim() || `Delete "${transaction.description}" for ${formatCurrency(transaction.amount)}.`,
        transactionId: transaction.id,
        confidence: clampConfidence(plan.confidence),
      });
      continue;
    }

    if (plan.type === 'update_transaction') {
      const transaction = transactionById.get(plan.transactionId);
      if (!transaction || transaction.is_split) continue;

      const kind = isValidActionKind(plan.kind) ? plan.kind : transaction.kind;
      const amount = typeof plan.amount === 'number' && Number.isFinite(plan.amount) && plan.amount > 0
        ? plan.amount
        : transaction.amount;
      const description = plan.description?.trim() || transaction.description;
      const source = kind === 'income' || kind === 'transfer'
        ? plan.source ?? transaction.source ?? null
        : null;
      const date = safeIsoDate(plan.occurredOn, transaction.occurred_on || today);
      const category = kind === 'transfer'
        ? { categoryId: null, suggestedCategoryName: null }
        : resolveCategory(
            kind === 'income' ? 'income' : 'expense',
            `${description} ${plan.suggestedCategoryName ?? ''}`,
            plan.categoryId ?? transaction.category_id,
            plan.suggestedCategoryName,
            categories
          );

      normalized.push({
        type: 'update_transaction' as const,
        title: plan.title?.trim() || 'Update transaction',
        summary: plan.summary?.trim() || `Change "${transaction.description}" to "${description}".`,
        transactionId: transaction.id,
        kind,
        groupId: plan.groupId ?? transaction.group_id ?? null,
        categoryId: category.categoryId,
        createCategoryName: category.suggestedCategoryName,
        amount,
        description,
        source,
        occurredOn: date,
        confidence: clampConfidence(plan.confidence),
      });
      continue;
    }

    if (plan.type === 'delete_subscription') {
      const subscription = subscriptionById.get(plan.subscriptionId);
      if (!subscription) continue;

      normalized.push({
        type: 'delete_subscription' as const,
        title: plan.title?.trim() || 'Delete subscription',
        summary: plan.summary?.trim() || `Delete ${subscription.name} from subscriptions.`,
        subscriptionId: subscription.id,
        confidence: clampConfidence(plan.confidence),
      });
      continue;
    }

    if (plan.type === 'update_subscription') {
      const subscription = subscriptionById.get(plan.subscriptionId);
      if (!subscription) continue;

      const amount = typeof plan.amount === 'number' && Number.isFinite(plan.amount) && plan.amount > 0
        ? plan.amount
        : subscription.amount;
      const billingDay = typeof plan.billingDay === 'number'
        ? Math.min(Math.max(Math.trunc(plan.billingDay), 1), 31)
        : subscription.billing_day;

      normalized.push({
        type: 'update_subscription' as const,
        title: plan.title?.trim() || 'Update subscription',
        summary: plan.summary?.trim() || `Update ${subscription.name}.`,
        subscriptionId: subscription.id,
        name: plan.name?.trim() || subscription.name,
        amount,
        billingDay,
        frequency: plan.frequency === 'weekly' ? 'weekly' : subscription.frequency,
        categoryId: plan.categoryId ?? subscription.category_id ?? null,
        groupId: plan.groupId ?? subscription.group_id ?? null,
        nextDueOn: safeIsoDate(plan.nextDueOn, subscription.next_due_on || today),
        active: typeof plan.active === 'boolean' ? plan.active : subscription.active,
        notes: plan.notes ?? subscription.notes ?? null,
        confidence: clampConfidence(plan.confidence),
      });
    }
  }

  return normalized;
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return jsonError('Please sign in again.', 401);

    const contentType = request.headers.get('content-type') ?? '';
    let transcript = '';
    let audio: File | null = null;
    let voiceDurationMs = 0;
    let clientState: unknown = null;

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const audioFile = form.get('audio');
      const typedNote = form.get('message');
      const duration = form.get('durationMs');

      if (audioFile instanceof File && audioFile.size > 0) {
        audio = audioFile;
        if (audio.size > 10 * 1024 * 1024) {
          return jsonError('Voice note is too large. Keep it under 10 MB.');
        }
      }

      if (typeof typedNote === 'string') {
        transcript = typedNote;
      }
      if (typeof duration === 'string') {
        voiceDurationMs = Math.max(0, Number(duration) || 0);
      }
      const currentState = form.get('clientState');
      if (typeof currentState === 'string') {
        try {
          clientState = JSON.parse(currentState);
        } catch {
          clientState = null;
        }
      }
    } else {
      const body = await request.json().catch(() => null);
      transcript = typeof body?.message === 'string' ? body.message : '';
      clientState = body?.clientState ?? null;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey && audio) {
      return jsonError('AI voice is not configured. Add OPENAI_API_KEY in Vercel, then redeploy.', 503);
    }

    const openai = apiKey ? new OpenAI({ apiKey }) : null;
    const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe';

    if (audio && openai) {
      const transcription = await openai.audio.transcriptions.create({
        file: audio,
        model: transcribeModel,
        prompt: [
          'Indian English and Hinglish expense tracker voice note.',
          'Correct obvious speech recognition mistakes into clean readable money notes.',
          'Examples: cigger/cigg/sutta means cigarette or smoke, montly means monthly, udhar/udhaar means borrowed/lent money.',
          'Common words: rupees, chai, sutta, smoke, cigarette, petrol, cab, Uber, Ola, Swiggy, Zomato, Blinkit, Meta Ads, Google Ads, PhonePe, GPay, Paytm.',
          'Money actions: spent, paid, got, received, borrowed, lent, udhaar, split, subscription, monthly, EMI.',
          'Preserve names of friends, vendors, apps, and amounts.',
          'Prefer clean grammar, but do not invent missing amounts or people.',
        ].join(' '),
      });
      transcript = transcription.text || transcript;
    }

    transcript = transcript.trim();
    if (!transcript) return jsonError('Say or type what happened first.');
    const correctedTranscript = audio ? cleanVoiceTranscript(transcript) : transcript;
    const normalizedTranscript = normalizeTranscript(correctedTranscript);
    const today = format(new Date(), 'yyyy-MM-dd');
    const clientStateSnapshot = parseClientStateSnapshot(clientState);

    const deterministicFriendDraft = friendLedgerFallbackDraft(correctedTranscript, normalizedTranscript, today);
    if (deterministicFriendDraft && !apiKey) {
      return Response.json({
        transcript,
        correctedTranscript,
        normalizedTranscript,
        reply: 'I made 1 friend balance. It will be saved in Splits. Review it, then save.',
        drafts: [],
        subscriptionDrafts: [],
        friendLedgerDrafts: [deterministicFriendDraft],
        actionPlans: [],
        questions: [],
        usage: null,
      });
    }

    const pendingClarification = applyPendingClarificationFallback({
      clientState: clientStateSnapshot,
      transcript: normalizedTranscript,
      today,
    });
    if (pendingClarification) {
      return Response.json({
        transcript,
        correctedTranscript,
        normalizedTranscript,
        actionPlans: [],
        questions: [],
        usage: null,
        ...pendingClarification,
      });
    }

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
        actionPlans: [],
        questions: [],
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
        actionPlans: [],
        questions: [],
      });
    }

    if (!apiKey || !openai) {
      if (deterministicFriendDraft) {
        return Response.json({
          transcript,
          correctedTranscript,
          normalizedTranscript,
          reply: 'I made 1 friend balance. It will be saved in Splits. Review it, then save.',
          drafts: [],
          subscriptionDrafts: [],
          friendLedgerDrafts: [deterministicFriendDraft],
          actionPlans: [],
          questions: [],
          usage: null,
        });
      }

      return jsonError('AI is not configured. Add OPENAI_API_KEY in Vercel, then redeploy.', 503);
    }

    const [categories, directory, groups, transactions, subscriptions, splitShares, merchantRules] = await Promise.all([
      getCategories(),
      getDirectory(),
      getGroups(),
      getTransactions(35),
      getSubscriptions(),
      getSplitShares(),
      getMerchantRules(),
    ]);
    const localMerchantMatch = matchMerchantRule(normalizedTranscript, merchantRules);
    const balances = computeBalances(splitShares, profile.id).slice(0, 8);
    const findDirectoryPerson = (personId?: string | null, personName?: string | null) => {
      const friendDirectory = directory.filter((person) => person.id !== profile.id);
      if (personId && friendDirectory.some((person) => person.id === personId)) return personId;
      const lookup = normalizePersonLookup(personName ?? '');
      if (!lookup) return null;

      const exact = friendDirectory.find((person) => normalizePersonLookup(person.full_name) === lookup);
      if (exact) return exact.id;

      const lookupParts = lookup.split(' ').filter(Boolean);
      const partial = friendDirectory.find((person) => {
        const name = normalizePersonLookup(person.full_name);
        return lookupParts.some((part) => name.split(' ').includes(part));
      });
      return partial?.id ?? null;
    };

    const context = {
      today,
      productModel: {
        app: 'C-137 Capital',
        purpose: 'A lazy-first personal money tracker with expenses, income, investments, subscriptions, split balances, and permissioned AI edits.',
        ledgerRules: [
          'Expense means money spent with a shop, vendor, app, bill, or personal purchase.',
          'Income means money earned, refunded, gifted, salary, client payment, or money received that increases cash and is not a loan.',
          'Investment means money moved into savings, stocks, crypto, mutual funds, SIP, FD, or long-term assets.',
          'Transfer/friend balance means borrowed money, lent money, someone owes me, I owe someone, or friend settlement. It belongs in Splits, not income or expense.',
          'Subscription means recurring bill such as Netflix, Spotify, gym, rent, EMI, software, cloud, app, every week, or every month.',
          'AI can prepare drafts and propose permission cards, but the user confirms by saving or applying.',
        ],
      },
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
      localMerchantRule: localMerchantMatch ? {
        categoryId: localMerchantMatch.rule.category_id,
        pattern: localMerchantMatch.rule.merchant_pattern,
        confidence: localMerchantMatch.score,
      } : null,
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
      currentSettings: {
        monthlyBudget: profile.monthly_budget,
      },
      recentTransactions: transactions.slice(0, 25).map((transaction) => ({
        id: transaction.id,
        kind: transaction.kind,
        amount: transaction.amount,
        description: transaction.description,
        source: transaction.source,
        occurredOn: transaction.occurred_on,
        categoryId: transaction.category_id,
        categoryName: transaction.category?.name ?? null,
        isSplit: transaction.is_split,
      })),
      subscriptions: subscriptions.slice(0, 25).map((subscription) => ({
        id: subscription.id,
        name: subscription.name,
        amount: subscription.amount,
        billingDay: subscription.billing_day,
        frequency: subscription.frequency,
        nextDueOn: subscription.next_due_on,
        active: subscription.active,
        categoryId: subscription.category_id,
        categoryName: subscription.category?.name ?? null,
        notes: subscription.notes,
      })),
      splitBalances: balances.map((balance) => ({
        personId: balance.userId,
        name: balance.fullName,
        theyOweYou: balance.theyOweYou,
        youOweThem: balance.youOweThem,
        net: balance.net,
      })),
    };

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_PARSE_MODEL ?? 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 1100,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You convert casual Indian English or Hinglish money notes into transaction drafts for an expense tracker.',
            'You are the money copilot for C-137 Capital. Think like a careful human assistant who understands Indian daily money talk.',
            'Correct obvious speech-to-text mistakes silently before drafting.',
            'Prefer the normalized transcript, but use the raw transcript if it preserves names or meaning better.',
            'Return only valid JSON. Never save automatically.',
            'You may propose changes to existing app data in actionPlans, but the user must approve before anything changes.',
            'Act like a concise friendly chat assistant. Reply normally if the user is chatting, greeting, or asking non-entry questions, but be useful and specific.',
            'Do not force a transaction draft if there is no clear money event.',
            'Keep reply under 22 words.',
            'Your job is not to say "got it". Your job is to infer the correct ledger bucket, make the best draft, and ask only the one missing detail if blocked.',
            'Use IDs from the provided context whenever you can match a category, friend, or group.',
            'Read context.productModel. Follow those ledger rules over casual wording.',
            'For edits/deletes/budget changes, use actionPlans with exact IDs from context.recentTransactions or context.subscriptions.',
            'Never invent IDs. If the target is unclear, ask a short question instead of making an actionPlan.',
            'If the user asks to delete, remove, fix, change, rename, recategorize, edit, update, pause, activate, deactivate, or set budget, prefer actionPlans.',
            'Do not create actionPlans for split transactions unless deleting the whole transaction; split editing is handled separately.',
            'For dates, return YYYY-MM-DD. Resolve today/yesterday using context.today.',
            'For equal splits, peopleIds should include only other people, not the current user.',
            'For custom splits, customAmounts are amounts owed by each other person.',
            'If the user mentions multiple unrelated money events, return multiple drafts.',
            'One long voice note can contain many entries. Split every clear expense, income, investment, and subscription into its own draft.',
            'Use commas, "and", "also", "then", pauses, or sentence breaks as hints for separate drafts.',
            'Example: "spent 100 chai and 250 cab and got 5000 from dad" means two expense drafts and one income draft.',
            'If user says "I gave Rahul 2k", "Rahul owes me 2k", "lent Rahul 2k", or "paid for Rahul", make friendLedgerDrafts direction lent.',
            'If user says "Rahul gave me 2k", "I took from Rahul", "borrowed from Rahul", or "I owe Rahul", make friendLedgerDrafts direction borrowed.',
            'If user says "received from Rahul for previous split" and it settles money, do not make income; propose a split/balance response or ask which balance to settle.',
            'Friend money is not vendor spend. If user says borrowed/took money from a friend, return friendLedgerDrafts direction borrowed.',
            'If user says lent/gave/paid for a friend and they should return it, return friendLedgerDrafts direction lent.',
            'Phrases like "took money from Rahul", "take money from Rahul", "borrowed from Rahul" mean borrowed.',
            'Use friendLedgerDrafts only when a friend/person is involved in lending or borrowing, not for shops, vendors, salary, or refunds.',
            'For vendor/shop payments, return normal expense drafts and keep the vendor or merchant name in description for history search.',
            'Do not ask category if you can infer it. Use existing category IDs first, then suggestedCategoryName if no existing category fits.',
            'If no category ID matches well, suggest a short category name in suggestedCategoryName.',
            'If the user mentions subscriptions, recurring payments, renewals, EMI, rent, membership, every week, or every month, return subscriptionDrafts.',
            'Words like "Netflix subscription", "Spotify subscription", "Prime subscription", "ChatGPT subscription", or "iCloud subscription" are subscriptionDrafts even if the user does not say monthly.',
            'Do not also create a normal expense draft for a subscription unless the user clearly says it was paid today.',
            'For subscription frequency, use weekly for every week/weekly and monthly for every month/monthly. Default to monthly.',
            'For subscription billingDay, infer day of month if mentioned, otherwise use today day.',
            'Default date to context.today when no date is said. Do not ask date unless the user implies a past/future event without enough date detail.',
            'If amount or person is missing, ask one short question in top-level questions. Do not ask unnecessary questions.',
            'If the user is clarifying a previous draft, reply as a clarification and return the corrected draft shape.',
            'Use clientState.currentDrafts, currentSubscriptionDrafts, and currentFriendLedgerDrafts when the user says words like this, that, change, make it, correct it, or actually.',
            'If the user answers a previous question with only a name, amount, date, or frequency, update the pending draft from clientState instead of starting a new unrelated draft.',
            'If user asks about balances, outstanding amounts, what people owe, subscriptions, category spend, or recent entries, answer from context instead of making drafts.',
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
            clientState: clientStateSnapshot,
            outputShape: {
              reply: 'short friendly assistant reply',
              questions: ['1-2 short follow-up questions if details are missing'],
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
              actionPlans: [
                {
                  type: 'set_budget | delete_transaction | update_transaction | delete_subscription | update_subscription',
                  title: 'short permission title',
                  summary: 'what will change if user approves',
                  monthlyBudget: 'number or null, only for set_budget',
                  transactionId: 'existing transaction id for transaction actions',
                  subscriptionId: 'existing subscription id for subscription actions',
                  kind: 'expense | income | investment | transfer, only for update_transaction',
                  amount: 'number, for update actions',
                  description: 'string, for update_transaction',
                  source: 'string or null, for update_transaction',
                  occurredOn: 'YYYY-MM-DD, for update_transaction',
                  categoryId: 'matching category id or null',
                  suggestedCategoryName: 'new category name when no category fits',
                  name: 'subscription name for update_subscription',
                  billingDay: '1 to 31 for update_subscription',
                  frequency: 'weekly | monthly for update_subscription',
                  nextDueOn: 'YYYY-MM-DD for update_subscription',
                  active: 'boolean for update_subscription',
                  notes: 'string or null for update_subscription',
                  confidence: '0 to 1',
                },
              ],
            },
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return jsonError('AI did not return a draft.', 502);
    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const estimatedTokenCostUsd = completion.usage
      ? estimateTokenCostUsd(completion.model, promptTokens, completionTokens)
      : null;
    const estimatedTranscriptionCostUsd = audio
      ? estimateTranscriptionCostUsd(transcribeModel, voiceDurationMs)
      : null;
    const estimatedTotalCostUsd = [estimatedTokenCostUsd, estimatedTranscriptionCostUsd]
      .filter((cost): cost is number => typeof cost === 'number')
      .reduce((sum, cost) => sum + cost, 0);
    const pricingNote = MODEL_PRICING_USD_PER_1M[completion.model]?.note ?? null;

    const parsed = extractJson(content) as {
      reply?: string;
      questions?: string[];
      drafts?: ParsedDraft[];
      subscriptionDrafts?: ParsedSubscriptionDraft[];
      friendLedgerDrafts?: ParsedFriendLedgerDraft[];
      actionPlans?: ParsedActionPlan[];
    };
    const rawDrafts = parsed.drafts ?? [];
    const friendLedgerFallbacks = rawDrafts
      .filter((draft) => looksLikeFriendMoneyDraft(draft))
      .map((draft) => {
        const text = `${draft.description ?? ''} ${draft.source ?? ''}`;
        const fallback = friendLedgerFallbackDraft(text, normalizeTranscript(text), today);
        if (!fallback) return null;

        return {
          ...fallback,
          amount: fallback.amount ?? (typeof draft.amount === 'number' ? draft.amount : null),
          occurredOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
          confidence: Math.max(fallback.confidence, typeof draft.confidence === 'number' ? draft.confidence : 0),
        };
      })
      .filter((draft): draft is ParsedFriendLedgerDraft => Boolean(draft));
    const subscriptionFallbacks = rawDrafts
      .filter((draft) => !looksLikeFriendMoneyDraft(draft) && looksLikeSubscriptionDraft(draft))
      .map((draft) => {
        const category = resolveCategory(
          'expense',
          `${draft.description ?? ''} ${draft.source ?? ''} ${draft.suggestedCategoryName ?? ''}`,
          draft.categoryId,
          draft.suggestedCategoryName,
          categories,
          merchantRules
        );

        return {
        name: subscriptionNameFromDraft(draft),
        amount: typeof draft.amount === 'number' ? draft.amount : null,
        billingDay: new Date(today).getDate(),
        frequency: 'monthly' as const,
        nextDueOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
        categoryId: category.categoryId,
        groupId: draft.groupId ?? null,
        notes: draft.description ?? null,
        confidence: typeof draft.confidence === 'number' ? Math.min(draft.confidence, 0.85) : 0.75,
        questions: draft.questions ?? [],
        };
      });
    const drafts = rawDrafts
      .filter((draft) => !looksLikeFriendMoneyDraft(draft))
      .filter((draft) => !looksLikeSubscriptionDraft(draft))
      .map((draft) => {
        const kind = normalizeDraftKind(draft.kind);
        const category = resolveCategory(
          kind,
          `${draft.description ?? ''} ${draft.source ?? ''} ${draft.suggestedCategoryName ?? ''}`,
          draft.categoryId,
          draft.suggestedCategoryName,
          categories,
          merchantRules
        );

        return {
          kind,
          amount: typeof draft.amount === 'number' ? draft.amount : null,
          description: draft.description ?? '',
          source: draft.source ?? null,
          occurredOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
          categoryId: category.categoryId,
          suggestedCategoryName: category.suggestedCategoryName,
          groupId: draft.groupId ?? null,
          split: draft.split ?? { enabled: false, mode: 'equal', peopleIds: [] },
          confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
          questions: draft.questions ?? [],
        };
      });
    const friendLedgerDrafts = [...(parsed.friendLedgerDrafts ?? []), ...friendLedgerFallbacks].map((draft) => ({
      direction: draft.direction === 'lent' ? 'lent' : 'borrowed',
      amount: typeof draft.amount === 'number' ? draft.amount : null,
      personId: findDirectoryPerson(draft.personId, draft.personName),
      personName: draft.personName ?? null,
      description: draft.description ?? '',
      occurredOn: normalizeDraftDate(draft.occurredOn, today, normalizedTranscript),
      confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
      questions: draft.questions ?? [],
    }));
    const subscriptionDrafts = [
      ...(parsed.subscriptionDrafts ?? []).map((draft) => {
        const category = resolveCategory(
          'expense',
          `${draft.name ?? ''} ${draft.notes ?? ''}`,
          draft.categoryId,
          null,
          categories,
          merchantRules
        );

        return {
          name: draft.name ?? '',
          amount: typeof draft.amount === 'number' ? draft.amount : null,
          billingDay: typeof draft.billingDay === 'number' ? Math.min(Math.max(Math.trunc(draft.billingDay), 1), 31) : new Date(today).getDate(),
          frequency: draft.frequency === 'weekly' ? 'weekly' : 'monthly',
          nextDueOn: draft.nextDueOn || today,
          categoryId: category.categoryId,
          groupId: draft.groupId ?? null,
          notes: draft.notes ?? null,
          confidence: typeof draft.confidence === 'number' ? draft.confidence : 0.5,
          questions: draft.questions ?? [],
        };
      }),
      ...subscriptionFallbacks,
    ];
    const actionPlans = normalizeActionPlans({
      plans: parsed.actionPlans,
      transactions,
      subscriptions,
      categories,
      today,
    });
    const reply = humanDraftReply({
      reply: parsed.reply,
      draftsCount: drafts.length,
      subscriptionDraftsCount: subscriptionDrafts.length,
      friendLedgerDraftsCount: friendLedgerDrafts.length,
    });
    const questions = [
      ...(Array.isArray(parsed.questions) ? parsed.questions : []),
      ...drafts.flatMap((draft) => draft.questions ?? []),
      ...subscriptionDrafts.flatMap((draft) => draft.questions ?? []),
      ...friendLedgerDrafts.flatMap((draft) => draft.questions ?? []),
      ...(drafts.length === 0 && subscriptionDrafts.length === 0 && friendLedgerDrafts.length === 0 && actionPlans.length === 0 ? fallbackQuestions(normalizedTranscript) : []),
    ]
      .map((question) => question.trim())
      .filter(Boolean)
      .filter((question, index, all) => all.indexOf(question) === index)
      .slice(0, 3);
    const responseReply = questions.length > 0 && drafts.length === 0 && subscriptionDrafts.length === 0 && friendLedgerDrafts.length === 0 && actionPlans.length === 0
      ? 'I need one detail before I can make the draft.'
      : actionPlans.length > 0 && drafts.length === 0 && subscriptionDrafts.length === 0 && friendLedgerDrafts.length === 0
        ? `I found ${actionPlans.length} change${actionPlans.length === 1 ? '' : 's'}. Review and apply.`
      : reply;

    return Response.json({
      transcript,
      correctedTranscript,
      normalizedTranscript,
      reply: responseReply,
      usage: completion.usage ? {
        model: completion.model,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
        estimatedCostUsd: estimatedTokenCostUsd,
        estimatedTranscriptionCostUsd,
        estimatedTotalCostUsd: estimatedTotalCostUsd > 0 ? estimatedTotalCostUsd : estimatedTokenCostUsd ?? estimatedTranscriptionCostUsd,
        pricingNote,
      } : null,
      drafts,
      subscriptionDrafts,
      friendLedgerDrafts,
      actionPlans,
      questions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI request failed.';
    return jsonError(message, 500);
  }
}
