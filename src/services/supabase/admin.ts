import { supabase } from '@/lib/supabase';
import type { LearningMode, Lesson } from '@/types';

export interface AdminOverview {
  total_users: number;
  new_users_7d: number;
  active_users_7d: number;
  sessions_total: number;
  sessions_7d: number;
  speaking_minutes_7d: number;
  premium_users: number;
  open_reports: number;
  errors_24h: number;
}

// Every call below is enforced by the database: RLS policies and SECURITY DEFINER functions check
// has_role(auth.uid(), 'admin'). Hiding the admin page in the UI is only a convenience.

export async function amIAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function fetchOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw new Error('You do not have access to this page.');
  return data as AdminOverview;
}

export async function adminListLessons(): Promise<Pick<Lesson, 'id' | 'title' | 'level' | 'is_published' | 'slug'>[]> {
  const { data, error } = await supabase.from('lessons').select('id, title, level, is_published, slug').order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Lesson, 'id' | 'title' | 'level' | 'is_published' | 'slug'>[];
}

export async function adminSetLessonPublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase.from('lessons').update({ is_published: published }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function adminListModes(): Promise<Pick<LearningMode, 'code' | 'name' | 'is_active'>[]> {
  const { data, error } = await supabase.from('learning_modes').select('code, name, is_active').order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<LearningMode, 'code' | 'name' | 'is_active'>[];
}

export async function adminSetModeActive(code: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('learning_modes').update({ is_active: active }).eq('code', code);
  if (error) throw new Error(error.message);
}

export interface AdminPlan {
  code: string;
  name: string;
  daily_voice_seconds: number;
  monthly_voice_seconds: number;
  daily_sessions: number;
  max_session_seconds: number;
}

export async function adminListPlans(): Promise<AdminPlan[]> {
  const { data, error } = await supabase.from('plans').select('code, name, daily_voice_seconds, monthly_voice_seconds, daily_sessions, max_session_seconds').order('daily_voice_seconds');
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPlan[];
}

export async function adminUpdatePlan(code: string, patch: Partial<Omit<AdminPlan, 'code' | 'name'>>): Promise<void> {
  const { error } = await supabase.from('plans').update(patch).eq('code', code);
  if (error) throw new Error(error.message);
}

export interface ReportRow {
  id: string;
  category: string;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
}

export async function adminListReports(): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from('user_reports')
    .select('id, category, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportRow[];
}

export async function adminResolveReport(id: string): Promise<void> {
  const { error } = await supabase.from('user_reports').update({ status: 'resolved' }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface ErrorRow {
  id: string;
  source: string;
  message: string;
  created_at: string;
}

export async function adminListErrors(): Promise<ErrorRow[]> {
  const { data, error } = await supabase
    .from('system_errors')
    .select('id, source, message, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as ErrorRow[];
}
