import type { VoiceState } from '@/features/voice/voiceStateMachine';

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Maps the app's real voice state to the avatar's four looks.
 * - "speaking" ONLY while Gemini audio is actually playing (ai_speaking), never because the mic is on.
 * - "listening" only while the microphone is live and not muted.
 * - "thinking" only while the session is waiting for the model's reply.
 * Everything else (not started, connecting, reconnecting, ending, error...) is a calm idle.
 */
export function avatarStateFor(state: VoiceState, muted: boolean): AvatarState {
  switch (state) {
    case 'ai_speaking':
      return 'speaking';
    case 'processing':
      return 'thinking';
    case 'listening':
    case 'interrupted':
      return muted ? 'idle' : 'listening';
    default:
      return 'idle';
  }
}

export const AVATAR_LABELS: Record<AvatarState, string> = {
  idle: 'Your English teacher, waiting',
  listening: 'Your English teacher is listening',
  thinking: 'Your English teacher is thinking',
  speaking: 'Your English teacher is speaking',
};

/** Everything the SVG needs to draw one frame. All values are small, already smoothed numbers. */
export interface Pose {
  headRotate: number; // degrees
  headX: number; // px in SVG units
  headY: number;
  bodyY: number; // breathing
  blink: number; // 0 open .. 1 closed
  pupilX: number; // -1..1
  pupilY: number; // -1..1
  mouthOpen: number; // 0..1
  mouthWidth: number; // multiplier ~0.7..1.1
  smile: number; // 0..1
  browRaise: number; // 0..1
  browTilt: number; // -1..1 (asymmetry for a thoughtful look)
}

export interface MotionInput {
  state: AvatarState;
  micLevel: number; // 0..1 real microphone level
  aiLevel: number; // 0..1 real playback level
  reducedMotion: boolean;
}
