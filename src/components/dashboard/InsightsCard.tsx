import { Insight } from '@/lib/insights';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const toneConfig = {
  warning: { icon: AlertTriangle, color: 'text-clay', bg: 'bg-clay/10 border-clay/20' },
  positive: { icon: CheckCircle2, color: 'text-emerald', bg: 'bg-emerald/10 border-emerald/20' },
  neutral: { icon: Info, color: 'text-gold', bg: 'bg-gold/10 border-gold/20' },
};

export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suggestions for you</CardTitle>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-paper/40 text-center py-6">
            Add a few more transactions and patterns will show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {insights.map((insight) => {
              const config = toneConfig[insight.tone];
              const Icon = config.icon;
              return (
                <div key={insight.id} className={`rounded-lg border p-3 ${config.bg}`}>
                  <div className="flex items-start gap-2.5">
                    <Icon size={16} className={`${config.color} flex-shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-sm font-medium leading-snug">{insight.title}</p>
                      <p className="text-xs text-paper/50 mt-0.5 leading-snug">{insight.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
