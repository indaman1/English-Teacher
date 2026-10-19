import type { VocabStatus, VocabularyItem } from '@/types';

export type VocabFilter = VocabStatus | 'all';

/** Case-insensitive search across word, meaning and example, combined with a status filter. */
export function filterVocabulary(items: VocabularyItem[], query: string, status: VocabFilter): VocabularyItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (status !== 'all' && i.status !== status) return false;
    if (!q) return true;
    return [i.word, i.meaning, i.example, i.hausa_explanation ?? ''].some((f) => f.toLowerCase().includes(q));
  });
}

export function countByStatus(items: VocabularyItem[]): Record<VocabFilter, number> {
  const out: Record<VocabFilter, number> = { all: items.length, new: 0, learning: 0, mastered: 0 };
  for (const i of items) out[i.status] += 1;
  return out;
}

/** Fisher–Yates shuffle that returns a new array and never mutates the input. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Picks up to `n` words to practise, prioritising words that are not mastered yet. */
export function pickPracticeWords(items: VocabularyItem[], n: number, random: () => number = Math.random): VocabularyItem[] {
  const pool = items.filter((i) => i.status !== 'mastered');
  return shuffle(pool.length ? pool : items, random).slice(0, n);
}

/** Status after a practice answer: remembered words advance, forgotten words go back to "learning". */
export function nextStatus(current: VocabStatus, remembered: boolean): VocabStatus {
  if (!remembered) return 'learning';
  return current === 'new' ? 'learning' : 'mastered';
}

/** Tap-to-cycle order used by the status badge in the notebook. */
export const NEXT_STATUS: Record<VocabStatus, VocabStatus> = { new: 'learning', learning: 'mastered', mastered: 'new' };
