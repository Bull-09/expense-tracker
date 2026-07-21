export type DebtEdge = { from: string; to: string; amount: number };
export type SplitBalanceInput = { payerId: string; memberId: string; amount: number };

export function simplifyDebts(shares: SplitBalanceInput[]): DebtEdge[] {
  const balances = new Map<string, number>();
  for (const share of shares) {
    if (share.amount <= 0 || share.payerId === share.memberId) continue;
    balances.set(share.payerId, (balances.get(share.payerId) ?? 0) + share.amount);
    balances.set(share.memberId, (balances.get(share.memberId) ?? 0) - share.amount);
  }
  const creditors = [...balances].filter(([, amount]) => amount > 0.005).map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
  const debtors = [...balances].filter(([, amount]) => amount < -0.005).map(([id, amount]) => ({ id, amount: -amount })).sort((a, b) => b.amount - a.amount);
  const result: DebtEdge[] = [];
  let creditor = 0;
  let debtor = 0;
  while (creditor < creditors.length && debtor < debtors.length) {
    const amount = Math.min(creditors[creditor].amount, debtors[debtor].amount);
    result.push({ from: debtors[debtor].id, to: creditors[creditor].id, amount: Math.round(amount * 100) / 100 });
    creditors[creditor].amount -= amount;
    debtors[debtor].amount -= amount;
    if (creditors[creditor].amount < 0.005) creditor += 1;
    if (debtors[debtor].amount < 0.005) debtor += 1;
  }
  return result;
}

export function upiPaymentLink(upiId: string, payeeName: string, amount: number, note: string) {
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, am: amount.toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${params.toString()}`;
}

export function whatsappReminderLink(phone: string, amount: number, context: string) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(`Hey! A quick reminder for ₹${amount.toFixed(2)} for ${context}. You can settle it when convenient.`)}`;
}
