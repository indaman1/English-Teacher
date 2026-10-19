import { supabase } from '@/lib/supabase';
import type { VocabStatus, VocabularyItem } from '@/types';

export async function listVocabulary(): Promise<VocabularyItem[]> {
  const { data, error } = await supabase.from('vocabulary_items').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as VocabularyItem[];
}

export async function countVocabulary(): Promise<number> {
  const { count, error } = await supabase.from('vocabulary_items').select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface NewWord {
  word: string;
  meaning: string;
  example: string;
  hausa_explanation?: string;
}

export class DuplicateWordError extends Error {
  constructor() {
    super('That word is already in your notebook.');
  }
}

export async function addWord(userId: string, w: NewWord): Promise<VocabularyItem> {
  const { data, error } = await supabase
    .from('vocabulary_items')
    .insert({
      user_id: userId,
      word: w.word.trim(),
      meaning: w.meaning.trim(),
      example: w.example.trim(),
      hausa_explanation: w.hausa_explanation?.trim() || null,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new DuplicateWordError();
    throw new Error(error.message);
  }
  return data as VocabularyItem;
}

export async function setWordStatus(id: string, status: VocabStatus): Promise<void> {
  const { error } = await supabase.from('vocabulary_items').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeWord(id: string): Promise<void> {
  const { error } = await supabase.from('vocabulary_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
