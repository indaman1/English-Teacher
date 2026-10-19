import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, FileText, Loader2, Mic, MicOff, PhoneOff, RefreshCw, WifiOff } from 'lucide-react';
import { AudioVisualizer } from '@/components/voice/AudioVisualizer';
import { TeacherAvatar } from '@/components/voice/TeacherAvatar';
import { TranscriptView } from '@/components/voice/TranscriptView';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { isVoiceSupported } from '@/features/voice/audioCapture';
import { useLiveSession } from '@/features/voice/useLiveSession';
import { STATE_LABELS, isActive, isMicLive } from '@/features/voice/voiceStateMachine';
import { cn, formatDuration } from '@/lib/utils';
import { levelLabel, type EnglishLevel } from '@/types';

export interface LivePracticeState {
  modeCode: string;
  modeName: string;
  topic?: string;
  lessonId?: string;
  level: EnglishLevel;
}

export default function PracticeLive() {
  usePageTitle('Live lesson');
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const config = location.state as LivePracticeState | null;

  if (!config || !user) return <Navigate to="/practice" replace />;
  return <LiveScreen config={config} userId={user.id} navigate={navigate} notify={toast.info} />;
}

function LiveScreen({
  config,
  userId,
  navigate,
  notify,
}: {
  config: LivePracticeState;
  userId: string;
  navigate: ReturnType<typeof useNavigate>;
  notify: (m: string) => void;
}) {
  const live = useLiveSession(userId);
  const [showTranscript, setShowTranscript] = useState(true);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const supported = isVoiceSupported();
  const active = isActive(live.state);
  const micLive = isMicLive(live.state);
  const remaining = live.info ? Math.max(0, live.info.maxSeconds - live.elapsed) : null;

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Warn before closing the tab mid-lesson; the cleanup effect in the hook releases the microphone.
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  // Lesson finished: go to the review page.
  const [finishing, setFinishing] = useState(false);
  async function endLesson() {
    setFinishing(true);
    const result = await live.end('user');
    setFinishing(false);
    if (result?.sessionId) navigate(`/conversations/${result.sessionId}`, { replace: true });
    else navigate('/dashboard', { replace: true });
  }

  useEffect(() => {
    if (live.state === 'completed' && live.endReason === 'time_limit') {
      notify('Your practice time for this lesson is finished.');
      if (live.info?.sessionId) navigate(`/conversations/${live.info.sessionId}`, { replace: true });
    }
  }, [live.state, live.endReason, live.info?.sessionId, navigate, notify]);

  function start() {
    void live.start({ modeCode: config.modeCode, topic: config.topic, lessonId: config.lessonId, level: config.level });
  }

  const statusTone = live.state === 'error' ? 'danger' : live.state === 'reconnecting' ? 'warning' : micLive ? 'success' : 'neutral';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-slate-50 to-brand-50/40">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {active || finishing ? (
          <span className="text-sm text-slate-500">Lesson in progress</span>
        ) : (
          <Link to="/practice" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone="brand">{config.modeName}</Badge>
          <Badge>{levelLabel(live.info?.level ?? config.level)}</Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4 sm:px-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">{live.info?.topic ?? config.topic ?? config.modeName}</h1>
          <p className="mt-0.5 text-sm tabular-nums text-slate-500" aria-live="off">
            {active ? `${formatDuration(live.elapsed)}${remaining !== null ? ` · ${formatDuration(remaining)} left` : ''}` : 'Ready when you are'}
          </p>
        </div>

        {!online && (
          <p role="alert" className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm text-amber-800">
            <WifiOff className="h-4 w-4" aria-hidden /> Your internet connection appears to be unavailable.
          </p>
        )}

        <div className="mt-6 flex flex-col items-center">
          <TeacherAvatar state={live.state} />
          <div className="mt-5" role="status" aria-live="polite">
            <Badge tone={statusTone} className="gap-1.5 px-3 py-1 text-sm">
              {(live.state === 'connecting' || live.state === 'requesting_mic' || live.state === 'reconnecting' || live.state === 'ending') && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              {STATE_LABELS[live.state]}
            </Badge>
          </div>
          <AudioVisualizer className="mt-3 w-full max-w-sm" state={live.state} muted={live.muted} getMicLevel={live.getMicLevel} getAiLevel={live.getAiLevel} />
          {micLive && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              {live.muted ? <MicOff className="h-3.5 w-3.5" aria-hidden /> : <Mic className="h-3.5 w-3.5" aria-hidden />}
              {live.muted ? 'Microphone muted — your teacher cannot hear you' : 'Microphone on'}
            </p>
          )}
        </div>

        {!supported && (
          <p role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Your browser does not support live voice lessons. Please use an up-to-date Chrome, Edge, Firefox or Safari.
          </p>
        )}

        {live.error && (
          <div role="alert" className="mt-4 flex gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="flex-1">
              <p>{live.error.message}</p>
              {live.error.code === 'limit_reached' && (
                <Link to="/subscription" className="mt-1 inline-block font-semibold underline">
                  See your plan
                </Link>
              )}
            </div>
          </div>
        )}

        <section
          aria-label="Transcript"
          className={cn('mt-4 flex min-h-0 flex-1 flex-col rounded-3xl border border-slate-200/80 bg-white/80 p-3', !showTranscript && 'hidden')}
        >
          <TranscriptView messages={live.messages} className="max-h-[32vh] flex-1 px-1 sm:max-h-[36vh]" />
        </section>
      </main>

      <footer className="sticky bottom-0 border-t border-slate-200/70 bg-white/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-center gap-3">
          {live.state === 'idle' || live.state === 'completed' ? (
            <Button size="lg" fullWidth onClick={start} disabled={!supported || !online} className="max-w-sm">
              <Mic className="h-5 w-5" aria-hidden /> Start lesson
            </Button>
          ) : live.state === 'error' ? (
            <>
              <Button variant="secondary" size="lg" onClick={() => navigate('/practice')}>
                Back
              </Button>
              {live.hasResumableSession && live.error?.retryable ? (
                <Button size="lg" onClick={() => void live.reconnect()}>
                  <RefreshCw className="h-5 w-5" aria-hidden /> Reconnect
                </Button>
              ) : null}
              <Button size="lg" onClick={() => { live.reset(); }}>
                <RefreshCw className="h-5 w-5" aria-hidden /> Try again
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="lg"
                aria-pressed={live.muted}
                onClick={live.toggleMute}
                disabled={!micLive}
                aria-label={live.muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {live.muted ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
                <span className="hidden sm:inline">{live.muted ? 'Unmute' : 'Mute'}</span>
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setShowTranscript((s) => !s)} aria-pressed={showTranscript}>
                <FileText className="h-5 w-5" aria-hidden />
                <span className="hidden sm:inline">Transcript</span>
              </Button>
              <Button variant="danger" size="lg" onClick={endLesson} loading={finishing || live.state === 'ending'} className="min-w-36">
                <PhoneOff className="h-5 w-5" aria-hidden /> End lesson
              </Button>
            </>
          )}
        </div>
        {live.state === 'idle' && (
          <p className="mt-2 text-center text-xs text-slate-500">
            Your browser will ask to use your microphone. Audio is streamed to Google’s Gemini for the live conversation and is not stored by us.
          </p>
        )}
      </footer>
    </div>
  );
}
