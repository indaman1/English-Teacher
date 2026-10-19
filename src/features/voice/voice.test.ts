import { describe, expect, it } from 'vitest';
import { base64ToInt16, downsample, floatTo16BitPCM, int16ToBase64, int16ToFloat32, rms } from './pcm';
import { STATE_LABELS, canStart, isActive, isMicLive, voiceReducer, type VoiceEvent, type VoiceState } from './voiceStateMachine';
import { TranscriptBuffer } from './transcriptBuffer';
import { VoiceError, fromLiveClose, fromMediaError, fromTokenFailure } from './errors';

describe('PCM helpers', () => {
  it('converts float samples to clamped 16-bit PCM', () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1, 2, -2, 0.5]));
    expect(Array.from(out)).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });

  it('round-trips PCM16 through base64 without loss', () => {
    const samples = new Int16Array([0, 1, -1, 12345, -12345, 32767, -32768]);
    expect(Array.from(base64ToInt16(int16ToBase64(samples)))).toEqual(Array.from(samples));
  });

  it('handles large buffers when encoding base64 (no call-stack overflow)', () => {
    const big = new Int16Array(200_000).map((_, i) => (i % 2000) - 1000);
    const back = base64ToInt16(int16ToBase64(big));
    expect(back.length).toBe(big.length);
    expect(back[123456]).toBe(big[123456]);
  });

  it('converts int16 back to floats in [-1, 1)', () => {
    const f = int16ToFloat32(new Int16Array([0, 16384, -32768]));
    expect(f[0]).toBe(0);
    expect(f[1]).toBeCloseTo(0.5, 5);
    expect(f[2]).toBe(-1);
  });

  it('downsamples 48 kHz to 16 kHz keeping the right length and averaging', () => {
    const input = new Float32Array(480).fill(0.6);
    const out = downsample(input, 48000, 16000);
    expect(out.length).toBe(160);
    expect(out[10]).toBeCloseTo(0.6, 5);
  });

  it('returns the same buffer when the rate already matches and rejects upsampling', () => {
    const input = new Float32Array(10);
    expect(downsample(input, 16000, 16000)).toBe(input);
    expect(() => downsample(input, 8000, 16000)).toThrow();
  });

  it('drops a dangling odd byte instead of throwing', () => {
    expect(base64ToInt16(btoa('\x01\x00\x02')).length).toBe(1);
  });

  it('computes RMS level', () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5, 5);
  });
});

function run(events: VoiceEvent['type'][], from: VoiceState = 'idle'): VoiceState {
  return events.reduce<VoiceState>((s, type) => voiceReducer(s, { type } as VoiceEvent), from);
}

describe('voice state machine', () => {
  it('follows the happy path', () => {
    expect(run(['REQUEST_MIC'])).toBe('requesting_mic');
    expect(run(['REQUEST_MIC', 'MIC_READY'])).toBe('connecting');
    expect(run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN'])).toBe('connected');
    expect(run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN', 'LISTENING'])).toBe('listening');
    expect(run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN', 'LISTENING', 'PROCESSING', 'AI_AUDIO'])).toBe('ai_speaking');
    expect(run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN', 'LISTENING', 'AI_AUDIO', 'AI_DONE'])).toBe('listening');
  });

  it('supports barge-in (interrupt) then returns to listening', () => {
    const s = run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN', 'LISTENING', 'AI_AUDIO', 'INTERRUPTED']);
    expect(s).toBe('interrupted');
    expect(voiceReducer(s, { type: 'LISTENING' })).toBe('listening');
  });

  it('prevents a second session while one is active (no duplicate microphones)', () => {
    const active: VoiceState[] = ['requesting_mic', 'connecting', 'connected', 'listening', 'processing', 'ai_speaking', 'interrupted', 'reconnecting', 'ending'];
    for (const s of active) {
      expect(canStart(s)).toBe(false);
      expect(voiceReducer(s, { type: 'REQUEST_MIC' })).toBe(s);
    }
    expect(canStart('idle')).toBe(true);
    expect(canStart('error')).toBe(true);
    expect(canStart('completed')).toBe(true);
  });

  it('reconnects and returns to listening', () => {
    const s = run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN', 'LISTENING', 'RECONNECTING']);
    expect(s).toBe('reconnecting');
    const reopened = voiceReducer(s, { type: 'SESSION_OPEN' });
    expect(reopened).toBe('connected');
    expect(voiceReducer(reopened, { type: 'LISTENING' })).toBe('listening');
    expect(voiceReducer(s, { type: 'RECONNECTED' })).toBe('listening');
  });

  it('allows a manual reconnect after an error', () => {
    expect(voiceReducer('error', { type: 'RECONNECTING' })).toBe('reconnecting');
  });

  it('ending goes ending → completed, and END from idle is a no-op', () => {
    expect(run(['REQUEST_MIC', 'MIC_READY', 'SESSION_OPEN', 'END', 'COMPLETED'])).toBe('completed');
    expect(voiceReducer('idle', { type: 'END' })).toBe('idle');
  });

  it('errors from any active state, but never from idle/completed', () => {
    expect(voiceReducer('listening', { type: 'ERROR' })).toBe('error');
    expect(voiceReducer('connecting', { type: 'ERROR' })).toBe('error');
    expect(voiceReducer('idle', { type: 'ERROR' })).toBe('idle');
    expect(voiceReducer('completed', { type: 'ERROR' })).toBe('completed');
  });

  it('only reports the microphone as live when a session really is running', () => {
    expect(isMicLive('idle')).toBe(false);
    expect(isMicLive('requesting_mic')).toBe(false);
    expect(isMicLive('connecting')).toBe(false);
    expect(isMicLive('error')).toBe(false);
    expect(isMicLive('completed')).toBe(false);
    expect(isMicLive('listening')).toBe(true);
    expect(isMicLive('ai_speaking')).toBe(true);
    expect(isActive('ending')).toBe(false);
  });

  it('has a label for every state', () => {
    const states: VoiceState[] = ['idle', 'requesting_mic', 'connecting', 'connected', 'listening', 'processing', 'ai_speaking', 'interrupted', 'reconnecting', 'ending', 'completed', 'error'];
    for (const s of states) expect(STATE_LABELS[s]).toBeTruthy();
  });
});

describe('TranscriptBuffer', () => {
  it('assembles streamed fragments into one bubble per speaker turn', () => {
    const finals: string[] = [];
    const b = new TranscriptBuffer((m) => finals.push(`${m.role}:${m.text}`));
    b.push('student', 'I go ');
    b.push('student', 'market yesterday.');
    b.push('teacher', 'Good try! ');
    b.push('teacher', 'A better sentence is: I went to the market yesterday.');
    b.finalizeCurrent();
    expect(finals).toEqual(['student:I go market yesterday.', 'teacher:Good try! A better sentence is: I went to the market yesterday.']);
    expect(b.snapshot().map((m) => m.role)).toEqual(['student', 'teacher']);
    expect(b.snapshot().every((m) => m.final)).toBe(true);
  });

  it('keeps sequence numbers increasing and ignores empty fragments', () => {
    const b = new TranscriptBuffer();
    b.push('student', '');
    b.push('student', 'Hello');
    b.finalizeCurrent();
    b.push('teacher', 'Hi');
    b.finalizeCurrent();
    expect(b.snapshot().map((m) => m.seq)).toEqual([0, 1]);
  });

  it('marks the in-progress bubble as not final', () => {
    const b = new TranscriptBuffer();
    b.push('teacher', 'Hello');
    expect(b.snapshot()[0].final).toBe(false);
  });

  it('drops whitespace-only bubbles when finalizing', () => {
    const b = new TranscriptBuffer();
    b.push('student', '   ');
    b.finalizeCurrent();
    expect(b.snapshot()).toHaveLength(0);
  });
});

describe('voice error mapping', () => {
  it('maps microphone permission and device errors to friendly messages', () => {
    expect(fromMediaError({ name: 'NotAllowedError' }).code).toBe('mic_denied');
    expect(fromMediaError({ name: 'NotAllowedError' }).message).toMatch(/allow microphone access/i);
    expect(fromMediaError({ name: 'NotFoundError' }).code).toBe('mic_unavailable');
    expect(fromMediaError(new Error('weird')).code).toBe('unknown');
  });

  it('maps Live API close reasons without leaking raw text', () => {
    expect(fromLiveClose('RESOURCE_EXHAUSTED: quota exceeded').code).toBe('quota');
    expect(fromLiveClose('Deadline expired before operation could complete').code).toBe('timeout');
    expect(fromLiveClose('API key not valid').code).toBe('auth');
    const unknown = fromLiveClose('internal secret stack trace at line 42');
    expect(unknown.code).toBe('connection_lost');
    expect(unknown.message).not.toMatch(/stack|secret|line 42/);
  });

  it('maps token endpoint failures', () => {
    expect(fromTokenFailure(429, 'limit_reached').code).toBe('limit_reached');
    expect(fromTokenFailure(429, 'rate_limited').code).toBe('rate_limited');
    expect(fromTokenFailure(401, 'unauthorized').code).toBe('auth');
    expect(fromTokenFailure(502, 'upstream_error').code).toBe('upstream');
  });

  it('marks transient errors retryable and permanent ones not', () => {
    expect(new VoiceError('connection_lost').retryable).toBe(true);
    expect(new VoiceError('mic_denied').retryable).toBe(false);
    expect(new VoiceError('limit_reached').retryable).toBe(false);
  });
});
