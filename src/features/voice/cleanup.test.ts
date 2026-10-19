import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicCapture } from './audioCapture';
import { AudioPlayer } from './audioPlayer';
import { int16ToBase64 } from './pcm';

// Minimal Web Audio / MediaStream fakes so we can verify that resources are released.
const created: { ctx: FakeContext[]; tracks: FakeTrack[]; sources: FakeSource[] } = { ctx: [], tracks: [], sources: [] };

class FakeTrack {
  enabled = true;
  stopped = false;
  onended: (() => void) | null = null;
  stop() {
    this.stopped = true;
  }
}

class FakeNode {
  port = { onmessage: null as unknown, postMessage: vi.fn() };
  gain = { value: 1 };
  fftSize = 0;
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  getFloatTimeDomainData(a: Float32Array) {
    a.fill(0);
  }
}

class FakeSource {
  stopped = false;
  onended: (() => void) | null = null;
  buffer: unknown = null;
  connect() {}
  disconnect() {}
  start() {}
  stop() {
    this.stopped = true;
  }
}

class FakeContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  constructor() {
    created.ctx.push(this);
  }
  createMediaStreamSource() {
    return new FakeNode();
  }
  createAnalyser() {
    return new FakeNode();
  }
  createGain() {
    return new FakeNode();
  }
  createBuffer(_c: number, length: number, rate: number) {
    return { duration: length / rate, copyToChannel: vi.fn() };
  }
  createBufferSource() {
    const s = new FakeSource();
    created.sources.push(s);
    return s;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

beforeEach(() => {
  created.ctx = [];
  created.tracks = [];
  created.sources = [];
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeNode);
  vi.stubGlobal('WebSocket', class {});
  const getUserMedia = vi.fn(async () => {
    const t = new FakeTrack();
    created.tracks.push(t);
    return { getTracks: () => [t], getAudioTracks: () => [t] };
  });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MicCapture cleanup', () => {
  it('stops every microphone track and closes the AudioContext', async () => {
    const mic = new MicCapture({ onChunk: vi.fn() });
    await mic.start();
    expect(mic.isRunning).toBe(true);
    await mic.stop();
    expect(created.tracks.every((t) => t.stopped)).toBe(true);
    expect(created.ctx[0].state).toBe('closed');
    expect(mic.isRunning).toBe(false);
  });

  it('refuses to start a second microphone while one is running', async () => {
    const mic = new MicCapture({ onChunk: vi.fn() });
    await mic.start();
    await expect(mic.start()).rejects.toThrow();
    expect(created.tracks).toHaveLength(1);
    await mic.stop();
  });

  it('is safe to stop twice', async () => {
    const mic = new MicCapture({ onChunk: vi.fn() });
    await mic.start();
    await mic.stop();
    await expect(mic.stop()).resolves.toBeUndefined();
  });

  it('turns permission denial into a friendly error and leaves nothing running', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) },
      configurable: true,
    });
    const mic = new MicCapture({ onChunk: vi.fn() });
    await expect(mic.start()).rejects.toMatchObject({ code: 'mic_denied' });
    expect(mic.isRunning).toBe(false);
    expect(created.ctx).toHaveLength(0);
  });

  it('does not send audio until forwarding is turned on, and not while muted', async () => {
    const onChunk = vi.fn();
    const mic = new MicCapture({ onChunk });
    await mic.start();
    // Reach into the worklet message handler the same way the browser would.
    const node = (mic as unknown as { node: FakeNode }).node;
    const handler = node.port.onmessage as (e: { data: Float32Array }) => void;
    const chunk = new Float32Array(1920).fill(0.1);

    handler({ data: chunk });
    expect(onChunk).not.toHaveBeenCalled(); // not forwarding yet

    mic.setForwarding(true);
    handler({ data: chunk });
    expect(onChunk).toHaveBeenCalledTimes(1);

    mic.setMuted(true);
    handler({ data: chunk });
    expect(onChunk).toHaveBeenCalledTimes(1); // muted: nothing sent
    expect(created.tracks[0].enabled).toBe(false);
    await mic.stop();
  });
});

describe('AudioPlayer', () => {
  const chunk = int16ToBase64(new Int16Array(2400).fill(1000));

  it('plays queued chunks and reports start/end', async () => {
    const onPlaybackStart = vi.fn();
    const onPlaybackEnd = vi.fn();
    const player = new AudioPlayer({ onPlaybackStart, onPlaybackEnd });
    await player.init();
    player.enqueue(chunk);
    player.enqueue(chunk);
    expect(onPlaybackStart).toHaveBeenCalledTimes(1);
    expect(created.sources).toHaveLength(2);
    expect(player.isPlaying).toBe(true);
    await player.close();
  });

  it('interrupt() stops everything immediately (barge-in)', async () => {
    const onPlaybackEnd = vi.fn();
    const player = new AudioPlayer({ onPlaybackEnd });
    await player.init();
    player.enqueue(chunk);
    player.enqueue(chunk);
    player.interrupt();
    expect(created.sources.every((s) => s.stopped)).toBe(true);
    expect(player.isPlaying).toBe(false);
    expect(onPlaybackEnd).toHaveBeenCalledTimes(1);
    await player.close();
  });

  it('closes its AudioContext and ignores audio after close', async () => {
    const player = new AudioPlayer();
    await player.init();
    await player.close();
    expect(created.ctx[0].state).toBe('closed');
    player.enqueue(chunk);
    expect(created.sources).toHaveLength(0);
  });

  it('caps queued audio so memory cannot grow without bound', async () => {
    const player = new AudioPlayer();
    await player.init();
    const oneSecond = int16ToBase64(new Int16Array(24000).fill(500));
    for (let i = 0; i < 100; i++) player.enqueue(oneSecond);
    expect(created.sources.length).toBeLessThanOrEqual(32);
    await player.close();
  });
});
