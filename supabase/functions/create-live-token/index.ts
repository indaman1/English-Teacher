// Supabase Edge Function: create-live-token
// Issues a SHORT-LIVED Gemini Live ephemeral token to an authenticated user.
// The permanent GEMINI_API_KEY exists only here, as a server-side secret.
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Modality } from '@google/genai';
import { handleCreateLiveToken, type Deps, type UsageSummary } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const deps: Deps = {
  liveModel: Deno.env.get('GEMINI_LIVE_MODEL') ?? 'gemini-3.8-live',
  voiceName: Deno.env.get('GEMINI_VOICE_NAME') ?? 'Kore',
  allowedOrigin: Deno.env.get('ALLOWED_ORIGIN') || undefined,
  now: () => new Date(),

  async authenticate(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return null;
    return data.user.id;
  },

  async loadProfile(userId) {
    const { data } = await admin
      .from('profiles')
      .select('display_name, english_level, learning_goals, primary_goal, explanation_language')
      .eq('id', userId)
      .maybeSingle();
    return data;
  },

  async loadMode(code) {
    const { data } = await admin.from('learning_modes').select('code, name, instructions, is_active').eq('code', code).maybeSingle();
    return data;
  },

  async loadLesson(id) {
    const { data } = await admin.from('lessons').select('id, title, objective, suggested_mode').eq('id', id).eq('is_published', true).maybeSingle();
    return data;
  },

  async abandonActiveSessions(userId) {
    const { error } = await admin.rpc('abandon_active_sessions', { p_user: userId });
    if (error) throw new Error(error.message);
  },

  async recentSessionCount(userId, seconds) {
    const { data, error } = await admin.rpc('recent_session_count', { p_user: userId, p_seconds: seconds });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  },

  async getUsage(userId) {
    const { data, error } = await admin.rpc('usage_summary_for', { p_user: userId });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as UsageSummary | undefined;
    return row ?? null;
  },

  async createSession(row) {
    const { data, error } = await admin
      .from('learning_sessions')
      .insert({
        user_id: row.userId,
        mode_code: row.modeCode,
        lesson_id: row.lessonId,
        topic: row.topic,
        level: row.level,
        max_seconds: row.maxSeconds,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'session insert failed');
    return data.id as string;
  },

  async failSession(sessionId) {
    await admin
      .from('learning_sessions')
      .update({ status: 'abandoned', ended_at: new Date().toISOString(), feedback_status: 'unavailable' })
      .eq('id', sessionId);
  },

  async mintToken({ expireTime, newSessionExpireTime, model }) {
    if (!geminiKey) throw new Error('GEMINI_API_KEY is not configured');
    const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { apiVersion: 'v1beta' } });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        // Lock the token to the Live model + audio output so it cannot be used for anything else.
        liveConnectConstraints: {
          model,
          config: { sessionResumption: {}, responseModalities: [Modality.AUDIO] },
        },
      },
    });
    if (!token.name) throw new Error('Gemini returned an empty token');
    return token.name;
  },

  async logError(userId, message) {
    await admin.from('system_errors').insert({ user_id: userId, source: 'create-live-token', message });
  },
};

Deno.serve((req) => handleCreateLiveToken(req, deps));
