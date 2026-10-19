// Pure state machine for the live voice session. The UI renders from this state only,
// so the visualizer and status text can never claim "listening" when nothing is running.

export type VoiceState =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'processing'
  | 'ai_speaking'
  | 'interrupted'
  | 'reconnecting'
  | 'ending'
  | 'completed'
  | 'error';

export type VoiceEvent =
  | { type: 'REQUEST_MIC' }
  | { type: 'MIC_READY' }
  | { type: 'SESSION_OPEN' }
  | { type: 'LISTENING' }
  | { type: 'PROCESSING' }
  | { type: 'AI_AUDIO' }
  | { type: 'AI_DONE' }
  | { type: 'INTERRUPTED' }
  | { type: 'RECONNECTING' }
  | { type: 'RECONNECTED' }
  | { type: 'END' }
  | { type: 'COMPLETED' }
  | { type: 'ERROR' }
  | { type: 'RESET' };

/** States in which a live microphone/session exists and must be torn down on exit. */
export const ACTIVE_STATES: readonly VoiceState[] = [
  'requesting_mic',
  'connecting',
  'connected',
  'listening',
  'processing',
  'ai_speaking',
  'interrupted',
  'reconnecting',
];

/** States in which audio from the student is actually being sent to the model. */
export const MIC_LIVE_STATES: readonly VoiceState[] = ['connected', 'listening', 'processing', 'ai_speaking', 'interrupted'];

export function isActive(state: VoiceState): boolean {
  return ACTIVE_STATES.includes(state);
}

export function isMicLive(state: VoiceState): boolean {
  return MIC_LIVE_STATES.includes(state);
}

/** True when a new session may be started (prevents duplicate sessions / double microphones). */
export function canStart(state: VoiceState): boolean {
  return state === 'idle' || state === 'error' || state === 'completed';
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'REQUEST_MIC':
      return canStart(state) ? 'requesting_mic' : state;
    case 'MIC_READY':
      return state === 'requesting_mic' ? 'connecting' : state;
    case 'SESSION_OPEN':
      return state === 'connecting' || state === 'reconnecting' ? 'connected' : state;
    case 'LISTENING':
      return ['connected', 'processing', 'interrupted', 'ai_speaking', 'listening'].includes(state) ? 'listening' : state;
    case 'PROCESSING':
      return state === 'listening' || state === 'connected' ? 'processing' : state;
    case 'AI_AUDIO':
      return ['connected', 'listening', 'processing', 'interrupted', 'ai_speaking'].includes(state) ? 'ai_speaking' : state;
    case 'AI_DONE':
      return state === 'ai_speaking' || state === 'processing' ? 'listening' : state;
    case 'INTERRUPTED':
      return state === 'ai_speaking' || state === 'processing' || state === 'listening' ? 'interrupted' : state;
    case 'RECONNECTING':
      return (isActive(state) && state !== 'requesting_mic' && state !== 'connecting') || state === 'error'
        ? 'reconnecting'
        : state;
    case 'RECONNECTED':
      return state === 'reconnecting' ? 'listening' : state;
    case 'END':
      return isActive(state) || state === 'error' ? 'ending' : state;
    case 'COMPLETED':
      return state === 'ending' ? 'completed' : state;
    case 'ERROR':
      return state === 'completed' || state === 'idle' ? state : 'error';
    case 'RESET':
      return 'idle';
    default:
      return state;
  }
}

export const STATE_LABELS: Record<VoiceState, string> = {
  idle: 'Ready to start',
  requesting_mic: 'Waiting for microphone permission…',
  connecting: 'Connecting to your teacher…',
  connected: 'Connected',
  listening: 'Listening to you',
  processing: 'Thinking…',
  ai_speaking: 'Teacher is speaking',
  interrupted: 'Interrupted — go ahead',
  reconnecting: 'Reconnecting…',
  ending: 'Wrapping up your lesson…',
  completed: 'Lesson complete',
  error: 'Something went wrong',
};
