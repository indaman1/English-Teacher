import type { MotionInput, Pose } from './avatarTypes';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Frame-rate independent exponential smoothing. */
const ease = (current: number, target: number, dtMs: number, tauMs: number) => current + (target - current) * (1 - Math.exp(-dtMs / tauMs));

/** Converts a 0..1 audio level to mouth openness. Quiet audio keeps the mouth closed; loud opens it wider. */
export function mouthTarget(level: number): number {
  const x = clamp((level - 0.05) / 0.6, 0, 1);
  return Math.pow(x, 0.75);
}

/**
 * Turns real state + real audio levels into a pose, one frame at a time.
 * Pure (no DOM) so it can be unit tested with a seeded random source.
 * Randomness only schedules blinks, glances and nods; the mouth is driven by the audio level alone.
 */
export class AvatarMotion {
  private last = -1;
  private blinkAt: number;
  private blinkStart = -1;
  private gazeAt = 0;
  private gazeX = 0;
  private gazeY = 0;
  private pupilX = 0;
  private pupilY = 0;
  private mouth = 0;
  private smile = 0.2;
  private brow = 0;
  private browTilt = 0;
  private tilt = 0;
  private micSmooth = 0;
  private aiSlow = 0;
  private aiFast = 0;
  private speechMs = 0;
  private nodAt = -1;
  private nodStart = -1;
  private lastNod = 0;
  private widthWobble = 1;

  constructor(private readonly rng: () => number = Math.random) {
    this.blinkAt = 1200 + rng() * 2500;
  }

  private between(a: number, b: number) {
    return a + this.rng() * (b - a);
  }

  step(now: number, input: MotionInput): Pose {
    const dt = this.last < 0 ? 16 : clamp(now - this.last, 0, 64); // clamp so a paused tab never causes a jump
    this.last = now;
    const { state, reducedMotion } = input;
    const t = now / 1000;
    const move = reducedMotion ? 0 : 1;

    // ---- blinking: irregular, sometimes a quick double blink ----
    if (this.blinkStart < 0 && now >= this.blinkAt) this.blinkStart = now;
    let blink = 0;
    if (this.blinkStart >= 0) {
      const p = (now - this.blinkStart) / 140;
      if (p >= 1) {
        this.blinkStart = -1;
        this.blinkAt = now + (this.rng() < 0.18 ? 170 : this.between(state === 'speaking' ? 2200 : 2800, state === 'speaking' ? 5200 : 6500));
      } else {
        blink = Math.sin(Math.PI * p);
      }
    }

    // ---- eye movement: small glances, state dependent ----
    if (move && now >= this.gazeAt) {
      switch (state) {
        case 'thinking':
          this.gazeX = this.between(-0.9, -0.4);
          this.gazeY = this.between(-0.9, -0.3);
          this.gazeAt = now + this.between(1100, 2200);
          break;
        case 'listening':
          this.gazeX = this.between(-0.25, 0.25);
          this.gazeY = this.between(-0.1, 0.15);
          this.gazeAt = now + this.between(2500, 5000);
          break;
        case 'speaking':
          this.gazeX = this.between(-0.4, 0.4);
          this.gazeY = this.between(-0.2, 0.2);
          this.gazeAt = now + this.between(1500, 3500);
          break;
        default:
          this.gazeX = this.between(-0.7, 0.7);
          this.gazeY = this.between(-0.3, 0.3);
          this.gazeAt = now + this.between(1800, 4500);
      }
    }
    if (!move) {
      this.gazeX = 0;
      this.gazeY = 0;
    }
    this.pupilX = ease(this.pupilX, this.gazeX, dt, 70);
    this.pupilY = ease(this.pupilY, this.gazeY, dt, 70);

    // ---- audio levels ----
    this.micSmooth = ease(this.micSmooth, state === 'listening' ? input.micLevel : 0, dt, 120);
    const ai = state === 'speaking' ? input.aiLevel : 0;
    this.aiFast = ease(this.aiFast, ai, dt, 60);
    this.aiSlow = ease(this.aiSlow, ai, dt, 700);

    // ---- mouth: only while the model's audio is really playing ----
    const target = state === 'speaking' ? mouthTarget(input.aiLevel) : 0;
    const tau = target > this.mouth ? 35 : 90; // opens fast, closes a little slower
    this.mouth = ease(this.mouth, target, dt, tau);
    if (this.mouth < 0.01) this.mouth = 0;
    // vary the mouth *shape* (wide "ee" vs rounded "oo") so it is not just open/close
    const viseme = 0.5 + 0.5 * Math.sin(t * 9 + Math.sin(t * 3.7) * 2);
    this.widthWobble = ease(this.widthWobble, 1 - 0.26 * viseme * this.mouth, dt, 50);

    // ---- nods: only after the student has really been speaking ----
    if (state === 'listening' && move) {
      if (this.micSmooth > 0.12) this.speechMs += dt;
      else if (this.micSmooth < 0.05 && this.speechMs > 900 && this.nodAt < 0) {
        this.nodAt = now + 260; // acknowledge when the student pauses
        this.speechMs = 0;
      }
      if (this.speechMs > 3000 && now - this.lastNod > 4500) {
        this.nodAt = now; // small backchannel nod during a long answer
        this.speechMs = 1200;
      }
    } else {
      this.speechMs = 0;
      this.nodAt = -1;
    }
    if (this.nodAt >= 0 && now >= this.nodAt) {
      this.nodStart = now;
      this.nodAt = -1;
      this.lastNod = now;
    }
    let nod = 0;
    if (this.nodStart >= 0) {
      const p = (now - this.nodStart) / 700;
      if (p >= 1) this.nodStart = -1;
      else nod = Math.sin(Math.PI * p);
    }

    // ---- head, breathing ----
    const tiltTarget = state === 'listening' ? 2.6 : state === 'thinking' ? -3.2 : 0;
    this.tilt = ease(this.tilt, tiltTarget * move, dt, 450);
    const sway = state === 'speaking' ? 1.15 : state === 'thinking' ? 0.8 : state === 'listening' ? 0.5 : 0.7;
    const emphasis = Math.max(0, this.aiFast - this.aiSlow); // speech peaks → tiny emphasis movements
    const headRotate = move * (sway * (1.1 * Math.sin(t * 0.53) + 0.6 * Math.sin(t * 0.91 + 1.3)) + emphasis * 2.2 * Math.sin(t * 3.1)) + this.tilt;
    const headX = move * sway * 1.6 * Math.sin(t * 0.37 + 0.6);
    const headY = move * (sway * 1.2 * Math.sin(t * 0.43 + 2.1) + nod * 5.5 + emphasis * 2.5);
    const bodyY = move * 1.7 * Math.sin((t * Math.PI * 2) / 4.2);

    // ---- expression ----
    const smileTarget = state === 'thinking' ? 0.02 : state === 'speaking' ? 0.32 + 0.25 * this.aiSlow : state === 'listening' ? 0.3 : 0.22;
    this.smile = ease(this.smile, smileTarget, dt, 320);
    const browTarget =
      state === 'thinking' ? 0.5 : state === 'listening' ? 0.3 + 0.35 * this.micSmooth : state === 'speaking' ? 0.1 + 1.2 * emphasis : 0;
    this.brow = ease(this.brow, clamp(browTarget, 0, 1), dt, 140);
    this.browTilt = ease(this.browTilt, state === 'thinking' ? 0.7 : 0, dt, 260);

    return {
      headRotate,
      headX,
      headY,
      bodyY,
      blink,
      pupilX: this.pupilX,
      pupilY: this.pupilY,
      mouthOpen: this.mouth,
      mouthWidth: state === 'thinking' ? 0.9 : this.widthWobble,
      smile: this.smile,
      browRaise: this.brow,
      browTilt: this.browTilt,
    };
  }
}

/**
 * Mouth path pieces for the SVG, computed from the pose. At open = 0 the lips meet in a closed line;
 * as it grows the lower lip drops and the dark interior appears.
 */
export function mouthGeometry(cx: number, cy: number, open: number, widthMul: number, smile: number) {
  const half = (19 + smile * 3) * widthMul;
  const cornerY = cy - smile * 3.2;
  const lx = cx - half;
  const rx = cx + half;
  const upperCtrl = cy - 3.5 - open * 2;
  const lowerCtrl = upperCtrl + 5.5 + open * 38;
  const f = (n: number) => n.toFixed(1);
  const upper = `M${f(lx)} ${f(cornerY)} Q${cx} ${f(upperCtrl)} ${f(rx)} ${f(cornerY)}`;
  const interior = `${upper} Q${cx} ${f(upperCtrl + open * 40)} ${f(lx)} ${f(cornerY)} Z`;
  // fuller lower lip that follows the jaw
  const lower = `M${f(lx + 4)} ${f(cornerY + 1)} Q${cx} ${f(lowerCtrl + 2)} ${f(rx - 4)} ${f(cornerY + 1)}`;
  return { upper, lower, interior };
}
