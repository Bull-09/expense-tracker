'use client';

import { Transaction } from '@/lib/types';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card';
import { formatCompact } from '@/lib/utils/format';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const PALETTE = ['#B5544B', '#C99A3E', '#6B7280', '#8B6F9E', '#4A7C8C', '#A36B47', '#5C8A6E', '#9B5C6B'];

export function CategoryBreakdownChart({ transactions }: { transactions: Transaction[] }) {
  const now = new Date();
  const thisMonthExpenses = transactions.filter((t) => {
    const d = new Date(t.occurred_on);
    return t.kind === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const byCategory = new Map<string, number>();
  for (const t of thisMonthExpenses) {
    const name = t.category?.name ?? 'Uncategorized';
    byCategory.set(name, (byCategory.get(name) ?? 0) + t.amount);
  }

  const data = [...byCategory.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-paper/40 text-center py-10">No expenses logged this month yet.</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-40 h-40 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCompact(typeof value === 'number' ? value : Number(value) || 0)}
                    contentStyle={{ background: '#161922', border: '1px solid #262B38', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full flex flex-col gap-1.5 max-h-44 overflow-y-auto thin-scroll">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                    <span className="truncate text-paper/80">{d.name}</span>
                  </div>
                  <span className="font-ledger text-paper/60 flex-shrink-0 ml-2">
                    {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
