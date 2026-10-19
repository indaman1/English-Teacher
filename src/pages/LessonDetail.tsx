import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Mic, Target } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { getLesson, listLessonProgress, setLessonProgress } from '@/services/supabase/content';
import { levelLabel, type LessonExercise } from '@/types';

function Exercise({ ex, index }: { ex: LessonExercise; index: number }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const correct = ex.answer && value.trim().toLowerCase() === ex.answer.toLowerCase();

  if (ex.type === 'speak') {
    return (
      <li className="rounded-2xl bg-brand-50 p-4 text-sm text-slate-800">
        <span className="font-semibold text-brand-700">Speaking task {index + 1}: </span>
        {ex.prompt}
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-medium text-slate-900">{ex.prompt}</p>
      <div className="mt-2 flex gap-2">
        <input
          aria-label={`Answer for exercise ${index + 1}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setChecked(false);
          }}
          className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <Button size="sm" variant="secondary" onClick={() => setChecked(true)} disabled={!value.trim()}>
          Check
        </Button>
      </div>
      {checked && (
        <p role="status" className={correct ? 'mt-2 text-sm font-medium text-emerald-700' : 'mt-2 text-sm text-rose-700'}>
          {correct ? 'Correct! Well done.' : `Not quite. A good answer is: "${ex.answer}".`}
        </p>
      )}
    </li>
  );
}

export default function LessonDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [lesson, progress] = await Promise.all([getLesson(id), listLessonProgress()]);
    return { lesson, done: progress.some((p) => p.lesson_id === id && p.status === 'completed') };
  }, [id]);
  const [doneOverride, setDoneOverride] = useState<boolean | null>(null);

  usePageTitle(data?.lesson?.title ?? 'Lesson');

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message="We could not load this lesson." onRetry={reload} />;
  if (!data?.lesson) return <ErrorState title="Lesson not found" message="This lesson may have been removed." />;

  const { lesson } = data;
  const done = doneOverride ?? data.done;

  async function markDone() {
    if (!user) return;
    setSaving(true);
    try {
      await setLessonProgress(user.id, lesson.id, 'completed');
      setDoneOverride(true);
      toast.success('Lesson marked as complete.');
    } catch {
      toast.error('Could not save your progress. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const practiceUrl = `/practice?lesson=${lesson.id}${lesson.suggested_mode ? `&mode=${lesson.suggested_mode}` : ''}`;

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link to="/lessons" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All lessons
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{levelLabel(lesson.level)}</Badge>
          <span className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Clock className="h-4 w-4" aria-hidden /> {lesson.estimated_minutes} min
          </span>
          {done && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Completed
            </span>
          )}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{lesson.title}</h1>
        <p className="mt-1 text-slate-600">{lesson.description}</p>
      </header>

      <Card>
        <CardBody className="flex gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">Objective</h2>
            <p className="text-sm text-slate-600">{lesson.objective}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Learn" />
        <CardBody>
          <div className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{lesson.content}</div>
        </CardBody>
      </Card>

      {lesson.examples.length > 0 && (
        <Card>
          <CardHeader title="Examples" />
          <CardBody>
            <ul className="space-y-3">
              {lesson.examples.map((e) => (
                <li key={e.text} className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="font-medium text-slate-900">“{e.text}”</p>
                  {e.note && <p className="mt-0.5 text-sm text-slate-500">{e.note}</p>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {lesson.exercises.length > 0 && (
        <Card>
          <CardHeader title="Practise" />
          <CardBody>
            <ul className="space-y-3">
              {lesson.exercises.map((ex, i) => (
                <Exercise key={ex.prompt} ex={ex} index={i} />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link to={practiceUrl} className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 text-base font-semibold text-white shadow-glow hover:bg-brand-700">
          <Mic className="h-5 w-5" aria-hidden /> Practise this with your teacher
        </Link>
        {!done && (
          <Button variant="secondary" size="lg" onClick={markDone} loading={saving}>
            <CheckCircle2 className="h-5 w-5" aria-hidden /> Mark complete
          </Button>
        )}
      </div>
    </article>
  );
}
