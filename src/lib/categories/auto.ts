import { Category, TransactionKind } from '@/lib/types';

const CATEGORY_RULES: Array<{
  kind: 'expense' | 'income';
  match: string[];
  category: string[];
}> = [
  {
    kind: 'expense',
    match: ['food', 'dinner', 'lunch', 'breakfast', 'chai', 'coffee', 'zomato', 'swiggy', 'restaurant', 'cafe'],
    category: ['food', 'dining'],
  },
  {
    kind: 'expense',
    match: ['cab', 'uber', 'ola', 'auto', 'metro', 'train', 'bus', 'flight', 'petrol', 'fuel', 'travel'],
    category: ['travel'],
  },
  {
    kind: 'expense',
    match: ['rent', 'electricity', 'wifi', 'internet', 'water', 'utility', 'utilities', 'gas'],
    category: ['rent', 'utilities'],
  },
  {
    kind: 'expense',
    match: ['netflix', 'movie', 'movies', 'spotify', 'party', 'club', 'game', 'entertainment'],
    category: ['entertainment'],
  },
  {
    kind: 'expense',
    match: ['medicine', 'doctor', 'hospital', 'health', 'gym', 'pharmacy'],
    category: ['health'],
  },
  {
    kind: 'expense',
    match: ['shopping', 'amazon', 'flipkart', 'myntra', 'clothes', 'shoes'],
    category: ['shopping'],
  },
  {
    kind: 'expense',
    match: ['software', 'tool', 'domain', 'hosting', 'subscription', 'app'],
    category: ['software', 'tools'],
  },
  {
    kind: 'income',
    match: ['salary', 'paycheck', 'income', 'paid me', 'got', 'received', 'dad', 'mom', 'refund'],
    category: ['income', 'other'],
  },
  {
    kind: 'income',
    match: ['project', 'client', 'freelance', 'work'],
    category: ['project', 'consulting'],
  },
  {
    kind: 'income',
    match: ['retainer'],
    category: ['retainer'],
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s&]/g, ' ');
}

function categoryKindFor(kind: TransactionKind) {
  return kind === 'income' ? 'income' : 'expense';
}

export function inferCategory(
  kind: TransactionKind,
  text: string,
  categories: Category[]
) {
  const categoryKind = categoryKindFor(kind);
  const normalizedText = normalize(text);
  const relevantCategories = categories.filter((category) => category.kind === categoryKind);

  const directMatch = relevantCategories.find((category) => {
    const normalizedName = normalize(category.name);
    return normalizedName.split(/\s+/).some((word) => word.length > 2 && normalizedText.includes(word));
  });
  if (directMatch) return directMatch;

  const rule = CATEGORY_RULES.find((item) =>
    item.kind === categoryKind && item.match.some((keyword) => normalizedText.includes(keyword))
  );
  if (!rule) return null;

  return relevantCategories.find((category) => {
    const normalizedName = normalize(category.name);
    return rule.category.some((keyword) => normalizedName.includes(keyword));
  }) ?? null;
}
