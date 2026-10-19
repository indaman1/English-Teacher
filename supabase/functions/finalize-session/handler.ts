// Pure handler for finalize-session: closes a session using SERVER-measured time, records
// usage, and generates post-lesson feedback with a text model (server-side key).
import { corsHeaders, json } from '../_shared/cors.ts';
import { sanitizeAnalysis, type AnalysisResult, type EnglishLevel } from '../_shared/teacherPrompt.ts';

export interface SessionRow {
  id: string;
  status: 'active' | 'completed' | 'abandoned';
  level: EnglishLevel;
  topic: string;
  mode_name: string;
  feedback_status: string;
}

export interface TranscriptLine {
  role: 'student' | 'teacher';
  content: string;
}

export interface FinalizeDeps {
  authenticate(jwt: string): Promise<string | null>;
  getSession(userId: string, sessionId: string): Promise<SessionRow | null>;
  /** Returns recorded duration in seconds, or null if the session was not active any more. */
  completeSession(userId: string, sessionId: string): Promise<number | null>;
  loadTranscript(sessionId: string): Promise<TranscriptLine[]>;
  analyze(transcript: TranscriptLine[], session: SessionRow): Promise<unknown>;
  saveFeedback(userId: string, sessionId: string, analysis: AnalysisResult): Promise<void>;
  markFeedbackUnavailable(sessionId: string): Promise<void>;
  logError(userId: string | null, message: string): Promise<void>;
  allowedOrigin?: string;
}

const MIN_STUDENT_WORDS = 6;

export async function handleFinalizeSession(req: Request, deps: FinalizeDeps): Promise<Response> {
  const cors = corsHeaders(deps.allowedOrigin, req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return json({ error: 'unauthorized', message: 'Please sign in.' }, 401, cors);

  let userId: string | null;
  try {
    userId = await deps.authenticate(jwt);
  } catch {
    return json({ error: 'auth_unavailable', message: 'Unable to verify your session.' }, 503, cors);
  }
  if (!userId) return json({ error: 'unauthorized', message: 'Please sign in again.' }, 401, cors);

  let sessionId = '';
  try {
    const body = (await req.json()) as Record<string, unknown>;
    sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  } catch {
    /* handled below */
  }
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: 'bad_request', message: 'Invalid request.' }, 400, cors);

  try {
    const session = await deps.getSession(userId, sessionId);
    if (!session) return json({ error: 'not_found', message: 'Session not found.' }, 404, cors);

    // Idempotent: finalizing twice never double-counts usage.
    if (session.status !== 'active') {
      return json({ ok: true, alreadyFinalized: true, feedbackStatus: session.feedback_status }, 200, cors);
    }

    const durationSeconds = await deps.completeSession(userId, sessionId);
    if (durationSeconds === null) {
      return json({ ok: true, alreadyFinalized: true, feedbackStatus: session.feedback_status }, 200, cors);
    }

    const transcript = await deps.loadTranscript(sessionId);
    const studentWords = transcript
      .filter((l) => l.role === 'student')
      .reduce((n, l) => n + l.content.split(/\s+/).filter(Boolean).length, 0);

    if (studentWords < MIN_STUDENT_WORDS) {
      await deps.markFeedbackUnavailable(sessionId);
      return json({ ok: true, durationSeconds, feedbackStatus: 'unavailable', reason: 'too_short' }, 200, cors);
    }

    let analysis: AnalysisResult | null = null;
    try {
      analysis = sanitizeAnalysis(await deps.analyze(transcript, session));
    } catch (err) {
      await deps.logError(userId, `analysis_failed: ${(err as Error).message}`.slice(0, 900));
    }

    if (!analysis) {
      await deps.markFeedbackUnavailable(sessionId);
      return json({ ok: true, durationSeconds, feedbackStatus: 'unavailable', reason: 'analysis_failed' }, 200, cors);
    }

    await deps.saveFeedback(userId, sessionId, analysis);
    return json({ ok: true, durationSeconds, feedbackStatus: 'ready' }, 200, cors);
  } catch (err) {
    await deps.logError(userId, `finalize_failed: ${(err as Error).message}`.slice(0, 900)).catch(() => undefined);
    return json({ error: 'internal_error', message: 'Something went wrong while saving your lesson.' }, 500, cors);
  }
}
