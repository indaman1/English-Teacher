import { supabase } from '@/lib/supabase';
import { withOfflineCache } from '@/pwa/offlineCache';
import { utcDateKey } from '@/lib/utils';
import type { DailyStat } from '@/types';

export function fetchDailyStats(days = 90): Promise<DailyStat[]> {
  return withOfflineCache('user', `stats:${days}`, async () => {
    const from = utcDateKey(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
    const { data, error } = await supabase
      .from('daily_learning_stats')
      .select('stat_date, speaking_seconds, sessions_count, corrections_count, vocabulary_count')
      .gte('stat_date', from)
      .order('stat_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as DailyStat[];
  });
}

export function fetchLifetimeTotals(): Promise<{ speakingSeconds: number; sessions: number; corrections: number; vocabulary: number }> {
  return withOfflineCache('user', 'totals', async () => {
    const { data, error } = await supabase
      .from('daily_learning_stats')
      .select('speaking_seconds, sessions_count, corrections_count, vocabulary_count');
    if (error) throw new Error(error.message);
    return (data ?? []).reduce(
      (a, r) => ({
        speakingSeconds: a.speakingSeconds + r.speaking_seconds,
        sessions: a.sessions + r.sessions_count,
        corrections: a.corrections + r.corrections_count,
        vocabulary: a.vocabulary + r.vocabulary_count,
      }),
      { speakingSeconds: 0, sessions: 0, corrections: 0, vocabulary: 0 },
    );
  });
}
