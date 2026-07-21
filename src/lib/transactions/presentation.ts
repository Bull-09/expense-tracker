import type { Transaction } from '@/lib/types';

const KIND_LABELS = {
  expense: 'Expense',
  income: 'Income',
  investment: 'Investment',
  transfer: 'Transfer',
} as const;

export function transactionTitle(transaction: Transaction) {
  const description = transaction.description?.trim() || KIND_LABELS[transaction.kind];
  const source = transaction.source?.trim();
  if (transaction.kind !== 'transfer' || !source) return description;

  const person = source.replace(/^(to|from)\s+/i, '').trim();
  if (!person || description.toLocaleLowerCase().includes(person.toLocaleLowerCase())) return description;
  const direction = /^from\s+/i.test(source) ? 'from' : /^to\s+/i.test(source) ? 'to' : 'with';
  return `${description} ${direction} ${person}`;
}

export function transactionTypeLabel(transaction: Transaction) {
  if (transaction.is_split) return transaction.kind === 'transfer' ? 'Split · Transfer' : `Split · ${KIND_LABELS[transaction.kind]}`;
  if (transaction.kind === 'transfer') return 'Transfer';
  return `${transaction.category?.name ?? 'Uncategorized'} · ${KIND_LABELS[transaction.kind]}`;
}
