import { supabase } from '@/lib/supabase';
import type { Plan, Subscription, UsageSummary } from '@/types';

export async function getMyUsage(): Promise<UsageSummary | null> {
  const { data, error } = await supabase.rpc('get_my_usage');
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return (row as UsageSummary | undefined) ?? null;
}

export async function getMySubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('plan_code, status, provider, current_period_end')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Subscription | null) ?? null;
}

export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('code, name, daily_voice_seconds, monthly_voice_seconds, daily_sessions, max_session_seconds')
    .eq('is_active', true)
    .order('daily_voice_seconds');
  if (error) throw new Error(error.message);
  return (data ?? []) as Plan[];
}
