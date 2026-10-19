export function corsHeaders(allowedOrigin: string | undefined, requestOrigin: string | null): Record<string, string> {
  // If ALLOWED_ORIGIN is set (production) only that origin is echoed. Otherwise fall back to the
  // caller's origin so local development works. Auth is by bearer token, never cookies.
  const origin = allowedOrigin ? allowedOrigin : requestOrigin ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
