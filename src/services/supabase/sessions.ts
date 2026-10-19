import { supabase } from '@/lib/supabase';
import type { ConversationMessage, GrammarCorrection, LearningSession, VocabularyItem } from '@/types';

export interface FinalizeResult {
  ok: boolean;
  durationSeconds?: number;
  feedbackStatus?: 'ready' | 'unavailable' | 'pending';
  alreadyFinalized?: boolean;
}

/** Ends the session server-side: records usage from server-measured time and generates feedback. */
export async function finalizeSession(sessionId: string): Promise<FinalizeResult | null> {
  const { data, error } = await supabase.functions.invoke<FinalizeResult>('finalize-session', { body: { sessionId } });
  if (error) return null;
  return data ?? null;
}

export async function saveMessage(input: {
  sessionId: string;
  userId: string;
  role: 'student' | 'teacher';
  content: string;
  seq: number;
}): Promise<void> {
  const { error } = await supabase.from('conversation_messages').insert({
    session_id: input.sessionId,
    user_id: input.userId,
    role: input.role,
    content: input.content.slice(0, 4000),
    seq: input.seq,
  });
  if (error) throw new Error(error.message);
}

export async function listSessions(limit = 50): Promise<LearningSession[]> {
  const { data, error } = await supabase
    .from('learning_sessions')
    .select('*')
    .neq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LearningSession[];
}

export async function getSession(id: string): Promise<LearningSession | null> {
  const { data, error } = await supabase.from('learning_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LearningSession | null) ?? null;
}

export async function getSessionDetails(id: string): Promise<{
  messages: ConversationMessage[];
  corrections: GrammarCorrection[];
  vocabulary: VocabularyItem[];
}> {
  const [m, c, v] = await Promise.all([
    supabase.from('conversation_messages').select('*').eq('session_id', id).order('seq', { ascending: true }),
    supabase.from('grammar_corrections').select('*').eq('session_id', id).order('created_at', { ascending: true }),
    supabase.from('vocabulary_items').select('*').eq('session_id', id).order('created_at', { ascending: true }),
  ]);
  for (const r of [m, c, v]) if (r.error) throw new Error(r.error.message);
  return {
    messages: (m.data ?? []) as ConversationMessage[],
    corrections: (c.data ?? []) as GrammarCorrection[],
    vocabulary: (v.data ?? []) as VocabularyItem[],
  };
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('learning_sessions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function recentCorrections(limit = 5): Promise<GrammarCorrection[]> {
  const { data, error } = await supabase
    .from('grammar_corrections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as GrammarCorrection[];
}
