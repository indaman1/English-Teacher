import { describe, expect, it } from 'vitest';
import { computeStreak, dailySeries, secondsToday, sumLastDays, totals } from './calc';
import { PLACEMENT_QUESTIONS, scorePlacement } from '@/features/auth/placement';
import { countByStatus, filterVocabulary, nextStatus, shuffle } from '@/features/vocabulary/filter';
import { formatDuration, formatMinutes, greetingForHour } from '@/lib/utils';
import type { DailyStat, VocabularyItem } from '@/types';

const TODAY = new Date('2026-10-16T10:00:00Z');
const stat = (date: string, seconds: number, sessions = 1): DailyStat => ({
  stat_date: date,
  speaking_seconds: seconds,
  sessions_count: sessions,
  corrections_count: 2,
  vocabulary_count: 3,
});

describe('streaks', () => {
  it('is zero for a brand-new user (no fake statistics)', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, longest: 0 });
    expect(secondsToday([], TODAY)).toBe(0);
    expect(totals([])).toEqual({ speakingSeconds: 0, sessions: 0, corrections: 0, vocabulary: 0 });
  });

  it('counts consecutive days ending today', () => {
    const s = [stat('2026-10-14', 60), stat('2026-10-15', 60), stat('2026-10-16', 60)];
    expect(computeStreak(s, TODAY).current).toBe(3);
  });

  it('keeps the streak alive when the student has not practised yet today', () => {
    const s = [stat('2026-10-14', 60), stat('2026-10-15', 60)];
    expect(computeStreak(s, TODAY).current).toBe(2);
  });

  it('resets after a missed day but remembers the longest streak', () => {
    const s = [stat('2026-10-01', 60), stat('2026-10-02', 60), stat('2026-10-03', 60), stat('2026-10-16', 60)];
    expect(computeStreak(s, TODAY)).toEqual({ current: 1, longest: 3 });
    expect(computeStreak([stat('2026-10-10', 60)], TODAY).current).toBe(0);
  });

  it('ignores days with no activity', () => {
    expect(computeStreak([stat('2026-10-16', 0, 0)], TODAY).current).toBe(0);
  });
});

describe('aggregates', () => {
  const stats = [stat('2026-10-16', 300), stat('2026-10-12', 120), stat('2026-09-01', 600)];

  it('sums the right window', () => {
    expect(sumLastDays(stats, 7, 'speaking_seconds', TODAY)).toBe(420);
    expect(sumLastDays(stats, 30, 'speaking_seconds', TODAY)).toBe(420);
    expect(sumLastDays(stats, 90, 'speaking_seconds', TODAY)).toBe(1020);
    expect(secondsToday(stats, TODAY)).toBe(300);
  });

  it('builds a gap-filled series of the requested length', () => {
    const series = dailySeries(stats, 7, TODAY);
    expect(series).toHaveLength(7);
    expect(series[6]).toEqual({ date: '2026-10-16', seconds: 300 });
    expect(series[0].date).toBe('2026-10-10');
    expect(series.find((p) => p.date === '2026-10-14')?.seconds).toBe(0);
  });

  it('totals lifetime numbers', () => {
    expect(totals(stats)).toEqual({ speakingSeconds: 1020, sessions: 3, corrections: 6, vocabulary: 9 });
  });
});

describe('placement quiz', () => {
  const answersFor = (bands: number): Record<string, number> => {
    const a: Record<string, number> = {};
    for (const q of PLACEMENT_QUESTIONS) a[q.id] = q.band <= bands ? q.answer : (q.answer + 1) % q.options.length;
    return a;
  };

  it('has 10 well-formed questions', () => {
    expect(PLACEMENT_QUESTIONS).toHaveLength(10);
    for (const q of PLACEMENT_QUESTIONS) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
    }
  });

  it.each([
    [0, 'beginner'],
    [1, 'elementary'],
    [2, 'intermediate'],
    [3, 'upper_intermediate'],
    [4, 'advanced'],
    [5, 'advanced'],
  ])('suggests the right level when %i bands are fully passed', (bands, level) => {
    expect(scorePlacement(answersFor(bands)).level).toBe(level);
  });

  it('does not let lucky hard answers inflate the result', () => {
    const a = answersFor(0);
    for (const q of PLACEMENT_QUESTIONS.filter((x) => x.band === 5)) a[q.id] = q.answer;
    expect(scorePlacement(a).level).toBe('beginner');
  });

  it('handles an empty quiz', () => {
    expect(scorePlacement({}).level).toBe('beginner');
  });
});

describe('vocabulary helpers', () => {
  const item = (word: string, status: VocabularyItem['status'], meaning = '', example = ''): VocabularyItem => ({
    id: word,
    word,
    meaning,
    example,
    hausa_explanation: null,
    status,
    session_id: null,
    created_at: '2026-10-16T00:00:00Z',
  });
  const items = [item('market', 'new', 'a place to buy food'), item('borrow', 'learning', 'take and give back', 'May I borrow a pen?'), item('deadline', 'mastered')];

  it('searches across word, meaning and example, case-insensitively', () => {
    expect(filterVocabulary(items, 'MARK', 'all').map((v) => v.word)).toEqual(['market']);
    expect(filterVocabulary(items, 'pen', 'all').map((v) => v.word)).toEqual(['borrow']);
    expect(filterVocabulary(items, 'give back', 'all')).toHaveLength(1);
  });

  it('filters by status and counts them', () => {
    expect(filterVocabulary(items, '', 'mastered').map((v) => v.word)).toEqual(['deadline']);
    expect(countByStatus(items)).toEqual({ all: 3, new: 1, learning: 1, mastered: 1 });
  });

  it('shuffles without losing or mutating items', () => {
    const copy = [...items];
    const out = shuffle(items, () => 0.3);
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(items));
    expect(items).toEqual(copy);
  });

  it('moves words along new → learning → mastered and back when forgotten', () => {
    expect(nextStatus('new', true)).toBe('learning');
    expect(nextStatus('learning', true)).toBe('mastered');
    expect(nextStatus('mastered', false)).toBe('learning');
    expect(nextStatus('new', false)).toBe('learning');
  });
});

describe('formatting helpers', () => {
  it('formats durations and minutes', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(20)).toBe('<1 min');
    expect(formatMinutes(600)).toBe('10 min');
    expect(formatMinutes(3900)).toBe('1 h 5 min');
  });

  it('greets by time of day', () => {
    expect(greetingForHour(8)).toBe('Good morning');
    expect(greetingForHour(14)).toBe('Good afternoon');
    expect(greetingForHour(20)).toBe('Good evening');
  });
});
