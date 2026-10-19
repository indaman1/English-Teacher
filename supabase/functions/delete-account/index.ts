// Supabase Edge Function: delete-account (permanently deletes the calling user)
import { createClient } from '@supabase/supabase-js';
import { handleDeleteAccount, type DeleteDeps } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps: DeleteDeps = {
  allowedOrigin: Deno.env.get('ALLOWED_ORIGIN') || undefined,
  async authenticate(jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  },
};

Deno.serve((req) => handleDeleteAccount(req, deps));
