import { VoiceError } from './errors';
import { OUTPUT_SAMPLE_RATE, base64ToInt16, int16ToFloat32 } from './pcm';

export interface AudioPlayerOptions {
  /** Fired when the first chunk of a response starts playing. */
  onPlaybackStart?: () => void;
  /** Fired when everything queued has finished playing (or was interrupted). */
  onPlaybackEnd?: () => void;
  onError?: (err: VoiceError) => void;
}

/** Hard cap on how much audio may be queued ahead, so a stalled tab cannot grow memory unbounded. */
const MAX_QUEUE_SECONDS = 30;

/**
 * Gapless streaming playback of 24 kHz PCM16 chunks.
 * Chunks are scheduled back-to-back on the AudioContext clock; interrupt() cancels everything instantly.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuffer: Float32Array<ArrayBuffer> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private playing = false;

  constructor(private readonly options: AudioPlayerOptions = {}) {}

  /** Must be called from a user gesture (the Start button) so mobile autoplay rules allow audio. */
  async init(): Promise<void> {
    if (this.ctx) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      ctx = new AudioContext({ latencyHint: 'interactive' }); // buffers are resampled automatically
    }
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.levelBuffer = new Float32Array(this.analyser.fftSize);
    this.gain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    if (ctx.state === 'suspended') await ctx.resume();
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  enqueue(base64Pcm: string): void {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const samples = int16ToFloat32(base64ToInt16(base64Pcm));
      if (!samples.length) return;

      const now = ctx.currentTime;
      if (this.nextStart - now > MAX_QUEUE_SECONDS) return; // drop rather than grow without bound

      const buffer = ctx.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.gain);

      const startAt = Math.max(this.nextStart, now + 0.03);
      this.nextStart = startAt + buffer.duration;
      this.sources.add(src);
      src.onended = () => {
        this.sources.delete(src);
        src.disconnect();
        if (this.sources.size === 0) this.finish();
      };
      src.start(startAt);

      if (!this.playing) {
        this.playing = true;
        this.options.onPlaybackStart?.();
      }
    } catch {
      this.options.onError?.(new VoiceError('playback'));
    }
  }

  /** Barge-in: stop everything that is playing or queued, immediately. */
  interrupt(): void {
    for (const src of this.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
    this.sources.clear();
    this.nextStart = 0;
    this.finish();
  }

  getLevel(): number {
    if (!this.analyser || !this.levelBuffer || !this.playing) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    let sum = 0;
    for (let i = 0; i < this.levelBuffer.length; i++) sum += this.levelBuffer[i] * this.levelBuffer[i];
    return Math.min(1, Math.sqrt(sum / this.levelBuffer.length) * 5);
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined);
  }

  async close(): Promise<void> {
    this.interrupt();
    const ctx = this.ctx;
    this.ctx = null;
    this.gain?.disconnect();
    this.analyser?.disconnect();
    this.gain = null;
    this.analyser = null;
    this.levelBuffer = null;
    if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => undefined);
  }

  private finish(): void {
    if (!this.playing) return;
    this.playing = false;
    this.options.onPlaybackEnd?.();
  }
}
