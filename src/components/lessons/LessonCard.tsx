import { Link } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { levelLabel, type Lesson } from '@/types';

export function LessonCard({ lesson, completed, categoryName }: { lesson: Lesson; completed?: boolean; categoryName?: string }) {
  return (
    <Link
      to={`/lessons/${lesson.id}`}
      className="card group flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-glow"
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone="brand">{levelLabel(lesson.level)}</Badge>
        {completed && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Completed
          </span>
        )}
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900 group-hover:text-brand-700">{lesson.title}</h3>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-600">{lesson.description}</p>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{categoryName}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {lesson.estimated_minutes} min
        </span>
      </div>
    </Link>
  );
}
