import { Link } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime, formatMinutes } from '@/lib/utils';
import { levelLabel, type LearningSession } from '@/types';

export function ConversationCard({ session, modeName }: { session: LearningSession; modeName?: string }) {
  return (
    <Link
      to={`/conversations/${session.id}`}
      className="card flex items-center gap-4 p-4 transition hover:border-brand-200 hover:shadow-glow sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">{session.topic}</h3>
          {modeName && <Badge tone="brand">{modeName}</Badge>}
          <Badge>{levelLabel(session.level)}</Badge>
          {session.status === 'abandoned' && <Badge tone="warning">Ended early</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
          {session.summary ?? (session.feedback_status === 'unavailable' ? 'No feedback — the lesson was too short to review.' : 'Feedback is being prepared…')}
        </p>
        <p className="mt-2 flex items-center gap-3 text-xs text-slate-500">
          <span>{formatDateTime(session.started_at)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {formatMinutes(session.duration_seconds)}
          </span>
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
    </Link>
  );
}
