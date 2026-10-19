import { GraduationCap } from 'lucide-react';
import type { VoiceState } from '@/features/voice/voiceStateMachine';
import { cn } from '@/lib/utils';

export function TeacherAvatar({ state }: { state: VoiceState }) {
  const speaking = state === 'ai_speaking';
  const listening = state === 'listening';
  const busy = state === 'processing' || state === 'connecting' || state === 'reconnecting';

  return (
    <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
      {speaking && (
        <>
          <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-violet-400/40" />
          <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-violet-400/30 [animation-delay:600ms]" />
        </>
      )}
      {listening && <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-emerald-400/30" />}
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-brand-500 via-brand-600 to-violet-600 text-white shadow-glow transition-transform duration-500',
          speaking && 'scale-105',
          busy && 'animate-pulse',
        )}
      >
        <GraduationCap className="h-16 w-16 sm:h-20 sm:w-20" aria-hidden />
      </div>
    </div>
  );
}
