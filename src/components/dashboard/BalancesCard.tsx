import { BalanceSummary } from '@/lib/types';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils/format';

export function BalancesCard({ balances, totalOwedToYou, totalYouOwe }: {
  balances: BalanceSummary[];
  totalOwedToYou: number;
  totalYouOwe: number;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Split balances</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-emerald/10 border border-emerald/20 p-3">
            <p className="text-xs text-paper/50 mb-1">Owed to you</p>
            <p className="font-ledger text-lg font-bold text-emerald">{formatCurrency(totalOwedToYou)}</p>
          </div>
          <div className="rounded-lg bg-clay/10 border border-clay/20 p-3">
            <p className="text-xs text-paper/50 mb-1">You owe</p>
            <p className="font-ledger text-lg font-bold text-clay">{formatCurrency(totalYouOwe)}</p>
          </div>
        </div>

        {balances.length === 0 ? (
          <p className="text-sm text-paper/40 text-center py-6">
            No split expenses yet. Add one and pick who&apos;s in.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto thin-scroll">
            {balances.map((b) => (
              <div key={b.userId} className="flex items-center justify-between py-2 px-1 border-b border-ink-border last:border-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: b.avatarColor }}
                  >
                    {b.fullName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{b.fullName}</span>
                </div>
                <span className={`font-ledger text-sm font-semibold ${b.net >= 0 ? 'text-emerald' : 'text-clay'}`}>
                  {b.net >= 0 ? `owes you ${formatCurrency(b.net)}` : `you owe ${formatCurrency(Math.abs(b.net))}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
