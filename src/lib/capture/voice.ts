import type { MerchantRule } from '@/lib/types';
import { matchMerchantRule, normalizeMerchantText } from '@/lib/categories/rules';

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000,
};

function wordsToAmount(text: string) {
  const words = text.toLowerCase().split(/\s+/);
  let total = 0;
  let current = 0;
  let found = false;
  for (const word of words) {
    const value = NUMBER_WORDS[word];
    if (!value) continue;
    found = true;
    if (value === 100) current = Math.max(current, 1) * value;
    else if (value === 1000) { total += Math.max(current, 1) * value; current = 0; }
    else current += value;
  }
  return found ? total + current : null;
}

export function parseVoiceTranscript(text: string, rules: MerchantRule[]) {
  const numeric = text.match(/(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\b/i);
  const amount = numeric ? Number(numeric[1].replace(/,/g, '')) : wordsToAmount(text);
  const ruleMatch = matchMerchantRule(text, rules);
  const description = normalizeMerchantText(text)
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || text.trim();

  return {
    amount: amount && Number.isFinite(amount) && amount > 0 ? amount : null,
    categoryId: ruleMatch?.rule.category_id ?? null,
    description,
    confidence: amount && ruleMatch ? Math.min(1, 0.88 + ruleMatch.score * 0.1) : amount ? 0.65 : ruleMatch ? 0.55 : 0.25,
    ruleMatch,
    resolvedLocally: Boolean(amount && ruleMatch),
  };
}
