import { useState } from 'react';
import { BookText, Clock, Flame, MessageSquareWarning, Mic } from 'lucide-react';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { computeStreak, dailySeries, sumLastDays, totals } from '@/features/progress/calc';
import { formatMinutes } from '@/lib/utils';
import { listLessonProgress } from '@/services/supabase/content';
import { fetchDailyStats } from '@/services/supabase/progress';

type Range = '7' | '30' | '90';

export default function Progress() {
  usePageTitle('Progress');
  const [range, setRange] = useState<Range>('30');
  const { data, error, loading, reload } = useAsync(async () => {
    const [stats, progress] = await Promise.all([fetchDailyStats(90), listLessonProgress()]);
    return { stats, lessonsCompleted: progress.filter((p) => p.status === 'completed').length };
  }, []);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message="We could not load your progress." onRetry={reload} />;

  const { stats, lessonsCompleted } = data;
  const all = totals(stats);
  const streak = computeStreak(stats);
  const days = Number(range);
  const series = dailySeries(stats, Math.min(days, days === 90 ? 30 : days));
  const activeDays = stats.filter((s) => s.speaking_seconds > 0).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your progress</h1>
        <p className="mt-1 text-slate-600">Real numbers from your lessons. Nothing here is estimated unless it says so.</p>
      </header>

      {all.sessions === 0 ? (
        <EmptyState icon={<Mic className="h-6 w-6" aria-hidden />} title="No progress to show yet" description="Complete your first lesson and your speaking time, streak and words will appear here." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Totals (last 90 days)">
            <StatCard icon={<Clock className="h-5 w-5" aria-hidden />} label="Speaking time" value={formatMinutes(all.speakingSeconds)} hint="Last 90 days" />
            <StatCard icon={<Mic className="h-5 w-5" aria-hidden />} label="Conversations" value={String(all.sessions)} hint={`${lessonsCompleted} lessons completed`} />
            <StatCard icon={<Flame className="h-5 w-5" aria-hidden />} label="Current streak" value={`${streak.current} d`} hint={`Longest ${streak.longest} d`} />
            <StatCard icon={<BookText className="h-5 w-5" aria-hidden />} label="Words learned" value={String(all.vocabulary)} />
          </section>

          <Card>
            <CardHeader
              title="Speaking time"
              action={
                <Tabs
                  label="Range"
                  value={range}
                  onChange={setRange}
                  items={[
                    { value: '7', label: '7 days' },
                    { value: '30', label: '30 days' },
                  ]}
                />
              }
            />
            <CardBody>
              <ActivityChart series={series} />
            </CardBody>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm text-slate-500">This week</p>
              <p className="mt-1 text-2xl font-bold">{formatMinutes(sumLastDays(stats, 7, 'speaking_seconds'))}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">This month (30 days)</p>
              <p className="mt-1 text-2xl font-bold">{formatMinutes(sumLastDays(stats, 30, 'speaking_seconds'))}</p>
            </Card>
            <Card className="p-5">
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <MessageSquareWarning className="h-4 w-4" aria-hidden /> Grammar corrections
              </p>
              <p className="mt-1 text-2xl font-bold">{all.corrections}</p>
              <p className="mt-0.5 text-xs text-slate-500">{activeDays} practice days in the last 90</p>
            </Card>
          </div>

          <p className="text-xs text-slate-500">Corrections and lesson scores are produced by AI from speech transcripts. Treat them as helpful guidance, not as an exam result.</p>
        </>
      )}
    </div>
  );
}
