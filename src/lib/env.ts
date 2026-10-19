// Only frontend-safe values live here. There is intentionally NO Gemini key variable:
// the permanent key exists solely as a server-side Edge Function secret.
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey && !env.supabaseUrl.includes('YOUR-PROJECT'));
