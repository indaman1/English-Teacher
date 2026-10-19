import { utcDateKey } from '@/lib/utils';
import type { DailyStat } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(d: Date, delta: number): Date {
  return new Date(d.getTime() + delta * DAY_MS);
}

/** Days with speaking activity, bucketed by UTC date (the same bucketing the server uses). */
export function practiceDays(stats: DailyStat[]): Set<string> {
  return new Set(stats.filter((s) => s.speaking_seconds > 0 || s.sessions_count > 0).map((s) => s.stat_date));
}

/**
 * Current streak = consecutive practice days ending today. If the student has not practised yet today,
 * the streak is still alive when yesterday was a practice day.
 */
export function computeStreak(stats: DailyStat[], today: Date = new Date()): { current: number; longest: number } {
  const days = practiceDays(stats);
  if (days.size === 0) return { current: 0, longest: 0 };

  let cursor = days.has(utcDateKey(today)) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(utcDateKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const cur = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    run = Math.round((cur - prev) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current, longest: Math.max(longest, current) };
}

export function secondsToday(stats: DailyStat[], today: Date = new Date()): number {
  const key = utcDateKey(today);
  return stats.find((s) => s.stat_date === key)?.speaking_seconds ?? 0;
}

/** Sum of a field over the last `days` days including today. */
export function sumLastDays(stats: DailyStat[], days: number, field: keyof Omit<DailyStat, 'stat_date'>, today: Date = new Date()): number {
  const from = utcDateKey(addDays(today, -(days - 1)));
  const to = utcDateKey(today);
  return stats.filter((s) => s.stat_date >= from && s.stat_date <= to).reduce((n, s) => n + s[field], 0);
}

export interface SeriesPoint {
  date: string;
  seconds: number;
}

/** One point per day for the last `days` days; missing days are zero. */
export function dailySeries(stats: DailyStat[], days: number, today: Date = new Date()): SeriesPoint[] {
  const byDate = new Map(stats.map((s) => [s.stat_date, s.speaking_seconds]));
  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = utcDateKey(addDays(today, -i));
    out.push({ date: key, seconds: byDate.get(key) ?? 0 });
  }
  return out;
}

export function totals(stats: DailyStat[]) {
  return stats.reduce(
    (acc, s) => ({
      speakingSeconds: acc.speakingSeconds + s.speaking_seconds,
      sessions: acc.sessions + s.sessions_count,
      corrections: acc.corrections + s.corrections_count,
      vocabulary: acc.vocabulary + s.vocabulary_count,
    }),
    { speakingSeconds: 0, sessions: 0, corrections: 0, vocabulary: 0 },
  );
}
