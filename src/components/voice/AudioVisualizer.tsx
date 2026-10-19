import { useEffect, useRef } from 'react';
import { isMicLive, type VoiceState } from '@/features/voice/voiceStateMachine';
import { cn } from '@/lib/utils';

interface AudioVisualizerProps {
  state: VoiceState;
  muted: boolean;
  /** Real microphone level (0..1) from an AnalyserNode. */
  getMicLevel: () => number;
  /** Real playback level (0..1) from the speaker AnalyserNode. */
  getAiLevel: () => number;
  className?: string;
  bars?: number;
}

/**
 * The bars are driven ONLY by real analyser levels. When no microphone/session is active the bars
 * stay flat and grey, so the UI can never pretend the teacher is listening.
 */
export function AudioVisualizer({ state, muted, getMicLevel, getAiLevel, className, bars = 28 }: AudioVisualizerProps) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const smoothed = useRef(0);

  const source: 'ai' | 'mic' | 'none' = state === 'ai_speaking' ? 'ai' : isMicLive(state) && !muted ? 'mic' : 'none';

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const raw = source === 'ai' ? getAiLevel() : source === 'mic' ? getMicLevel() : 0;
      smoothed.current += (raw - smoothed.current) * 0.35;
      const level = smoothed.current;
      for (let i = 0; i < bars; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        const shape = 0.45 + 0.55 * Math.abs(Math.sin(t / 220 + i * 0.55));
        const centre = 1 - Math.abs(i - bars / 2) / (bars / 2) * 0.55; // taller in the middle
        const h = 4 + level * 64 * shape * centre;
        el.style.height = `${h.toFixed(1)}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, getMicLevel, getAiLevel, bars]);

  return (
    <div
      role="img"
      aria-label={source === 'ai' ? 'Teacher is speaking' : source === 'mic' ? 'Microphone is live' : 'Audio is idle'}
      className={cn('flex h-20 items-center justify-center gap-[3px]', className)}
      data-source={source}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          style={{ height: 4 }}
          className={cn(
            'w-[4px] rounded-full transition-colors duration-300',
            source === 'ai' ? 'bg-violet-500' : source === 'mic' ? 'bg-emerald-500' : 'bg-slate-300',
          )}
        />
      ))}
    </div>
  );
}
