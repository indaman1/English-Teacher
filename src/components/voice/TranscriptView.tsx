import { useEffect, useRef } from 'react';
import type { TranscriptMessage } from '@/features/voice/transcriptBuffer';
import { cn } from '@/lib/utils';

interface TranscriptViewProps {
  messages: Pick<TranscriptMessage, 'id' | 'role' | 'text' | 'final'>[];
  className?: string;
  emptyText?: string;
}

export function TranscriptView({ messages, className, emptyText }: TranscriptViewProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div role="log" aria-live="polite" aria-label="Conversation transcript" className={cn('space-y-3 overflow-y-auto', className)}>
      {messages.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          {emptyText ?? 'Your conversation will appear here as you speak. Transcripts are generated automatically and can contain mistakes.'}
        </p>
      ) : (
        messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'student' ? 'justify-end' : 'justify-start')}>
            <div
              data-role={m.role}
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                m.role === 'student' ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-800',
                !m.final && 'opacity-80',
              )}
            >
              <span className="sr-only">{m.role === 'student' ? 'You: ' : 'Teacher: '}</span>
              {m.text}
            </div>
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
