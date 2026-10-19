// Accumulates streaming transcription fragments into whole chat bubbles.
// Live API sends the student's and the teacher's transcription as incremental pieces.

export interface TranscriptMessage {
  id: string;
  role: 'student' | 'teacher';
  text: string;
  /** false while fragments are still arriving */
  final: boolean;
  seq: number;
}

export class TranscriptBuffer {
  private messages: TranscriptMessage[] = [];
  private seq = 0;
  private current: TranscriptMessage | null = null;

  constructor(private readonly onFinal?: (msg: TranscriptMessage) => void) {}

  /** Add a fragment for a speaker. Switching speakers finalizes the previous bubble. */
  push(role: TranscriptMessage['role'], fragment: string): void {
    if (!fragment) return;
    if (this.current && this.current.role !== role) this.finalizeCurrent();
    if (!this.current) {
      this.current = { id: `m${this.seq}`, role, text: '', final: false, seq: this.seq++ };
      this.messages.push(this.current);
    }
    this.current.text = joinFragment(this.current.text, fragment);
  }

  /** Finalize the in-progress bubble (turn complete, interruption or end of session). */
  finalizeCurrent(): void {
    if (!this.current) return;
    this.current.text = this.current.text.trim();
    this.current.final = true;
    const done = this.current;
    this.current = null;
    if (!done.text) {
      this.messages = this.messages.filter((m) => m !== done);
      return;
    }
    this.onFinal?.(done);
  }

  /** Immutable snapshot for React rendering. */
  snapshot(): TranscriptMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }

  reset(): void {
    this.messages = [];
    this.current = null;
    this.seq = 0;
  }
}

function joinFragment(existing: string, fragment: string): string {
  if (!existing) return fragment.replace(/^\s+/, '');
  // The API usually includes its own spacing. Only add one if both sides lack it.
  const needsSpace = !/\s$/.test(existing) && !/^[\s.,!?;:'’)]/.test(fragment);
  return needsSpace && /[.!?]$/.test(existing) ? `${existing} ${fragment}` : existing + fragment;
}
