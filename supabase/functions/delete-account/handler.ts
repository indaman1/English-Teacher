import { corsHeaders, json } from '../_shared/cors.ts';

export interface DeleteDeps {
  authenticate(jwt: string): Promise<string | null>;
  deleteUser(userId: string): Promise<void>;
  allowedOrigin?: string;
}

export const DELETE_CONFIRMATION = 'DELETE_MY_ACCOUNT';

export async function handleDeleteAccount(req: Request, deps: DeleteDeps): Promise<Response> {
  const cors = corsHeaders(deps.allowedOrigin, req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!jwt) return json({ error: 'unauthorized', message: 'Please sign in.' }, 401, cors);

  const userId = await deps.authenticate(jwt).catch(() => null);
  if (!userId) return json({ error: 'unauthorized', message: 'Please sign in again.' }, 401, cors);

  let confirm = '';
  try {
    confirm = String(((await req.json()) as Record<string, unknown>)?.confirm ?? '');
  } catch {
    /* fallthrough */
  }
  if (confirm !== DELETE_CONFIRMATION) {
    return json({ error: 'bad_request', message: 'Confirmation text is missing.' }, 400, cors);
  }

  try {
    // Deleting the auth user cascades to every table that references auth.users.
    await deps.deleteUser(userId);
    return json({ ok: true }, 200, cors);
  } catch {
    return json({ error: 'internal_error', message: 'We could not delete your account. Please try again.' }, 500, cors);
  }
}
