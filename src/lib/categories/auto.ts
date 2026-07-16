import { Category, TransactionKind } from '@/lib/types';

const CATEGORY_RULES: Array<{
  kind: 'expense' | 'income';
  match: string[];
  category: string[];
  suggest?: string;
}> = [
  {
    kind: 'expense',
    match: ['food', 'dinner', 'lunch', 'breakfast', 'biryani', 'pizza', 'burger', 'cake', 'chai', 'coffee', 'zomato', 'swiggy', 'restaurant', 'cafe', 'snack', 'snacks', 'momos', 'roll', 'thali', 'dominos', 'kfc', 'mcdonald', 'starbucks'],
    category: ['food', 'dining'],
    suggest: 'Food & Dining',
  },
  {
    kind: 'expense',
    match: ['cab', 'uber', 'ola', 'rapido', 'auto', 'rickshaw', 'metro', 'train', 'bus', 'flight', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'travel', 'commute', 'bike', 'scooter'],
    category: ['travel'],
    suggest: 'Travel',
  },
  {
    kind: 'expense',
    match: ['rent', 'electricity', 'wifi', 'internet', 'broadband', 'water', 'utility', 'utilities', 'gas', 'maintenance', 'emi', 'loan', 'credit card', 'card bill', 'phone bill', 'mobile recharge', 'recharge', 'house'],
    category: ['rent', 'utilities'],
    suggest: 'Rent & Utilities',
  },
  {
    kind: 'expense',
    match: ['netflix', 'movie', 'movies', 'spotify', 'prime', 'hotstar', 'jio cinema', 'youtube premium', 'game', 'gaming', 'party', 'club', 'entertainment', 'concert', 'show'],
    category: ['entertainment'],
    suggest: 'Entertainment',
  },
  {
    kind: 'expense',
    match: ['medicine', 'doctor', 'hospital', 'health', 'gym', 'pharmacy', 'chemist', 'clinic', 'therapy', 'dentist', 'protein', 'supplement', 'cult fit', 'cultfit'],
    category: ['health'],
    suggest: 'Health',
  },
  {
    kind: 'expense',
    match: ['shopping', 'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'clothes', 'shoes', 'shirt', 'jeans', 'watch', 'blinkit', 'zepto', 'instamart', 'dmart', 'grocery', 'groceries', 'vegetables', 'milk'],
    category: ['shopping'],
    suggest: 'Shopping',
  },
  {
    kind: 'expense',
    match: ['software', 'tool', 'tools', 'domain', 'hosting', 'server', 'subscription', 'app', 'apps', 'saas', 'chatgpt', 'openai', 'claude', 'notion', 'figma', 'canva', 'icloud', 'google one', 'vercel', 'supabase', 'cursor', 'github'],
    category: ['software', 'tools'],
    suggest: 'Software & Tools',
  },
  {
    kind: 'expense',
    match: ['meta ads', 'facebook ads', 'instagram ads', 'google ads', 'ad spend', 'ads', 'advertising', 'marketing', 'campaign', 'lead generation', 'boost', 'promotion', 'promoted'],
    category: ['advertising', 'marketing'],
    suggest: 'Advertising',
  },
  {
    kind: 'expense',
    match: ['cigarette', 'cigarettes', 'smoke', 'smoking', 'sutta', 'tobacco', 'vape'],
    category: ['cigarette', 'smoke', 'smoking', 'tobacco'],
    suggest: 'Cigarettes',
  },
  {
    kind: 'expense',
    match: ['upi charge', 'bank charge', 'fee', 'fees', 'late fee', 'penalty', 'interest', 'atm', 'withdrawal charge'],
    category: ['fees', 'bank', 'charges'],
    suggest: 'Fees & Charges',
  },
  {
    kind: 'income',
    match: ['salary', 'paycheck', 'income', 'paid me', 'got', 'received', 'dad', 'mom', 'refund', 'cashback', 'bonus', 'allowance', 'interest received'],
    category: ['income', 'other'],
    suggest: 'Other Income',
  },
  {
    kind: 'income',
    match: ['project', 'client', 'freelance', 'work', 'invoice', 'payment', 'consulting', 'advance', 'retainer'],
    category: ['project', 'consulting'],
    suggest: 'Project Income',
  },
  {
    kind: 'income',
    match: ['retainer'],
    category: ['retainer'],
    suggest: 'Retainer',
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();
}

function categoryKindFor(kind: TransactionKind) {
  if (kind === 'transfer') return null;
  return kind === 'income' ? 'income' : 'expense';
}

export function inferCategory(
  kind: TransactionKind,
  text: string,
  categories: Category[]
) {
  return inferCategoryMatch(kind, text, categories)?.category ?? null;
}

export function inferCategoryMatch(
  kind: TransactionKind,
  text: string,
  categories: Category[]
) {
  const categoryKind = categoryKindFor(kind);
  if (!categoryKind) return null;
  const normalizedText = normalize(text);
  const relevantCategories = categories.filter((category) => category.kind === categoryKind);

  const exactNameMatch = relevantCategories.find((category) => normalize(category.name) === normalizedText);
  if (exactNameMatch) return { category: exactNameMatch, score: 100 };

  const directMatch = relevantCategories
    .map((category) => {
      const normalizedName = normalize(category.name);
      const words = normalizedName.split(/\s+/).filter((word) => word.length > 2 && word !== 'other');
      const score = words.reduce((sum, word) => sum + (normalizedText.includes(word) ? 8 : 0), 0);
      return { category, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  if (directMatch && directMatch.score >= 8) return directMatch;

  const rule = CATEGORY_RULES.find((item) =>
    item.kind === categoryKind && item.match.some((keyword) => normalizedText.includes(keyword))
  );
  if (!rule) return null;

  const ruleMatch = relevantCategories.find((category) => {
    const normalizedName = normalize(category.name);
    return rule.category.some((keyword) => normalizedName.includes(keyword));
  });

  return ruleMatch ? { category: ruleMatch, score: 10 } : null;
}

export function suggestCategoryName(kind: TransactionKind, text: string) {
  const categoryKind = categoryKindFor(kind);
  if (!categoryKind) return null;
  const normalizedText = normalize(text);
  const rule = CATEGORY_RULES.find((item) =>
    item.kind === categoryKind && item.match.some((keyword) => normalizedText.includes(keyword))
  );

  return rule?.suggest ?? null;
}
