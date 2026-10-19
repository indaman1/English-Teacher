// Pure request handler for create-live-token. All side effects are injected, so the exact same
// logic runs in the Deno Edge Function and in Vitest.
import { corsHeaders, json } from '../_shared/cors.ts';
import { buildTeacherInstruction, ENGLISH_LEVELS, type EnglishLevel, type ExplanationLanguage } from '../_shared/teacherPrompt.ts';

export interface UsageSummary {
  plan_code: string;
  daily_limit_seconds: number;
  monthly_limit_seconds: number;
  daily_sessions_limit: number;
  max_session_seconds: number;
  daily_used_seconds: number;
  monthly_used_seconds: number;
  sessions_today: number;
}

export interface ProfileRow {
  display_name: string;
  english_level: EnglishLevel;
  learning_goals: string[];
  primary_goal: string | null;
  explanation_language: ExplanationLanguage;
}

export interface ModeRow {
  code: string;
  name: string;
  instructions: string;
  is_active: boolean;
}

export interface LessonRow {
  id: string;
  title: string;
  objective: string;
  suggested_mode: string | null;
}

export interface Deps {
  /** Verifies the bearer JWT with Supabase Auth. Returns the user id or null. */
  authenticate(jwt: string): Promise<string | null>;
  loadProfile(userId: string): Promise<ProfileRow | null>;
  loadMode(code: string): Promise<ModeRow | null>;
  loadLesson(id: string): Promise<LessonRow | null>;
  abandonActiveSessions(userId: string): Promise<void>;
  recentSessionCount(userId: string, seconds: number): Promise<number>;
  getUsage(userId: string): Promise<UsageSummary | null>;
  createSession(row: {
    userId: string;
    modeCode: string;
    lessonId: string | null;
    topic: string;
    level: EnglishLevel;
    maxSeconds: number;
  }): Promise<string>;
  failSession(sessionId: string): Promise<void>;
  mintToken(opts: { expireTime: string; newSessionExpireTime: string; model: string }): Promise<string>;
  logError(userId: string | null, message: string): Promise<void>;
  now(): Date;
  liveModel: string;
  voiceName: string;
  allowedOrigin?: string;
}

const MIN_USEFUL_SECONDS = 30;
const GRACE_SECONDS = 45;
const MAX_TOKEN_LIFETIME_SECONDS = 30 * 60;
const MAX_REQUESTS_PER_MINUTE = 4;

export async function handleCreateLiveToken(req: Request, deps: Deps): Promise<Response> {
  const cors = corsHeaders(deps.allowedOrigin, req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  // 1. Authenticate
  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return json({ error: 'unauthorized', message: 'Please sign in to start a lesson.' }, 401, cors);

  let userId: string | null = null;
  try {
    userId = await deps.authenticate(jwt);
  } catch {
    return json({ error: 'auth_unavailable', message: 'Unable to verify your session. Please try again.' }, 503, cors);
  }
  if (!userId) return json({ error: 'unauthorized', message: 'Your session has expired. Please sign in again.' }, 401, cors);

  // 2. Validate input
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad body');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'bad_request', message: 'Invalid request.' }, 400, cors);
  }
  const modeCode = typeof body.modeCode === 'string' ? body.modeCode.trim() : '';
  if (!/^[a-z_]{2,40}$/.test(modeCode)) return json({ error: 'bad_request', message: 'Please choose a learning mode.' }, 400, cors);
  const topic = typeof body.topic === 'string' ? body.topic.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const lessonId = typeof body.lessonId === 'string' && /^[0-9a-f-]{36}$/i.test(body.lessonId) ? body.lessonId : null;
  const requestedLevel = typeof body.level === 'string' && (ENGLISH_LEVELS as readonly string[]).includes(body.level)
    ? (body.level as EnglishLevel)
    : null;

  try {
    // 3. Load context
    const [profile, mode, lesson] = await Promise.all([
      deps.loadProfile(userId),
      deps.loadMode(modeCode),
      lessonId ? deps.loadLesson(lessonId) : Promise.resolve(null),
    ]);
    if (!profile) return json({ error: 'profile_missing', message: 'Please finish setting up your profile first.' }, 409, cors);
    if (!mode || !mode.is_active) return json({ error: 'bad_request', message: 'That learning mode is not available.' }, 400, cors);

    // 4. Never allow parallel sessions: close earlier active ones (usage is recorded server-side).
    await deps.abandonActiveSessions(userId);

    // 5. Burst protection
    const recent = await deps.recentSessionCount(userId, 60);
    if (recent >= MAX_REQUESTS_PER_MINUTE) {
      return json({ error: 'rate_limited', message: 'You are starting lessons too quickly. Please wait a moment and try again.' }, 429, cors);
    }

    // 6. Enforce plan limits on the server
    const usage = await deps.getUsage(userId);
    if (!usage) return json({ error: 'no_subscription', message: 'Your account is not fully set up. Please sign out and in again.' }, 409, cors);

    const dailyLeft = usage.daily_limit_seconds - usage.daily_used_seconds;
    const monthlyLeft = usage.monthly_limit_seconds - usage.monthly_used_seconds;
    const remaining = Math.min(usage.max_session_seconds, dailyLeft, monthlyLeft);
    if (usage.sessions_today >= usage.daily_sessions_limit || remaining < MIN_USEFUL_SECONDS) {
      return json(
        {
          error: 'limit_reached',
          message: 'You have reached your current practice limit. Come back tomorrow or upgrade for more speaking time.',
          usage,
        },
        429,
        cors,
      );
    }

    // 7. Build the teacher instruction on the server
    const level = requestedLevel ?? profile.english_level;
    const sessionTopic = topic || lesson?.title || mode.name;
    const systemInstruction = buildTeacherInstruction({
      studentName: profile.display_name,
      level,
      goals: profile.learning_goals,
      primaryGoal: profile.primary_goal,
      explanationLanguage: profile.explanation_language,
      modeName: mode.name,
      modeInstructions: mode.instructions,
      topic: sessionTopic,
      lessonTitle: lesson?.title ?? null,
      lessonObjective: lesson?.objective ?? null,
      maxMinutes: Math.ceil(remaining / 60),
    });

    // 8. Create the session row first (service role), then mint the token.
    const sessionId = await deps.createSession({
      userId,
      modeCode,
      lessonId: lesson?.id ?? null,
      topic: sessionTopic,
      level,
      maxSeconds: remaining,
    });

    const now = deps.now();
    const lifetime = Math.min(remaining + GRACE_SECONDS, MAX_TOKEN_LIFETIME_SECONDS);
    const expireTime = new Date(now.getTime() + lifetime * 1000).toISOString();
    let token: string;
    try {
      token = await deps.mintToken({
        expireTime,
        // The token is single-use (uses: 1) and expires with the lesson. The new-session window matches the
        // lifetime so a mid-lesson session-resumption reconnect is not rejected by a 1-minute window.
        newSessionExpireTime: expireTime,
        model: deps.liveModel,
      });
    } catch (err) {
      await deps.failSession(sessionId);
      await deps.logError(userId, `token_mint_failed: ${(err as Error).message}`.slice(0, 900));
      return json({ error: 'upstream_error', message: 'Unable to connect to the AI teacher. Please try again.' }, 502, cors);
    }

    return json(
      {
        token,
        sessionId,
        model: deps.liveModel,
        voiceName: deps.voiceName,
        systemInstruction,
        maxSeconds: remaining,
        level,
        topic: sessionTopic,
        usage: { ...usage, daily_used_seconds: usage.daily_used_seconds },
      },
      200,
      cors,
    );
  } catch (err) {
    await deps.logError(userId, `create_live_token_failed: ${(err as Error).message}`.slice(0, 900)).catch(() => undefined);
    // Never leak internals to the client.
    return json({ error: 'internal_error', message: 'Something went wrong. Please try again.' }, 500, cors);
  }
}
