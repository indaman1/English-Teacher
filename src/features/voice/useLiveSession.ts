import { useCallback, useEffect, useRef, useState } from 'react';
import { GeminiLiveService } from '@/services/gemini/geminiLiveService';
import { requestLiveToken, type LiveTokenRequest, type LiveTokenResponse } from '@/services/gemini/liveTokenClient';
import { finalizeSession, saveMessage, type FinalizeResult } from '@/services/supabase/sessions';
import { AudioPlayer } from './audioPlayer';
import { MicCapture, isVoiceSupported } from './audioCapture';
import { VoiceError } from './errors';
import { TranscriptBuffer, type TranscriptMessage } from './transcriptBuffer';
import { canStart, isActive, voiceReducer, type VoiceEvent, type VoiceState } from './voiceStateMachine';

const KICKOFF_TEXT = 'Please begin now: greet me warmly in one or two short sentences and ask how I am doing. Then wait for my answer.';
const PROCESSING_DELAY_MS = 900;
const INTERRUPT_SETTLE_MS = 600;
const MAX_AUTO_RECONNECTS = 2;

export interface LiveSessionInfo {
  sessionId: string;
  topic: string;
  level: string;
  maxSeconds: number;
}

export interface EndResult {
  sessionId: string;
  finalize: FinalizeResult | null;
  reason: 'user' | 'time_limit' | 'navigated';
}

/**
 * Orchestrates one live voice lesson: microphone → Gemini Live → speaker.
 * Everything mutable lives in refs so callbacks never go stale, and teardown is idempotent.
 */
export function useLiveSession(userId: string) {
  const [state, setStateValue] = useState<VoiceState>('idle');
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<VoiceError | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [info, setInfo] = useState<LiveSessionInfo | null>(null);
  const [endReason, setEndReason] = useState<EndResult['reason'] | null>(null);

  const stateRef = useRef<VoiceState>('idle');
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const liveRef = useRef<GeminiLiveService | null>(null);
  const sessionRef = useRef<LiveTokenResponse | null>(null);
  const handleRef = useRef<string | undefined>(undefined);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectsRef = useRef(0);
  const lastErrorRef = useRef<VoiceError | null>(null);
  const pendingSavesRef = useRef(new Set<Promise<void>>());
  const endingRef = useRef<Promise<EndResult | null> | null>(null);
  const transcriptRef = useRef<TranscriptBuffer | null>(null);

  const transition = useCallback((event: VoiceEvent) => {
    const next = voiceReducer(stateRef.current, event);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setStateValue(next);
    }
  }, []);

  const syncMessages = useCallback(() => {
    setMessages(transcriptRef.current?.snapshot() ?? []);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
    timerRef.current = null;
    processingTimerRef.current = null;
    interruptTimerRef.current = null;
  }, []);

  /** Releases microphone, speaker and socket. Safe to call repeatedly. */
  const releaseMedia = useCallback(async () => {
    micRef.current?.setForwarding(false);
    liveRef.current?.close();
    liveRef.current = null;
    const mic = micRef.current;
    const player = playerRef.current;
    micRef.current = null;
    playerRef.current = null;
    await Promise.allSettled([mic?.stop(), player?.close()]);
  }, []);

  const getTranscript = useCallback((): TranscriptBuffer => {
    if (!transcriptRef.current) {
      transcriptRef.current = new TranscriptBuffer((msg) => {
        const session = sessionRef.current;
        if (!session) return;
        const p: Promise<void> = saveMessage({
          sessionId: session.sessionId,
          userId,
          role: msg.role,
          content: msg.text,
          seq: msg.seq,
        })
          .catch(() => undefined) // transcript persistence is best-effort; the lesson continues
          .finally(() => {
            pendingSavesRef.current.delete(p);
          });
        pendingSavesRef.current.add(p);
      });
    }
    return transcriptRef.current;
  }, [userId]);

  const fail = useCallback(
    async (err: unknown) => {
      if (stateRef.current === 'ending' || stateRef.current === 'completed') return;
      const voiceErr = err instanceof VoiceError ? err : new VoiceError('unknown');
      clearTimers();
      transcriptRef.current?.finalizeCurrent();
      syncMessages();
      setError(voiceErr);
      transition({ type: 'ERROR' });
      await releaseMedia();
    },
    [clearTimers, releaseMedia, syncMessages, transition],
  );

  const buildEvents = useCallback(
    (isReconnect: boolean) => ({
      onOpen: () => {
        micRef.current?.setForwarding(true);
        transition({ type: 'SESSION_OPEN' });
        // Only a brand-new lesson asks the teacher to greet first; a resumed one just carries on.
        if (!isReconnect) liveRef.current?.sendText(KICKOFF_TEXT);
        transition({ type: 'LISTENING' });
        if (!isReconnect) reconnectsRef.current = 0;
      },
      onAudio: (b64: string) => {
        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
        playerRef.current?.enqueue(b64);
        transition({ type: 'AI_AUDIO' });
      },
      onInputTranscript: (text: string) => {
        getTranscript().push('student', text);
        syncMessages();
        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
        processingTimerRef.current = setTimeout(() => {
          if (stateRef.current === 'listening') transition({ type: 'PROCESSING' });
        }, PROCESSING_DELAY_MS);
      },
      onOutputTranscript: (text: string) => {
        getTranscript().push('teacher', text);
        syncMessages();
      },
      onInterrupted: () => {
        playerRef.current?.interrupt();
        getTranscript().finalizeCurrent();
        syncMessages();
        transition({ type: 'INTERRUPTED' });
        if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
        interruptTimerRef.current = setTimeout(() => transition({ type: 'LISTENING' }), INTERRUPT_SETTLE_MS);
      },
      onTurnComplete: () => {
        getTranscript().finalizeCurrent();
        syncMessages();
        if (!playerRef.current?.isPlaying) transition({ type: 'AI_DONE' });
      },
      onResumptionHandle: (h: string) => {
        handleRef.current = h;
      },
      onGoAway: () => {
        void reconnectRef.current?.();
      },
      onClose: (closeErr: VoiceError | null, userInitiated: boolean) => {
        if (userInitiated) return;
        if (!isActive(stateRef.current) || stateRef.current === 'reconnecting') return;
        const err = lastErrorRef.current ?? closeErr ?? new VoiceError('connection_lost');
        lastErrorRef.current = null;
        if (err.retryable && handleRef.current && reconnectsRef.current < MAX_AUTO_RECONNECTS) {
          void reconnectRef.current?.();
        } else {
          void fail(err);
        }
      },
      onError: (e: VoiceError) => {
        lastErrorRef.current = e;
      },
    }),
    [fail, getTranscript, syncMessages, transition],
  );

  const reconnectRef = useRef<(() => Promise<void>) | null>(null);
  const startTimerRef = useRef<((maxSeconds: number) => void) | null>(null);
  const endRef = useRef<((reason?: EndResult['reason']) => Promise<EndResult | null>) | null>(null);

  /** Wall-clock timer for the on-screen countdown; the SERVER still measures the billable time. */
  const startTimer = useCallback((maxSeconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= maxSeconds && isActive(stateRef.current)) void endRef.current?.('time_limit');
    }, 500);
  }, []);
  startTimerRef.current = startTimer;

  const connectLive = useCallback(
    async (session: LiveTokenResponse, isReconnect: boolean) => {
      const live = new GeminiLiveService();
      liveRef.current = live;
      await live.connect(
        {
          token: session.token,
          model: session.model,
          systemInstruction: session.systemInstruction,
          voiceName: session.voiceName,
          resumptionHandle: isReconnect ? handleRef.current : undefined,
        },
        buildEvents(isReconnect),
      );
    },
    [buildEvents],
  );

  /** Re-opens the socket (and microphone if needed) for the SAME lesson using the resumption handle. */
  const reconnect = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !handleRef.current) {
      await fail(new VoiceError('timeout'));
      return;
    }
    if (reconnectsRef.current >= MAX_AUTO_RECONNECTS + 2) {
      await fail(new VoiceError('timeout'));
      return;
    }
    reconnectsRef.current += 1;
    micRef.current?.setForwarding(false);
    playerRef.current?.interrupt();
    liveRef.current?.close();
    liveRef.current = null;
    setError(null);
    lastErrorRef.current = null;
    transition({ type: 'RECONNECTING' });
    try {
      if (!navigator.onLine) throw new VoiceError('offline');
      if (!playerRef.current) {
        playerRef.current = new AudioPlayer(playerCallbacks());
        await playerRef.current.init();
      }
      if (!micRef.current) {
        micRef.current = new MicCapture({
          onChunk: (b64) => liveRef.current?.sendAudio(b64),
          onTrackEnded: () => void fail(new VoiceError('mic_unavailable')),
        });
        await micRef.current.start();
        micRef.current.setMuted(false);
        setMuted(false);
      }
      await connectLive(session, true);
      // fail() stops the clock; restart it so the elapsed time and lesson limit keep working.
      if (!timerRef.current) startTimerRef.current?.(session.maxSeconds);
    } catch (err) {
      await fail(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectLive, fail, transition]);
  reconnectRef.current = reconnect;

  const playerCallbacks = useCallback(
    () => ({
      onPlaybackEnd: () => {
        if (stateRef.current === 'ai_speaking') transition({ type: 'AI_DONE' });
      },
      onError: (e: VoiceError) => {
        lastErrorRef.current = e;
        void fail(e);
      },
    }),
    [fail, transition],
  );

  const start = useCallback(
    async (request: LiveTokenRequest) => {
      if (!canStart(stateRef.current) || micRef.current || liveRef.current) return; // never two sessions/mics
      setError(null);
      setEndReason(null);
      setMuted(false);
      setElapsed(0);
      setInfo(null);
      sessionRef.current = null;
      handleRef.current = undefined;
      reconnectsRef.current = 0;
      lastErrorRef.current = null;
      endingRef.current = null;
      transcriptRef.current = null;
      setMessages([]);
      transition({ type: 'REQUEST_MIC' });

      try {
        if (!isVoiceSupported()) throw new VoiceError('unsupported');
        if (!navigator.onLine) throw new VoiceError('offline');

        // Both audio contexts are created inside the user's tap, satisfying mobile autoplay rules.
        const player = new AudioPlayer(playerCallbacks());
        playerRef.current = player;
        await player.init();

        const mic = new MicCapture({
          onChunk: (b64) => liveRef.current?.sendAudio(b64),
          onTrackEnded: () => void fail(new VoiceError('mic_unavailable')),
        });
        micRef.current = mic;
        await mic.start(); // browser permission prompt happens here
        transition({ type: 'MIC_READY' });

        const session = await requestLiveToken(request);
        sessionRef.current = session;
        startedAtRef.current = Date.now();
        setInfo({ sessionId: session.sessionId, topic: session.topic, level: session.level, maxSeconds: session.maxSeconds });

        await connectLive(session, false);

        startTimer(session.maxSeconds);
      } catch (err) {
        await fail(err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectLive, fail, playerCallbacks, transition],
  );

  const end = useCallback(
    (reason: EndResult['reason'] = 'user'): Promise<EndResult | null> => {
      if (endingRef.current) return endingRef.current;
      const s = stateRef.current;
      if (!isActive(s) && s !== 'error') return Promise.resolve(null);

      const run = async (): Promise<EndResult | null> => {
        transition({ type: 'END' });
        setEndReason(reason);
        clearTimers();
        transcriptRef.current?.finalizeCurrent();
        syncMessages();
        await releaseMedia();
        await Promise.allSettled([...pendingSavesRef.current]);

        const session = sessionRef.current;
        let finalize: FinalizeResult | null = null;
        if (session) finalize = await finalizeSession(session.sessionId);
        transition({ type: 'COMPLETED' });
        return session ? { sessionId: session.sessionId, finalize, reason } : null;
      };
      endingRef.current = run();
      return endingRef.current;
    },
    [clearTimers, releaseMedia, syncMessages, transition],
  );
  endRef.current = end;

  const toggleMute = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    const next = !mic.isMuted;
    mic.setMuted(next);
    setMuted(next);
  }, []);

  const reset = useCallback(() => {
    if (isActive(stateRef.current) || stateRef.current === 'ending') return;
    clearTimers();
    sessionRef.current = null;
    transcriptRef.current = null;
    endingRef.current = null;
    setMessages([]);
    setError(null);
    setInfo(null);
    setElapsed(0);
    stateRef.current = 'idle';
    setStateValue('idle');
  }, [clearTimers]);

  const getMicLevel = useCallback(() => micRef.current?.getLevel() ?? 0, []);
  const getAiLevel = useCallback(() => playerRef.current?.getLevel() ?? 0, []);

  // Mobile browsers suspend audio when the tab is hidden; resume when the student comes back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isActive(stateRef.current)) {
        void micRef.current?.resume();
        void playerRef.current?.resume();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Leaving the page ends the lesson: release the mic, close the socket, record usage.
  useEffect(() => {
    return () => {
      if (isActive(stateRef.current) || stateRef.current === 'error') void endRef.current?.('navigated');
      else clearTimers();
    };
  }, [clearTimers]);

  return {
    state,
    messages,
    error,
    muted,
    elapsed,
    info,
    endReason,
    start,
    end,
    reconnect,
    reset,
    toggleMute,
    getMicLevel,
    getAiLevel,
    canStart: canStart(state),
    hasResumableSession: Boolean(sessionRef.current && handleRef.current),
  };
}
