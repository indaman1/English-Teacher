export type VoiceErrorCode =
  | 'unsupported'
  | 'mic_denied'
  | 'mic_unavailable'
  | 'offline'
  | 'auth'
  | 'quota'
  | 'limit_reached'
  | 'rate_limited'
  | 'timeout'
  | 'playback'
  | 'connection_lost'
  | 'upstream'
  | 'unknown';

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  /** Whether trying again straight away is reasonable. */
  readonly retryable: boolean;
  constructor(code: VoiceErrorCode, message?: string) {
    super(message ?? USER_MESSAGES[code]);
    this.name = 'VoiceError';
    this.code = code;
    this.retryable = ['connection_lost', 'timeout', 'upstream', 'offline', 'playback', 'unknown'].includes(code);
  }
}

export const USER_MESSAGES: Record<VoiceErrorCode, string> = {
  unsupported: 'Your browser does not support live voice lessons. Please use an up-to-date Chrome, Edge, Firefox or Safari.',
  mic_denied: 'Microphone access was denied. Please allow microphone access in your browser settings.',
  mic_unavailable: 'No microphone was found or it is being used by another app. Please check your device and try again.',
  offline: 'Your internet connection appears to be unavailable.',
  auth: 'Your voice session could not be verified. Please try again.',
  quota: 'The AI teacher is very busy right now. Please try again in a few minutes.',
  limit_reached: 'You have reached your current practice limit.',
  rate_limited: 'You are starting lessons too quickly. Please wait a moment and try again.',
  timeout: 'Your voice session has expired. Please reconnect.',
  playback: 'We could not play the teacher’s voice. Check your volume or tap the screen once, then try again.',
  connection_lost: 'The connection to your teacher was lost. Please reconnect.',
  upstream: 'Unable to connect to the AI teacher. Please try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Maps browser getUserMedia errors to friendly VoiceErrors. */
export function fromMediaError(err: unknown): VoiceError {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return new VoiceError('mic_denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError' || name === 'AbortError') {
    return new VoiceError('mic_unavailable');
  }
  return new VoiceError('unknown');
}

/** Maps WebSocket close/error text from the Live API to a VoiceError. Never exposes raw internals. */
export function fromLiveClose(reason: string | undefined, wasClean = false): VoiceError {
  const r = (reason ?? '').toLowerCase();
  if (/quota|resource.?exhausted|rate.?limit|429/.test(r)) return new VoiceError('quota');
  if (/expired|deadline|timeout|session.?time/.test(r)) return new VoiceError('timeout');
  if (/api key|token|auth|permission|unauthenticated|401|403/.test(r)) return new VoiceError('auth');
  return new VoiceError(wasClean ? 'timeout' : 'connection_lost');
}

/** Maps responses from our create-live-token Edge Function. */
export function fromTokenFailure(status: number, errorCode: string | undefined, message?: string): VoiceError {
  if (errorCode === 'limit_reached') return new VoiceError('limit_reached', message);
  if (errorCode === 'rate_limited') return new VoiceError('rate_limited', message);
  if (status === 401 || errorCode === 'unauthorized') return new VoiceError('auth', 'Your session has expired. Please sign in again.');
  if (status === 429) return new VoiceError('quota');
  if (status === 0) return new VoiceError('offline');
  return new VoiceError('upstream');
}
