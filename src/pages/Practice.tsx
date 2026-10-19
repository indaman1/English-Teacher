import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AudioLines, BookA, BookOpen, Briefcase, Building2, Drama, MessageCircle, Mic, Plane, SpellCheck, Sun } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import { getMyUsage } from '@/services/supabase/usage';
import { getLesson, listModes } from '@/services/supabase/content';
import { LEVELS, type EnglishLevel } from '@/types';
import type { LivePracticeState } from './PracticeLive';

const ICONS: Record<string, typeof Mic> = {
  'message-circle': MessageCircle,
  sun: Sun,
  'spell-check': SpellCheck,
  'book-a': BookA,
  'audio-lines': AudioLines,
  briefcase: Briefcase,
  'building-2': Building2,
  plane: Plane,
  'book-open': BookOpen,
  drama: Drama,
};

export default function Practice() {
  usePageTitle('Practice');
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const lessonId = params.get('lesson');

  const { data, error, loading, reload } = useAsync(async () => {
    const [modes, usage, lesson] = await Promise.all([listModes(), getMyUsage(), lessonId ? getLesson(lessonId) : Promise.resolve(null)]);
    return { modes, usage, lesson };
  }, [lessonId]);

  const [modeCode, setModeCode] = useState<string | null>(params.get('mode'));
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<EnglishLevel | ''>('');

  const modes = useMemo(() => data?.modes ?? [], [data]);
  const selected = useMemo(
    () => modes.find((m) => m.code === (modeCode ?? data?.lesson?.suggested_mode ?? '')) ?? null,
    [modes, modeCode, data?.lesson?.suggested_mode],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message="We could not load practice modes." onRetry={reload} />;

  const usage = data.usage;
  const remainingSeconds = usage ? Math.min(usage.daily_limit_seconds - usage.daily_used_seconds, usage.monthly_limit_seconds - usage.monthly_used_seconds) : null;
  const limitReached = usage ? remainingSeconds! < 30 || usage.sessions_today >= usage.daily_sessions_limit : false;

  function begin() {
    if (!selected) return;
    const state: LivePracticeState = {
      modeCode: selected.code,
      modeName: selected.name,
      topic: topic || data!.lesson?.title || undefined,
      lessonId: data!.lesson?.id,
      level: (level || data!.lesson?.level || profile?.english_level || 'beginner') as EnglishLevel,
    };
    navigate('/practice/live', { state });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">What would you like to practise?</h1>
        <p className="mt-1 text-slate-600">Choose a mode, then start a live voice lesson with your AI teacher.</p>
        {data.lesson && <p className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">Lesson: {data.lesson.title}</p>}
      </header>

      {limitReached && (
        <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You have reached your current practice limit. Your limit resets daily, or you can see your plan on the Plan &amp; usage page.
        </p>
      )}

      {modes.length === 0 ? (
        <EmptyState title="No practice modes available" description="Please check back soon." />
      ) : (
        <div role="radiogroup" aria-label="Learning mode" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modes.map((m) => {
            const Icon = ICONS[m.icon] ?? Mic;
            const on = selected?.code === m.code;
            return (
              <button
                key={m.code}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setModeCode(m.code)}
                className={cn(
                  'card flex gap-4 p-4 text-left transition',
                  on ? 'border-brand-500 ring-2 ring-brand-200' : 'hover:border-slate-300',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-slate-900">{m.name}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{m.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <section aria-label="Lesson options" className="card space-y-4 p-5">
          <h2 className="text-base font-semibold">{selected.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Let the teacher choose</option>
              {selected.topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select label="English level" value={level || data.lesson?.level || profile?.english_level || 'beginner'} onChange={(e) => setLevel(e.target.value as EnglishLevel)}>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          {usage && remainingSeconds !== null && (
            <p className="text-sm text-slate-500">
              About {Math.max(0, Math.floor(Math.min(remainingSeconds, usage.max_session_seconds) / 60))} minutes available for this lesson on your {usage.plan_code} plan.
            </p>
          )}
          <Button size="lg" fullWidth onClick={begin} disabled={limitReached}>
            <Mic className="h-5 w-5" aria-hidden /> Continue to live lesson
          </Button>
        </section>
      )}
    </div>
  );
}
