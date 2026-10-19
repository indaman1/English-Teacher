import { Link } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { ConversationCard } from '@/components/lessons/ConversationCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { listModes } from '@/services/supabase/content';
import { listSessions } from '@/services/supabase/sessions';

export default function Conversations() {
  usePageTitle('Lesson history');
  const { data, error, loading, reload } = useAsync(async () => {
    const [sessions, modes] = await Promise.all([listSessions(100), listModes()]);
    return { sessions, modes };
  }, []);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message="We could not load your lessons." onRetry={reload} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Lesson history</h1>
        <p className="mt-1 text-slate-600">Review summaries, corrections and transcripts from your past lessons.</p>
      </header>
      {data.sessions.length === 0 ? (
        <EmptyState
          icon={<Mic className="h-6 w-6" aria-hidden />}
          title="No lessons yet"
          description="After your first conversation, you will find the summary and corrections here."
          action={
            <Link to="/practice">
              <Button>Start a lesson</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.sessions.map((s) => (
            <li key={s.id}>
              <ConversationCard session={s} modeName={data.modes.find((m) => m.code === s.mode_code)?.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
