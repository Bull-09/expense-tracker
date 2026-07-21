'use client';

import { useEffect, useMemo, useState } from 'react';
import { Transaction } from '@/lib/types';

const OPTIMISTIC_EVENT = 'c137:transaction-optimistic';
const CONFIRMED_EVENT = 'c137:transaction-confirmed';
const ROLLBACK_EVENT = 'c137:transaction-rollback';

export function publishOptimisticTransaction(transaction: Transaction) {
  window.dispatchEvent(new CustomEvent<Transaction>(OPTIMISTIC_EVENT, { detail: transaction }));
}

export function confirmOptimisticTransaction(temporaryId: string, transaction: Transaction) {
  window.dispatchEvent(new CustomEvent(CONFIRMED_EVENT, { detail: { temporaryId, transaction } }));
}

export function rollbackOptimisticTransaction(temporaryId: string) {
  window.dispatchEvent(new CustomEvent<string>(ROLLBACK_EVENT, { detail: temporaryId }));
}

export function removeOptimisticTransaction(id: string) {
  rollbackOptimisticTransaction(id);
}

export function useOptimisticTransactions(transactions: Transaction[]) {
  const [pending, setPending] = useState<Transaction[]>([]);

  useEffect(() => {
    function add(event: Event) {
      const transaction = (event as CustomEvent<Transaction>).detail;
      setPending((current) => [transaction, ...current.filter((item) => item.id !== transaction.id)]);
    }

    function confirm(event: Event) {
      const { temporaryId, transaction } = (event as CustomEvent<{ temporaryId: string; transaction: Transaction }>).detail;
      setPending((current) => [transaction, ...current.filter((item) => item.id !== temporaryId && item.id !== transaction.id)]);
    }

    function rollback(event: Event) {
      const temporaryId = (event as CustomEvent<string>).detail;
      setPending((current) => current.filter((item) => item.id !== temporaryId));
    }

    window.addEventListener(OPTIMISTIC_EVENT, add);
    window.addEventListener(CONFIRMED_EVENT, confirm);
    window.addEventListener(ROLLBACK_EVENT, rollback);
    return () => {
      window.removeEventListener(OPTIMISTIC_EVENT, add);
      window.removeEventListener(CONFIRMED_EVENT, confirm);
      window.removeEventListener(ROLLBACK_EVENT, rollback);
    };
  }, []);

  return useMemo(() => {
    const serverIds = new Set(transactions.map((transaction) => transaction.id));
    return [...pending.filter((transaction) => !serverIds.has(transaction.id)), ...transactions];
  }, [pending, transactions]);
}
