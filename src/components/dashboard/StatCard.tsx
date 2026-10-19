import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/States';

export function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function ProgressCard({
  title,
  valueLabel,
  value,
  max,
  caption,
}: {
  title: string;
  valueLabel: string;
  value: number;
  max: number;
  caption?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-sm font-medium text-slate-600">{valueLabel}</span>
      </div>
      <ProgressBar className="mt-3" value={value} max={max} label={title} />
      {caption && <p className="mt-2 text-xs text-slate-500">{caption}</p>}
    </Card>
  );
}
