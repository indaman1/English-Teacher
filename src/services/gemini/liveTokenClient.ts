import { supabase } from '@/lib/supabase';
import { VoiceError, fromTokenFailure } from '@/features/voice/errors';
import type { EnglishLevel, UsageSummary } from '@/types';

export interface LiveTokenRequest {
  modeCode: string;
  topic?: string;
  lessonId?: string;
  level?: EnglishLevel;
}

export interface LiveTokenResponse {
  token: string;
  sessionId: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  maxSeconds: number;
  level: EnglishLevel;
  topic: string;
  usage: UsageSummary;
}

interface FunctionHttpErrorLike {
  name?: string;
  message?: string;
  context?: Response;
}

/** Calls the secure Edge Function. The browser only ever receives a short-lived token. */
export async function requestLiveToken(request: LiveTokenRequest): Promise<LiveTokenResponse> {
  const { data, error } = await supabase.functions.invoke<LiveTokenResponse>('create-live-token', { body: request });

  if (error) {
    const e = error as FunctionHttpErrorLike;
    if (e.context && typeof e.context.json === 'function') {
      let payload: { error?: string; message?: string } = {};
      try {
        payload = await e.context.clone().json();
      } catch {
        /* non-JSON error body */
      }
      throw fromTokenFailure(e.context.status, payload.error, payload.message);
    }
    // Network failure (fetch never reached the function)
    throw new VoiceError(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'upstream');
  }

  if (!data?.token || !data.sessionId) throw new VoiceError('upstream');
  return data;
}
