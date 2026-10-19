import { VoiceError, fromMediaError } from './errors';
import { INPUT_SAMPLE_RATE, downsample, floatTo16BitPCM, int16ToBase64, rms } from './pcm';

export interface MicCaptureOptions {
  /** Called with base64 16 kHz PCM16 chunks (~40 ms each) while forwarding is on and not muted. */
  onChunk: (base64Pcm: string) => void;
  /** Called if the microphone disappears mid-session (unplugged, permission revoked). */
  onTrackEnded?: () => void;
}

export function isVoiceSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebSocket !== 'undefined'
  );
}

/** Real microphone capture: getUserMedia → AudioWorklet → downsample → PCM16. */
export class MicCapture {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sink: GainNode | null = null;
  private levelBuffer: Float32Array<ArrayBuffer> | null = null;
  private muted = false;
  private forwarding = false;

  constructor(private readonly options: MicCaptureOptions) {}

  get isRunning(): boolean {
    return this.stream !== null;
  }

  async start(): Promise<void> {
    if (this.stream) throw new VoiceError('unknown', 'Microphone is already running.'); // no duplicate mics
    if (!isVoiceSupported()) throw new VoiceError('unsupported');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      throw fromMediaError(err);
    }
    this.stream = stream;

    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-capture-worklet.js`);
      if (ctx.state === 'suspended') await ctx.resume();

      this.source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.levelBuffer = new Float32Array(this.analyser.fftSize);
      this.node = new AudioWorkletNode(ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      // Some browsers only run a worklet that reaches the destination. A zero-gain sink avoids feedback.
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;

      this.source.connect(this.analyser);
      this.source.connect(this.node);
      this.node.connect(this.sink);
      this.sink.connect(ctx.destination);

      const inputRate = ctx.sampleRate;
      this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (!this.forwarding || this.muted) return;
        const pcm = floatTo16BitPCM(downsample(e.data, inputRate, INPUT_SAMPLE_RATE));
        if (pcm.length) this.options.onChunk(int16ToBase64(pcm));
      };

      stream.getAudioTracks().forEach((t) => {
        t.onended = () => this.options.onTrackEnded?.();
      });
    } catch (err) {
      await this.stop();
      throw err instanceof VoiceError ? err : new VoiceError('unsupported');
    }
  }

  /** Start/stop sending audio to the model. The mic can be open while we are still connecting. */
  setForwarding(on: boolean): void {
    this.forwarding = on;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** 0..1 input level for the visualizer; 0 when muted or stopped. */
  getLevel(): number {
    if (!this.analyser || !this.levelBuffer || this.muted) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuffer);
    return Math.min(1, rms(this.levelBuffer) * 6);
  }

  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined);
  }

  /** Releases the microphone, worklet and AudioContext. Safe to call more than once. */
  async stop(): Promise<void> {
    this.forwarding = false;
    if (this.node) this.node.port.onmessage = null;
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    for (const n of [this.node, this.source, this.analyser, this.sink]) {
      try {
        n?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    const ctx = this.ctx;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.analyser = null;
    this.sink = null;
    this.levelBuffer = null;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => undefined);
  }
}
