import type { SeriesPoint } from '@/features/progress/calc';

/** Lightweight accessible bar chart (no chart library needed). Values are minutes of speaking. */
export function ActivityChart({ series }: { series: SeriesPoint[] }) {
  const minutes = series.map((p) => p.seconds / 60);
  const max = Math.max(5, ...minutes);
  const total = Math.round(minutes.reduce((a, b) => a + b, 0));

  return (
    <figure>
      <div
        role="img"
        aria-label={`Speaking minutes per day over the last ${series.length} days. Total ${total} minutes.`}
        className="flex h-36 items-end gap-1.5 sm:gap-2"
      >
        {series.map((p, i) => {
          const m = minutes[i];
          return (
            <div key={p.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${p.date}: ${m.toFixed(1)} min`}>
              <div
                className={m > 0 ? 'rounded-t-md bg-gradient-to-t from-brand-600 to-violet-400' : 'rounded-t-md bg-slate-200'}
                style={{ height: `${Math.max(m > 0 ? 6 : 3, (m / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{series[0]?.date.slice(5)}</span>
        <span>Minutes spoken per day</span>
        <span>{series[series.length - 1]?.date.slice(5)}</span>
      </figcaption>
    </figure>
  );
}
