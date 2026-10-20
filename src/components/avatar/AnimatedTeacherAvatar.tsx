import { memo, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AvatarMotion, mouthGeometry } from './avatarAnimations';
import { AVATAR_LABELS, type AvatarState, type Pose } from './avatarTypes';

interface Props {
  state: AvatarState;
  /** Real microphone level 0..1 (existing analyser). Read every frame, never stored in React state. */
  getMicLevel: () => number;
  /** Real playback level 0..1 (existing speaker analyser). Drives the mouth. */
  getAiLevel: () => number;
  className?: string;
}

const SKIN = '#b98260';
const SKIN_SHADE = '#a46f4e';
const HAIR = '#221b20';
const MOUTH_X = 200;
const MOUTH_Y = 243;

interface Refs {
  body: SVGGElement | null;
  head: SVGGElement | null;
  lidL: SVGRectElement | null;
  lidR: SVGRectElement | null;
  pupilL: SVGGElement | null;
  pupilR: SVGGElement | null;
  browL: SVGPathElement | null;
  browR: SVGPathElement | null;
  upper: SVGPathElement | null;
  lower: SVGPathElement | null;
  interior: SVGPathElement | null;
  clip: SVGPathElement | null;
  teeth: SVGRectElement | null;
}

function applyPose(r: Refs, p: Pose) {
  r.body?.setAttribute('transform', `translate(0 ${p.bodyY.toFixed(2)})`);
  r.head?.setAttribute('transform', `translate(${p.headX.toFixed(2)} ${(p.headY + p.bodyY * 0.5).toFixed(2)}) rotate(${p.headRotate.toFixed(2)} 200 292)`);

  // eyelids: a slightly relaxed resting lid plus the blink
  const lid = 0.1 + p.blink * 0.9;
  for (const el of [r.lidL, r.lidR]) el?.setAttribute('height', (lid * 24).toFixed(2));

  const px = (p.pupilX * 4.2).toFixed(2);
  const py = (p.pupilY * 2.6).toFixed(2);
  r.pupilL?.setAttribute('transform', `translate(${px} ${py})`);
  r.pupilR?.setAttribute('transform', `translate(${px} ${py})`);

  const raise = p.browRaise * 5;
  r.browL?.setAttribute('transform', `translate(0 ${(-raise - p.browTilt * 2.5).toFixed(2)}) rotate(${(-p.browTilt * 4).toFixed(2)} 166 168)`);
  r.browR?.setAttribute('transform', `translate(0 ${(-raise + p.browTilt * 1.2).toFixed(2)})`);

  const g = mouthGeometry(MOUTH_X, MOUTH_Y, p.mouthOpen, p.mouthWidth, p.smile);
  r.upper?.setAttribute('d', g.upper);
  r.lower?.setAttribute('d', g.lower);
  r.interior?.setAttribute('d', g.interior);
  r.clip?.setAttribute('d', g.interior);
  const open = p.mouthOpen;
  r.interior?.setAttribute('opacity', open > 0.04 ? '1' : '0');
  r.teeth?.setAttribute('opacity', open > 0.22 ? Math.min(1, (open - 0.22) * 3).toFixed(2) : '0');
}

/** The drawing itself. Memoised with no props, so React never re-renders it; the animation loop edits attributes directly. */
const TeacherSvg = memo(function TeacherSvg({ refs, uid }: { refs: React.MutableRefObject<Refs>; uid: string }) {
  const set = <K extends keyof Refs>(k: K) => (el: Refs[K]) => {
    refs.current[k] = el;
  };
  const eye = (cx: number, side: 'l' | 'r') => (
    <g>
      <clipPath id={`${uid}-eye-${side}`}>
        <ellipse cx={cx} cy={187} rx={16} ry={10.5} />
      </clipPath>
      <ellipse cx={cx} cy={187} rx={16.5} ry={11} fill={SKIN_SHADE} opacity={0.35} />
      <g clipPath={`url(#${uid}-eye-${side})`}>
        <ellipse cx={cx} cy={187} rx={16} ry={10.5} fill="#fbf7f4" />
        <g ref={set(side === 'l' ? 'pupilL' : 'pupilR')}>
          <circle cx={cx} cy={187} r={8} fill="#4a2f22" />
          <circle cx={cx} cy={187} r={4.2} fill="#120c0b" />
          <circle cx={cx + 2.6} cy={184.4} r={1.8} fill="#fff" opacity={0.9} />
        </g>
        <rect ref={set(side === 'l' ? 'lidL' : 'lidR')} x={cx - 18} y={176} width={36} height={2.4} fill={SKIN} />
      </g>
      <path d={`M${cx - 17} 188 Q${cx} 174.5 ${cx + 17} 188`} fill="none" stroke={HAIR} strokeWidth={2.2} strokeLinecap="round" />
    </g>
  );

  return (
    <>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eef2ff" />
          <stop offset="1" stopColor="#ede9fe" />
        </linearGradient>
        <clipPath id={`${uid}-frame`}>
          <circle cx={200} cy={196} r={160} />
        </clipPath>
        <clipPath id={`${uid}-mouth`}>
          <path ref={set('clip')} d="" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}-frame)`}>
        <rect x={40} y={36} width={320} height={320} fill={`url(#${uid}-bg)`} />
        {/* soft window light */}
        <circle cx={90} cy={80} r={110} fill="#fff" opacity={0.45} />

        {/* shoulders + blazer (breathes) */}
        <g ref={set('body')}>
          <path d="M20 410 C28 340 80 308 150 296 L250 296 C320 308 372 340 380 410 Z" fill="#3b4cc0" />
          <path d="M150 296 L200 372 L250 296 L232 292 L200 330 L168 292 Z" fill="#f8fafc" />
          <path d="M150 296 L172 292 L200 340 L186 372 Z" fill="#2f3da3" />
          <path d="M250 296 L228 292 L200 340 L214 372 Z" fill="#2f3da3" />
          <rect x={179} y={248} width={42} height={60} rx={16} fill={SKIN_SHADE} />
          <path d="M168 292 Q200 318 232 292 L232 280 Q200 300 168 280 Z" fill={SKIN_SHADE} />
        </g>

        {/* head (moves) */}
        <g ref={set('head')}>
          {/* hair behind */}
          <path d="M104 190 C96 110 140 66 200 66 C262 66 306 112 296 190 C294 232 290 262 276 282 L124 282 C110 262 106 232 104 190 Z" fill={HAIR} />
          {/* ears + earrings */}
          <ellipse cx={121} cy={200} rx={9} ry={14} fill={SKIN_SHADE} />
          <ellipse cx={279} cy={200} rx={9} ry={14} fill={SKIN_SHADE} />
          <circle cx={121} cy={217} r={3.2} fill="#f4c95d" />
          <circle cx={279} cy={217} r={3.2} fill="#f4c95d" />
          {/* face */}
          <ellipse cx={200} cy={195} rx={78} ry={92} fill={SKIN} />
          <ellipse cx={200} cy={262} rx={52} ry={22} fill={SKIN_SHADE} opacity={0.18} />
          {/* cheeks */}
          <ellipse cx={150} cy={226} rx={16} ry={9} fill="#d9786c" opacity={0.22} />
          <ellipse cx={250} cy={226} rx={16} ry={9} fill="#d9786c" opacity={0.22} />
          {/* eyes */}
          {eye(165, 'l')}
          {eye(235, 'r')}
          {/* brows */}
          <path ref={set('browL')} d="M142 166 Q165 154 188 164" fill="none" stroke={HAIR} strokeWidth={4.4} strokeLinecap="round" />
          <path ref={set('browR')} d="M212 164 Q235 154 258 166" fill="none" stroke={HAIR} strokeWidth={4.4} strokeLinecap="round" />
          {/* nose */}
          <path d="M200 192 Q194 214 190 222 Q200 229 210 222 Q206 214 200 192" fill="none" stroke={SKIN_SHADE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          {/* mouth */}
          <path ref={set('interior')} d="" fill="#4a1722" opacity={0} />
          <g clipPath={`url(#${uid}-mouth)`}>
            <rect ref={set('teeth')} x={MOUTH_X - 24} y={MOUTH_Y - 8} width={48} height={7.5} rx={2} fill="#fdfaf7" opacity={0} />
          </g>
          <path ref={set('lower')} d="" fill="none" stroke="#a8473f" strokeWidth={6} strokeLinecap="round" />
          <path ref={set('upper')} d="" fill="none" stroke="#8f3a35" strokeWidth={3.4} strokeLinecap="round" />
          {/* hair in front: soft side-parted fringe */}
          <path d="M112 186 C104 112 150 74 204 76 C256 78 298 114 288 186 C280 150 262 128 232 118 C206 146 160 150 128 150 C120 160 114 172 112 186 Z" fill={HAIR} />
          <path d="M190 80 C176 100 150 126 124 148" fill="none" stroke="#3a2f36" strokeWidth={2} opacity={0.6} strokeLinecap="round" />
        </g>
      </g>
    </>
  );
});

export function AnimatedTeacherAvatar({ state, getMicLevel, getAiLevel, className }: Props) {
  const uid = useId().replace(/:/g, '');
  const refs = useRef<Refs>({
    body: null, head: null, lidL: null, lidR: null, pupilL: null, pupilR: null, browL: null, browR: null,
    upper: null, lower: null, interior: null, clip: null, teeth: null,
  });
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Latest props live in refs so the animation loop starts once and is never restarted by a re-render.
  const stateRef = useRef(state);
  const micRef = useRef(getMicLevel);
  const aiRef = useRef(getAiLevel);
  stateRef.current = state;
  micRef.current = getMicLevel;
  aiRef.current = getAiLevel;

  useEffect(() => {
    const motion = new AvatarMotion();
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reduced = !!mq?.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reduced = e.matches;
    };
    mq?.addEventListener?.('change', onMq);

    let visible = true;
    let raf = 0;
    const tick = (now: number) => {
      raf = 0;
      applyPose(
        refs.current,
        motion.step(now, { state: stateRef.current, micLevel: micRef.current(), aiLevel: aiRef.current(), reducedMotion: reduced }),
      );
      schedule();
    };
    const schedule = () => {
      if (!raf && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVis = () => (document.visibilityState === 'visible' ? schedule() : stop());
    document.addEventListener('visibilitychange', onVis);

    let io: IntersectionObserver | null = null;
    if (wrapRef.current && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) schedule();
        else stop();
      });
      io.observe(wrapRef.current);
    }

    schedule();
    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      data-avatar-state={state}
      className={cn(
        'relative aspect-square w-40 shrink-0 sm:w-52',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute -inset-1.5 rounded-full opacity-0 transition-all duration-500',
          state === 'speaking' && 'bg-violet-400/30 opacity-100',
          state === 'listening' && 'bg-emerald-400/30 opacity-100',
          state === 'thinking' && 'bg-amber-300/30 opacity-100',
        )}
      />
      <svg
        viewBox="40 36 320 320"
        role="img"
        aria-label={AVATAR_LABELS[state]}
        className="relative h-full w-full rounded-full shadow-glow ring-4 ring-white"
      >
        <TeacherSvg refs={refs} uid={uid} />
      </svg>
    </div>
  );
}
