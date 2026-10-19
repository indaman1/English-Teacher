import { describe, expect, it, vi } from 'vitest';
import { handleCreateLiveToken, type Deps, type UsageSummary } from './handler';

const USER = '11111111-1111-1111-1111-111111111111';
const FIXED_NOW = new Date('2026-10-16T12:00:00.000Z');

const freeUsage: UsageSummary = {
  plan_code: 'free',
  daily_limit_seconds: 600,
  monthly_limit_seconds: 9000,
  daily_sessions_limit: 5,
  max_session_seconds: 600,
  daily_used_seconds: 0,
  monthly_used_seconds: 0,
  sessions_today: 0,
};

function makeDeps(overrides: Partial<Deps> = {}): Deps & Record<string, ReturnType<typeof vi.fn>> {
  const deps = {
    authenticate: vi.fn(async (jwt: string) => (jwt === 'good-jwt' ? USER : null)),
    loadProfile: vi.fn(async () => ({
      display_name: 'Amina',
      english_level: 'intermediate' as const,
      learning_goals: ['Speaking'],
      primary_goal: 'Work or career',
      explanation_language: 'hausa' as const,
    })),
    loadMode: vi.fn(async (code: string) => ({ code, name: 'Interview Practice', instructions: 'Act as an interviewer.', is_active: true })),
    loadLesson: vi.fn(async () => null),
    abandonActiveSessions: vi.fn(async () => undefined),
    recentSessionCount: vi.fn(async () => 0),
    getUsage: vi.fn(async () => ({ ...freeUsage })),
    createSession: vi.fn(async () => '22222222-2222-2222-2222-222222222222'),
    failSession: vi.fn(async () => undefined),
    mintToken: vi.fn(async () => 'auth_tokens/ephemeral-abc'),
    logError: vi.fn(async () => undefined),
    now: () => FIXED_NOW,
    liveModel: 'gemini-test-live',
    voiceName: 'Kore',
    ...overrides,
  };
  return deps as unknown as Deps & Record<string, ReturnType<typeof vi.fn>>;
}

function request(body: unknown, headers: Record<string, string> = { authorization: 'Bearer good-jwt' }, method = 'POST') {
  return new Request('https://example.test/create-live-token', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

describe('create-live-token: authentication', () => {
  it('rejects requests without a bearer token', async () => {
    const deps = makeDeps();
    const res = await handleCreateLiveToken(request({ modeCode: 'free_conversation' }, {}), deps);
    expect(res.status).toBe(401);
    expect(deps.mintToken).not.toHaveBeenCalled();
    expect(deps.createSession).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired JWT', async () => {
    const deps = makeDeps();
    const res = await handleCreateLiveToken(request({ modeCode: 'free_conversation' }, { authorization: 'Bearer bad-jwt' }), deps);
    expect(res.status).toBe(401);
    expect(deps.mintToken).not.toHaveBeenCalled();
  });

  it('returns 503 (not a token) when auth verification itself fails', async () => {
    const deps = makeDeps({ authenticate: vi.fn(async () => { throw new Error('auth down'); }) });
    const res = await handleCreateLiveToken(request({ modeCode: 'free_conversation' }), deps);
    expect(res.status).toBe(503);
    expect(deps.mintToken).not.toHaveBeenCalled();
  });

  it('only allows POST and answers CORS preflight', async () => {
    const deps = makeDeps();
    expect((await handleCreateLiveToken(request(null, {}, 'GET'), deps)).status).toBe(405);
    expect((await handleCreateLiveToken(request(null, {}, 'OPTIONS'), deps)).status).toBe(204);
  });
});

describe('create-live-token: input validation', () => {
  it.each([{}, { modeCode: 123 }, { modeCode: 'Bad Mode!' }, { modeCode: '../etc' }])('rejects invalid body %j', async (body) => {
    const deps = makeDeps();
    const res = await handleCreateLiveToken(request(body), deps);
    expect(res.status).toBe(400);
    expect(deps.mintToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown or disabled mode', async () => {
    const deps = makeDeps({ loadMode: vi.fn(async () => null) });
    expect((await handleCreateLiveToken(request({ modeCode: 'nope' }), deps)).status).toBe(400);
    const disabled = makeDeps({ loadMode: vi.fn(async (c: string) => ({ code: c, name: 'X', instructions: '', is_active: false })) });
    expect((await handleCreateLiveToken(request({ modeCode: 'interview' }), disabled)).status).toBe(400);
  });

  it('rejects a body that is not valid JSON', async () => {
    const deps = makeDeps();
    const req = new Request('https://example.test/x', { method: 'POST', headers: { authorization: 'Bearer good-jwt' }, body: 'not json' });
    expect((await handleCreateLiveToken(req, deps)).status).toBe(400);
  });
});

describe('create-live-token: usage limits are enforced on the server', () => {
  it('blocks when the daily speaking limit is used up', async () => {
    const deps = makeDeps({ getUsage: vi.fn(async () => ({ ...freeUsage, daily_used_seconds: 600 })) });
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('limit_reached');
    expect(deps.mintToken).not.toHaveBeenCalled();
    expect(deps.createSession).not.toHaveBeenCalled();
  });

  it('blocks when fewer than 30 seconds are left', async () => {
    const deps = makeDeps({ getUsage: vi.fn(async () => ({ ...freeUsage, daily_used_seconds: 580 })) });
    expect((await handleCreateLiveToken(request({ modeCode: 'interview' }), deps)).status).toBe(429);
  });

  it('blocks when the monthly limit is used up', async () => {
    const deps = makeDeps({ getUsage: vi.fn(async () => ({ ...freeUsage, monthly_used_seconds: 9000 })) });
    expect((await handleCreateLiveToken(request({ modeCode: 'interview' }), deps)).status).toBe(429);
  });

  it('blocks when the daily lesson count is reached', async () => {
    const deps = makeDeps({ getUsage: vi.fn(async () => ({ ...freeUsage, sessions_today: 5 })) });
    expect((await handleCreateLiveToken(request({ modeCode: 'interview' }), deps)).status).toBe(429);
  });

  it('caps the lesson length to the smallest remaining allowance', async () => {
    const deps = makeDeps({ getUsage: vi.fn(async () => ({ ...freeUsage, daily_used_seconds: 400 })) });
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).maxSeconds).toBe(200);
    expect(deps.createSession).toHaveBeenCalledWith(expect.objectContaining({ maxSeconds: 200 }));
  });

  it('rate-limits rapid repeated starts', async () => {
    const deps = makeDeps({ recentSessionCount: vi.fn(async () => 4) });
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate_limited');
    expect(deps.mintToken).not.toHaveBeenCalled();
  });

  it('closes any earlier active session first (no parallel sessions)', async () => {
    const deps = makeDeps();
    await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    expect(deps.abandonActiveSessions).toHaveBeenCalledWith(USER);
    const order = [deps.abandonActiveSessions.mock.invocationCallOrder[0], deps.createSession.mock.invocationCallOrder[0]];
    expect(order[0]).toBeLessThan(order[1]);
  });
});

describe('create-live-token: successful response', () => {
  it('returns a short-lived single-use token plus a server-built teacher prompt', async () => {
    const deps = makeDeps();
    const res = await handleCreateLiveToken(request({ modeCode: 'interview', topic: 'Strengths and weaknesses' }), deps);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.token).toBe('auth_tokens/ephemeral-abc');
    expect(body.sessionId).toBe('22222222-2222-2222-2222-222222222222');
    expect(body.model).toBe('gemini-test-live');
    expect(body.maxSeconds).toBe(600);
    expect(body.systemInstruction).toContain('Intermediate');
    expect(body.systemInstruction).toContain('Interview Practice');
    expect(body.systemInstruction).toContain('Strengths and weaknesses');
    expect(body.systemInstruction).toContain('Hausa');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const mint = deps.mintToken.mock.calls[0][0];
    const lifetimeSeconds = (new Date(mint.expireTime).getTime() - FIXED_NOW.getTime()) / 1000;
    expect(lifetimeSeconds).toBe(600 + 45); // lesson length + small grace
    expect(lifetimeSeconds).toBeLessThanOrEqual(30 * 60);
    expect(mint.model).toBe('gemini-test-live');
  });

  it('never returns the permanent API key or any secret', async () => {
    const deps = makeDeps();
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/GEMINI_API_KEY|AIza|service_role|SUPABASE_SERVICE/i);
  });

  it('ignores an invalid level and uses the profile level', async () => {
    const deps = makeDeps();
    const res = await handleCreateLiveToken(request({ modeCode: 'interview', level: 'wizard' }), deps);
    expect((await res.json()).level).toBe('intermediate');
  });
});

describe('create-live-token: failures never leak internals', () => {
  it('marks the session failed and returns a friendly 502 when Gemini token minting fails', async () => {
    const deps = makeDeps({ mintToken: vi.fn(async () => { throw new Error('API key AIzaSECRET invalid at line 99'); }) });
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/AIzaSECRET|line 99|stack/);
    expect(deps.failSession).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
    expect(deps.logError).toHaveBeenCalled();
  });

  it('returns a generic 500 on unexpected errors', async () => {
    const deps = makeDeps({ getUsage: vi.fn(async () => { throw new Error('connection string postgres://user:pw@host'); }) });
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }), deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/postgres|pw@host/);
  });

  it('asks the user to finish setup when the profile is missing', async () => {
    const deps = makeDeps({ loadProfile: vi.fn(async () => null) });
    expect((await handleCreateLiveToken(request({ modeCode: 'interview' }), deps)).status).toBe(409);
  });
});

describe('create-live-token: CORS', () => {
  it('echoes only the configured production origin', async () => {
    const deps = makeDeps({ allowedOrigin: 'https://app.example.com' });
    const res = await handleCreateLiveToken(request({ modeCode: 'interview' }, { authorization: 'Bearer good-jwt', origin: 'https://evil.example' }), deps);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
  });
});
