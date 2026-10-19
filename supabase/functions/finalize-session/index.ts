// Supabase Edge Function: finalize-session
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { handleFinalizeSession, type FinalizeDeps, type SessionRow } from './handler.ts';
import { ANALYSIS_RESPONSE_SCHEMA, buildAnalysisInstruction } from '../_shared/teacherPrompt.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
const textModel = Deno.env.get('GEMINI_TEXT_MODEL') ?? 'gemini-3.8-flash';

const deps: FinalizeDeps = {
  allowedOrigin: Deno.env.get('ALLOWED_ORIGIN') || undefined,

  async authenticate(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },

  async getSession(userId, sessionId) {
    const { data } = await admin
      .from('learning_sessions')
      .select('id, status, level, topic, feedback_status, learning_modes(name)')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    const mode = (data as unknown as { learning_modes: { name: string } | null }).learning_modes;
    return {
      id: data.id,
      status: data.status,
      level: data.level,
      topic: data.topic,
      feedback_status: data.feedback_status,
      mode_name: mode?.name ?? 'Conversation',
    } as SessionRow;
  },

  async completeSession(userId, sessionId) {
    const { data, error } = await admin.rpc('complete_session', { p_user: userId, p_session: sessionId });
    if (error) throw new Error(error.message);
    return data === null || data === undefined ? null : Number(data);
  },

  async loadTranscript(sessionId) {
    const { data, error } = await admin
      .from('conversation_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('seq', { ascending: true })
      .limit(400);
    if (error) throw new Error(error.message);
    return (data ?? []) as { role: 'student' | 'teacher'; content: string }[];
  },

  async analyze(transcript, session) {
    if (!geminiKey) throw new Error('GEMINI_API_KEY is not configured');
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const text = transcript.map((l) => `${l.role === 'student' ? 'STUDENT' : 'TEACHER'}: ${l.content}`).join('\n').slice(-12000);
    const res = await ai.models.generateContent({
      model: textModel,
      contents: text,
      config: {
        systemInstruction: buildAnalysisInstruction(session.level, session.mode_name, session.topic),
        responseMimeType: 'application/json',
        responseJsonSchema: ANALYSIS_RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });
    return JSON.parse(res.text ?? 'null');
  },

  async saveFeedback(userId, sessionId, a) {
    await admin
      .from('learning_sessions')
      .update({
        summary: a.summary,
        suggestions: a.suggestions,
        recommended_next: a.recommended_next || null,
        estimated_score: a.estimated_score,
        feedback_status: 'ready',
      })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (a.corrections.length) {
      await admin.from('grammar_corrections').insert(
        a.corrections.map((c) => ({ user_id: userId, session_id: sessionId, ...c })),
      );
    }

    let added = 0;
    for (const v of a.vocabulary) {
      const { error } = await admin
        .from('vocabulary_items')
        .insert({ user_id: userId, session_id: sessionId, word: v.word, meaning: v.meaning, example: v.example });
      if (!error) added += 1; // unique violations (already saved words) are simply skipped
    }
    await admin.rpc('add_feedback_counts', { p_user: userId, p_corrections: a.corrections.length, p_vocabulary: added });
  },

  async markFeedbackUnavailable(sessionId) {
    await admin.from('learning_sessions').update({ feedback_status: 'unavailable' }).eq('id', sessionId);
  },

  async logError(userId, message) {
    await admin.from('system_errors').insert({ user_id: userId, source: 'finalize-session', message });
  },
};

Deno.serve((req) => handleFinalizeSession(req, deps));
