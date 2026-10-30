import { supabase } from '@/lib/supabase';
import { clearUserSnapshots } from '@/pwa/offlineCache';

export async function deleteMyLearningData(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_learning_data');
  if (error) throw new Error(error.message);
  clearUserSnapshots();
}

/** Permanently deletes the account via a server-side function (needs the service role). */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE_MY_ACCOUNT' } });
  if (error) throw new Error('We could not delete your account. Please try again.');
  clearUserSnapshots();
  await supabase.auth.signOut();
}

export async function submitReport(userId: string, category: 'bug' | 'content' | 'abuse' | 'other', message: string): Promise<void> {
  const { error } = await supabase.from('user_reports').insert({ user_id: userId, category, message });
  if (error) throw new Error(error.message);
}

/** Best-effort client error log (RLS limits it to the signed-in user's own id). */
export async function logClientError(userId: string, source: string, message: string): Promise<void> {
  await supabase.from('system_errors').insert({ user_id: userId, source: source.slice(0, 60), message: message.slice(0, 900) });
}
