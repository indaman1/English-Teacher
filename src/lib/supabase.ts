import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

// When env vars are missing we still create a client (pointing nowhere) so the app can
// render a clear "setup required" screen instead of crashing on import.
export const supabase = createClient(
  isSupabaseConfigured ? env.supabaseUrl : 'http://127.0.0.1:54321',
  isSupabaseConfigured ? env.supabaseAnonKey : 'public-anon-key-not-configured',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  },
);
