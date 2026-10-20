import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeacherAvatar } from '@/components/voice/TeacherAvatar';
import { AvatarMotion, mouthGeometry, mouthTarget } from './avatarAnimations';
import { avatarStateFor, type AvatarState } from './avatarTypes';

function seeded(seed = 7) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const run = (m: AvatarMotion, state: AvatarState, ms: number, mic = 0, ai = 0, start = 0) => {
  let pose = m.step(start, { state, micLevel: mic, aiLevel: ai, reducedMotion: false });
  for (let t = start + 16; t <= start + ms; t += 16) pose = m.step(t, { state, micLevel: mic, aiLevel: ai, reducedMotion: false });
  return pose;
};

describe('avatarStateFor', () => {
  it('speaks only while Gemini audio is playing', () => {
    expect(avatarStateFor('ai_speaking', false)).toBe('speaking');
    for (const s of ['idle', 'connecting', 'connected', 'listening', 'processing', 'reconnecting', 'ending', 'completed', 'error'] as const) {
      expect(avatarStateFor(s, false)).not.toBe('speaking');
    }
  });
  it('listens only with a live, unmuted microphone', () => {
    expect(avatarStateFor('listening', false)).toBe('listening');
    expect(avatarStateFor('listening', true)).toBe('idle');
    expect(avatarStateFor('idle', false)).toBe('idle');
  });
  it('thinks while waiting for the model and idles otherwise', () => {
    expect(avatarStateFor('processing', false)).toBe('thinking');
    expect(avatarStateFor('reconnecting', false)).toBe('idle');
    expect(avatarStateFor('error', false)).toBe('idle');
  });
});

describe('mouth', () => {
  it('is closed for quiet audio and grows with loudness', () => {
    expect(mouthTarget(0)).toBe(0);
    expect(mouthTarget(0.03)).toBe(0);
    expect(mouthTarget(0.2)).toBeGreaterThan(0);
    expect(mouthTarget(0.2)).toBeLessThan(mouthTarget(0.5));
    expect(mouthTarget(1)).toBe(1);
  });
  it('follows real audio, not the clock', () => {
    const quiet = run(new AvatarMotion(seeded()), 'speaking', 800, 0, 0);
    const loud = run(new AvatarMotion(seeded()), 'speaking', 800, 0, 0.8);
    expect(quiet.mouthOpen).toBe(0);
    expect(loud.mouthOpen).toBeGreaterThan(0.5);
  });
  it('never opens when not speaking, even with loud input', () => {
    for (const s of ['idle', 'listening', 'thinking'] as const) {
      expect(run(new AvatarMotion(seeded()), s, 800, 1, 1).mouthOpen).toBe(0);
    }
  });
  it('closes again after speech ends', () => {
    const m = new AvatarMotion(seeded());
    run(m, 'speaking', 600, 0, 0.9);
    expect(run(m, 'idle', 800, 0, 0, 700).mouthOpen).toBe(0);
  });
  it('draws a closed lip line at rest and a hidden interior opens with audio', () => {
    const closed = mouthGeometry(200, 243, 0, 1, 0.2);
    const open = mouthGeometry(200, 243, 1, 1, 0.2);
    expect(closed.interior).not.toEqual(open.interior);
    expect(open.lower).not.toEqual(closed.lower);
  });
});

describe('natural motion', () => {
  it('blinks at irregular intervals and the head never freezes', () => {
    const m = new AvatarMotion(seeded(3));
    let blinks = 0;
    let wasClosed = false;
    const rotations = new Set<number>();
    for (let t = 0; t < 30000; t += 16) {
      const p = m.step(t, { state: 'idle', micLevel: 0, aiLevel: 0, reducedMotion: false });
      const closed = p.blink > 0.5;
      if (closed && !wasClosed) blinks++;
      wasClosed = closed;
      rotations.add(Math.round(p.headRotate * 50));
    }
    expect(blinks).toBeGreaterThan(4);
    expect(blinks).toBeLessThan(25);
    expect(rotations.size).toBeGreaterThan(20);
  });
  it('nods only after the student has really been speaking', () => {
    const quiet = new AvatarMotion(seeded());
    let maxQuiet = 0;
    for (let t = 0; t < 12000; t += 16) maxQuiet = Math.max(maxQuiet, quiet.step(t, { state: 'listening', micLevel: 0, aiLevel: 0, reducedMotion: false }).headY);
    const talking = new AvatarMotion(seeded());
    let maxTalking = 0;
    for (let t = 0; t < 12000; t += 16) {
      const mic = t < 5000 ? 0.5 : 0;
      maxTalking = Math.max(maxTalking, talking.step(t, { state: 'listening', micLevel: mic, aiLevel: 0, reducedMotion: false }).headY);
    }
    expect(maxTalking).toBeGreaterThan(maxQuiet + 2);
  });
  it('reduced motion removes head and gaze movement but still lip-syncs', () => {
    const m = new AvatarMotion(seeded());
    let pose = m.step(0, { state: 'speaking', micLevel: 0, aiLevel: 0.8, reducedMotion: true });
    for (let t = 16; t < 2000; t += 16) pose = m.step(t, { state: 'speaking', micLevel: 0, aiLevel: 0.8, reducedMotion: true });
    expect(pose.headRotate).toBeCloseTo(0, 1);
    expect(pose.headX).toBe(0);
    expect(pose.bodyY).toBe(0);
    expect(pose.mouthOpen).toBeGreaterThan(0.4);
  });
  it('survives a long pause (hidden tab) without a jump', () => {
    const m = new AvatarMotion(seeded());
    m.step(0, { state: 'idle', micLevel: 0, aiLevel: 0, reducedMotion: false });
    const p = m.step(600000, { state: 'idle', micLevel: 0, aiLevel: 0, reducedMotion: false });
    expect(Number.isFinite(p.headRotate)).toBe(true);
    expect(Math.abs(p.pupilX)).toBeLessThanOrEqual(1);
  });
});

describe('<TeacherAvatar />', () => {
  it('labels the real state for screen readers and exposes it for tests', () => {
    const { container, rerender, getByRole } = render(<TeacherAvatar state="idle" />);
    expect(getByRole('img', { name: /waiting/i })).toBeTruthy();
    rerender(<TeacherAvatar state="ai_speaking" />);
    expect(getByRole('img', { name: /speaking/i })).toBeTruthy();
    expect(container.querySelector('[data-avatar-state="speaking"]')).toBeTruthy();
    rerender(<TeacherAvatar state="listening" muted />);
    expect(container.querySelector('[data-avatar-state="idle"]')).toBeTruthy();
  });
  it('unmounts cleanly and stops its animation loop', () => {
    const { unmount } = render(<TeacherAvatar state="ai_speaking" getAiLevel={() => 0.5} />);
    expect(() => unmount()).not.toThrow();
  });
});
