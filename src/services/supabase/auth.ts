import { supabase } from '@/lib/supabase';

/** Turns Supabase auth errors into short, friendly messages without leaking internals. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login')) return 'That email or password is not correct.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('email not confirmed')) return 'Please verify your email first. Check your inbox for the confirmation link.';
  if (m.includes('password') && m.includes('characters')) return 'Your password must be at least 8 characters.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Your internet connection appears to be unavailable.';
  return 'Something went wrong. Please try again.';
}

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/auth/login` },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  // When email confirmation is enabled in Supabase, no session is returned until the link is clicked.
  return { needsEmailConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
  if (error) throw new Error(friendlyAuthError(error.message));
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error.message));
}
