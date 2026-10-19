import { useMemo, useState } from 'react';
import { LessonCard } from '@/components/lessons/LessonCard';
import { Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { listCategories, listLessonProgress, listLessons } from '@/services/supabase/content';
import { LEVELS, type EnglishLevel } from '@/types';

export default function Lessons() {
  usePageTitle('Lessons');
  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState<EnglishLevel | 'all'>('all');

  const { data, error, loading, reload } = useAsync(async () => {
    const [categories, lessons, progress] = await Promise.all([listCategories(), listLessons(), listLessonProgress()]);
    return { categories, lessons, progress };
  }, []);

  const completed = useMemo(() => new Set((data?.progress ?? []).filter((p) => p.status === 'completed').map((p) => p.lesson_id)), [data]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message="We could not load the lessons." onRetry={reload} />;

  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const visible = data.lessons.filter(
    (l) => (category === 'all' || l.category_id === category) && (level === 'all' || l.level === level),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lessons</h1>
        <p className="mt-1 text-slate-600">Short lessons with examples, then practise out loud with your teacher.</p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          label="Lesson categories"
          value={category}
          onChange={setCategory}
          items={[{ value: 'all', label: 'All' }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <div className="sm:w-56">
          <Select label="Level" value={level} onChange={(e) => setLevel(e.target.value as EnglishLevel | 'all')}>
            <option value="all">All levels</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No lessons match" description="Try another category or level." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((l) => (
            <li key={l.id}>
              <LessonCard lesson={l} completed={completed.has(l.id)} categoryName={catName.get(l.category_id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
