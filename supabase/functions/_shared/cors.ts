export function corsHeaders(allowedOrigin: string | undefined, requestOrigin: string | null): Record<string, string> {
  // ALLOWED_ORIGIN may hold one origin or several, comma-separated
  // (e.g. "https://app.vercel.app,http://localhost:5173"). Only an origin from that list is echoed back.
  // If it is unset (local development) the caller's origin is echoed. Auth is by bearer token, never cookies.
  let origin: string;
  if (allowedOrigin) {
    const list = allowedOrigin
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    origin = requestOrigin && list.includes(requestOrigin) ? requestOrigin : list[0] ?? '';
  } else {
    origin = requestOrigin ?? '*';
  }
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