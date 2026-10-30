import { supabase } from '@/lib/supabase';
import { withOfflineCache } from '@/pwa/offlineCache';
import type { LearningMode, Lesson, LessonCategory, LessonProgress } from '@/types';

export function listModes(): Promise<LearningMode[]> {
  return withOfflineCache('public', 'modes', async () => {
    const { data, error } = await supabase
      .from('learning_modes')
      .select('code, name, description, icon, topics, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []) as LearningMode[];
  });
}

export function listCategories(): Promise<LessonCategory[]> {
  return withOfflineCache('public', 'categories', async () => {
    const { data, error } = await supabase.from('lesson_categories').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []) as LessonCategory[];
  });
}

export function listLessons(): Promise<Lesson[]> {
  return withOfflineCache('public', 'lessons', async () => {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, category_id, slug, title, description, level, objective, suggested_mode, estimated_minutes, is_published, sort_order')
      .eq('is_published', true)
      .order('sort_order');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Partial<Lesson>[]).map((l) => ({ content: '', examples: [], exercises: [], ...l })) as Lesson[];
  });
}

export function getLesson(id: string): Promise<Lesson | null> {
  return withOfflineCache('public', `lesson:${id}`, async () => {
    const { data, error } = await supabase.from('lessons').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Lesson | null) ?? null;
  });
}

export function listLessonProgress(): Promise<LessonProgress[]> {
  return withOfflineCache('user', 'lesson-progress', async () => {
    const { data, error } = await supabase.from('lesson_progress').select('*');
    if (error) throw new Error(error.message);
    return (data ?? []) as LessonProgress[];
  });
}

export async function setLessonProgress(userId: string, lessonId: string, status: 'in_progress' | 'completed'): Promise<void> {
  const { error } = await supabase.from('lesson_progress').upsert(
    {
      user_id: userId,
      lesson_id: lessonId,
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,lesson_id' },
  );
  if (error) throw new Error(error.message);
}
