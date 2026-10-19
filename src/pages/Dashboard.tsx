import { Link } from 'react-router-dom';
import { BookText, Clock, Flame, GraduationCap, Mic, Sparkles } from 'lucide-react';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { ProgressCard, StatCard } from '@/components/dashboard/StatCard';
import { ConversationCard } from '@/components/lessons/ConversationCard';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { computeStreak, dailySeries, secondsToday } from '@/features/progress/calc';
import { formatMinutes, greetingForHour } from '@/lib/utils';
import { fetchDailyStats, fetchLifetimeTotals } from '@/services/supabase/progress';
import { listSessions, recentCorrections } from '@/services/supabase/sessions';
import { countVocabulary } from '@/services/supabase/vocabulary';
import { listLessons, listLessonProgress, listModes } from '@/services/supabase/content';
import { levelLabel } from '@/types';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { profile } = useAuth();

  const { data, error, loading, reload } = useAsync(async () => {
    const [stats, totals, sessions, corrections, vocab, lessons, progress, modes] = await Promise.all([
      fetchDailyStats(30),
      fetchLifetimeTotals(),
      listSessions(3),
      recentCorrections(4),
      countVocabulary(),
      listLessons(),
      listLessonProgress(),
      listModes(),
    ]);
    return { stats, totals, sessions, corrections, vocab, lessons, progress, modes };
  }, []);

  const name = profile?.display_name?.split(' ')[0] || 'there';
  const targetSeconds = (profile?.daily_target_minutes ?? 10) * 60;

  if (error) return <ErrorState message="We could not load your dashboard." onRetry={reload} />;

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { stats, totals, sessions, corrections, vocab, lessons, progress, modes } = data;
  const streak = computeStreak(stats);
  const today = secondsToday(stats);
  const completed = new Set(progress.filter((p) => p.status === 'completed').map((p) => p.lesson_id));
  const recommended = lessons.find((l) => l.level === profile?.english_level && !completed.has(l.id)) ?? lessons.find((l) => !completed.has(l.id));
  const modeName = (code: string | null) => modes.find((m) => m.code === code)?.name;
  const isNew = totals.sessions === 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {greetingForHour(new Date().getHours())}, {name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
            Your level <Badge tone="brand">{levelLabel(profile?.english_level ?? 'beginner')}</Badge>
          </p>
        </div>
        <Link to="/practice" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-7 text-base font-semibold text-white shadow-glow hover:bg-brand-700">
          <Mic className="h-5 w-5" aria-hidden /> Start conversation
        </Link>
      </section>

      <ProgressCard
        title="Today’s goal"
        valueLabel={`${formatMinutes(today)} of ${profile?.daily_target_minutes ?? 10} min`}
        value={today}
        max={targetSeconds}
        caption={today >= targetSeconds ? 'Goal reached. Great work today!' : 'Speak a little every day. Small steps add up.'}
      />

      <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={<Clock className="h-5 w-5" aria-hidden />} label="Speaking time" value={formatMinutes(totals.speakingSeconds)} />
        <StatCard icon={<Mic className="h-5 w-5" aria-hidden />} label="Lessons" value={String(totals.sessions)} />
        <StatCard icon={<Flame className="h-5 w-5" aria-hidden />} label="Day streak" value={String(streak.current)} hint={streak.longest > 0 ? `Longest: ${streak.longest}` : undefined} />
        <StatCard icon={<BookText className="h-5 w-5" aria-hidden />} label="Words saved" value={String(vocab)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Last 14 days" description="Minutes you spent speaking" />
            <CardBody>
              {isNew ? (
                <EmptyState
                  icon={<Mic className="h-6 w-6" aria-hidden />}
                  title="Your first lesson is waiting"
                  description="Start a short conversation and your progress will appear here."
                  action={<Link to="/practice"><Button>Start your first lesson</Button></Link>}
                  className="py-6"
                />
              ) : (
                <ActivityChart series={dailySeries(stats, 14)} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent lessons" action={<Link to="/conversations" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
            <CardBody className="space-y-3">
              {sessions.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">No lessons yet. They will show up here after your first conversation.</p>
              ) : (
                sessions.map((s) => <ConversationCard key={s.id} session={s} modeName={modeName(s.mode_code)} />)
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Recommended for you" />
            <CardBody>
              {recommended ? (
                <>
                  <div className="flex items-center gap-2 text-brand-700">
                    <GraduationCap className="h-5 w-5" aria-hidden />
                    <span className="text-sm font-semibold">{levelLabel(recommended.level)}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold">{recommended.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{recommended.description}</p>
                  <Link to={`/lessons/${recommended.id}`} className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">
                    Open lesson →
                  </Link>
                </>
              ) : (
                <p className="text-sm text-slate-600">You have completed every lesson available. Try a free conversation to keep practising.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent corrections" />
            <CardBody className="space-y-4">
              {corrections.length === 0 ? (
                <p className="text-sm text-slate-500">Corrections from your lessons will appear here so you can review them.</p>
              ) : (
                corrections.map((c) => (
                  <div key={c.id} className="text-sm">
                    <p className="text-rose-600 line-through decoration-rose-300">{c.original}</p>
                    <p className="mt-0.5 font-medium text-emerald-700">{c.corrected}</p>
                    {c.explanation && <p className="mt-0.5 text-slate-500">{c.explanation}</p>}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Feedback is AI-generated and may contain mistakes.
          </p>
        </div>
      </div>
    </div>
  );
}
