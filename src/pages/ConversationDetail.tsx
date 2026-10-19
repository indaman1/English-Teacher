import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { TranscriptView } from '@/components/voice/TranscriptView';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/contexts/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatDateTime, formatMinutes } from '@/lib/utils';
import { deleteSession, getSession, getSessionDetails } from '@/services/supabase/sessions';
import { listModes } from '@/services/supabase/content';
import { levelLabel } from '@/types';

export default function ConversationDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const [session, details, modes] = await Promise.all([getSession(id), getSessionDetails(id), listModes()]);
    return { session, ...details, modes };
  }, [id]);

  usePageTitle(data?.session?.topic ?? 'Lesson review');

  // Feedback is generated right after the lesson ends; poll briefly until it is ready.
  const pending = data?.session?.feedback_status === 'pending' && data.session.status !== 'active';
  useEffect(() => {
    if (!pending) return;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      reload();
      if (tries >= 8) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [pending, reload]);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message="We could not load this lesson." onRetry={reload} />;
  if (!data?.session) return <ErrorState title="Lesson not found" message="It may have been deleted." />;

  const { session, messages, corrections, vocabulary, modes } = data;
  const modeName = modes.find((m) => m.code === session.mode_code)?.name;

  async function remove() {
    setDeleting(true);
    try {
      await deleteSession(session.id);
      toast.success('Lesson deleted.');
      navigate('/conversations', { replace: true });
    } catch {
      toast.error('Could not delete this lesson. Please try again.');
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/conversations" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Lesson history
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{session.topic}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {modeName && <Badge tone="brand">{modeName}</Badge>}
            <Badge>{levelLabel(session.level)}</Badge>
            <span>{formatDateTime(session.started_at)}</span>
            <span>· {formatMinutes(session.duration_seconds)}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} aria-label="Delete this lesson">
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </Button>
      </header>

      <Card>
        <CardHeader title="Summary" />
        <CardBody>
          {session.summary ? (
            <>
              <p className="text-[15px] leading-relaxed text-slate-700">{session.summary}</p>
              {session.estimated_score !== null && (
                <p className="mt-3 text-sm text-slate-500">
                  Estimated comfort score: <strong className="text-slate-800">{session.estimated_score}/100</strong> — a rough AI estimate, not a formal assessment.
                </p>
              )}
            </>
          ) : pending ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Your teacher is preparing feedback…
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              {session.status === 'abandoned'
                ? 'This lesson ended unexpectedly, so there is no review.'
                : 'There was not enough speaking in this lesson to generate feedback. Try a slightly longer conversation next time.'}
            </p>
          )}
        </CardBody>
      </Card>

      {corrections.length > 0 && (
        <Card>
          <CardHeader title="Important corrections" description="Say the corrected sentence out loud a few times." />
          <CardBody className="space-y-4">
            {corrections.map((c) => (
              <div key={c.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                <p className="text-rose-600 line-through decoration-rose-300">{c.original}</p>
                <p className="mt-1 text-base font-semibold text-emerald-700">{c.corrected}</p>
                {c.explanation && <p className="mt-1.5 text-slate-600">{c.explanation}</p>}
                <Badge className="mt-2">{c.category}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {vocabulary.length > 0 && (
        <Card>
          <CardHeader title="Vocabulary from this lesson" description="Saved to your notebook automatically." />
          <CardBody>
            <ul className="space-y-3">
              {vocabulary.map((v) => (
                <li key={v.id} className="text-sm">
                  <span className="font-semibold text-slate-900">{v.word}</span> — {v.meaning}
                  {v.example && <p className="text-slate-500">“{v.example}”</p>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {session.suggestions.length > 0 && (
        <Card>
          <CardHeader title="How to improve" />
          <CardBody>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              {session.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {session.recommended_next && (
        <Card className="border-brand-200 bg-brand-50/50">
          <CardBody className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">Recommended next</h2>
              <p className="mt-0.5 text-sm text-slate-700">{session.recommended_next}</p>
              <Link to="/practice" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                Start another lesson <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Transcript" description="Generated automatically from speech; it may contain mistakes." />
        <CardBody>
          <TranscriptView
            messages={messages.map((m) => ({ id: m.id, role: m.role, text: m.content, final: true }))}
            emptyText="No transcript was saved for this lesson."
            className="max-h-[28rem]"
          />
        </CardBody>
      </Card>

      {data.session.feedback_status === 'ready' && data.vocabulary.length === 0 && data.corrections.length === 0 && (
        <p className="text-center text-sm text-slate-500">No mistakes worth correcting this time. Nice speaking!</p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        onConfirm={remove}
        loading={deleting}
        danger
        confirmLabel="Delete lesson"
        title="Delete this lesson?"
        description="The transcript, summary and corrections from this lesson will be permanently removed. Words already saved stay in your notebook."
      />
    </div>
  );
}
