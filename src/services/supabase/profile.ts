import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    'display_name' | 'english_level' | 'learning_goals' | 'primary_goal' | 'explanation_language' | 'daily_target_minutes' | 'avatar_url' | 'onboarding_completed'
  >
>;

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('*').single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

/** Creates the profile row if the signup trigger has not run yet (defensive; normally it already exists). */
export async function ensureProfile(userId: string, email: string | undefined, displayName: string): Promise<Profile> {
  const existing = await fetchProfile(userId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, email: email ?? null, display_name: displayName })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}
