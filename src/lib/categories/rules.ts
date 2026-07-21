import type { MerchantRule } from '@/lib/types';

export function normalizeMerchantText(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(?:rs|inr|paid|payment|spent|expense|at|to|for)\b/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function matchScore(text: string, pattern: string) {
  if (!text || !pattern) return 0;
  if (text === pattern) return 1;
  if (pattern.length >= 3 && (` ${text} `).includes(` ${pattern} `)) return 0.96;
  const textTokens = new Set(text.split(' '));
  const patternTokens = pattern.split(' ');
  const tokenOverlap = patternTokens.filter((token) => textTokens.has(token)).length / patternTokens.length;
  const similarity = 1 - editDistance(text, pattern) / Math.max(text.length, pattern.length);
  return Math.max(tokenOverlap * 0.9, similarity);
}

export function matchMerchantRule(text: string, rules: MerchantRule[]) {
  const normalized = normalizeMerchantText(text);
  if (normalized.length < 2) return null;

  return rules
    .map((rule) => ({ rule, score: matchScore(normalized, normalizeMerchantText(rule.merchant_pattern)) }))
    .filter((candidate) => candidate.score >= 0.72)
    .sort((a, b) => b.score - a.score || b.rule.usage_count - a.rule.usage_count || Date.parse(b.rule.last_used_at) - Date.parse(a.rule.last_used_at))[0] ?? null;
}

export function merchantPatternFromText(text: string) {
  return normalizeMerchantText(text).slice(0, 80);
}
