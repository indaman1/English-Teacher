import { describe, expect, it, vi } from 'vitest';
import { handleFinalizeSession, type FinalizeDeps, type SessionRow } from './handler';
import { handleDeleteAccount, type DeleteDeps } from '../delete-account/handler';

const USER = '11111111-1111-1111-1111-111111111111';
const SESSION = '22222222-2222-2222-2222-222222222222';

const activeSession: SessionRow = { id: SESSION, status: 'active', level: 'elementary', topic: 'Shopping', mode_name: 'Daily English', feedback_status: 'pending' };

const longTranscript = [
  { role: 'teacher' as const, content: 'What did you buy yesterday?' },
  { role: 'student' as const, content: 'I buy two tomatoes and some rice at the market yesterday.' },
];

const goodAnalysis = {
  summary: 'You talked about shopping at the market.',
  corrections: [{ original: 'I buy two tomatoes yesterday', corrected: 'I bought two tomatoes yesterday', explanation: 'Use bought for the past.', category: 'tense' }],
  vocabulary: [{ word: 'market', meaning: 'a place to buy food', example: 'I went to the market.' }],
  suggestions: ['Practise past tense verbs.'],
  recommended_next: 'Past simple lesson',
  estimated_score: 140,
};

function deps(overrides: Partial<FinalizeDeps> = {}) {
  return {
    authenticate: vi.fn(async (jwt: string) => (jwt === 'good' ? USER : null)),
    getSession: vi.fn(async () => ({ ...activeSession })),
    completeSession: vi.fn(async () => 312),
    loadTranscript: vi.fn(async () => longTranscript),
    analyze: vi.fn(async () => goodAnalysis),
    saveFeedback: vi.fn(async () => undefined),
    markFeedbackUnavailable: vi.fn(async () => undefined),
    logError: vi.fn(async () => undefined),
    ...overrides,
  } as FinalizeDeps & Record<string, ReturnType<typeof vi.fn>>;
}

const req = (body: unknown, auth = 'Bearer good') =>
  new Request('https://x.test/finalize', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('finalize-session', () => {
  it('requires authentication and a valid session id', async () => {
    expect((await handleFinalizeSession(req({ sessionId: SESSION }, 'Bearer nope'), deps())).status).toBe(401);
    expect((await handleFinalizeSession(new Request('https://x.test', { method: 'POST', body: '{}' }), deps())).status).toBe(401);
    expect((await handleFinalizeSession(req({ sessionId: 'not-a-uuid' }), deps())).status).toBe(400);
  });

  it("cannot finalize another user's session", async () => {
    const d = deps({ getSession: vi.fn(async () => null) });
    expect((await handleFinalizeSession(req({ sessionId: SESSION }), d)).status).toBe(404);
    expect(d.completeSession).not.toHaveBeenCalled();
  });

  it('records the SERVER-measured duration and saves sanitized feedback', async () => {
    const d = deps();
    const res = await handleFinalizeSession(req({ sessionId: SESSION, durationSeconds: 99999 }), d);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, durationSeconds: 312, feedbackStatus: 'ready' });
    expect(d.completeSession).toHaveBeenCalledWith(USER, SESSION); // client-supplied duration is ignored
    const saved = d.saveFeedback.mock.calls[0][2];
    expect(saved.estimated_score).toBe(100); // clamped from 140
    expect(saved.corrections).toHaveLength(1);
  });

  it('is idempotent: finalizing twice never double-counts usage', async () => {
    const d = deps({ getSession: vi.fn(async () => ({ ...activeSession, status: 'completed' as const, feedback_status: 'ready' })) });
    const body = await (await handleFinalizeSession(req({ sessionId: SESSION }), d)).json();
    expect(body.alreadyFinalized).toBe(true);
    expect(d.completeSession).not.toHaveBeenCalled();
  });

  it('skips AI analysis for very short lessons but still records usage', async () => {
    const d = deps({ loadTranscript: vi.fn(async () => [{ role: 'student' as const, content: 'Hello' }]) });
    const body = await (await handleFinalizeSession(req({ sessionId: SESSION }), d)).json();
    expect(body).toMatchObject({ ok: true, feedbackStatus: 'unavailable', reason: 'too_short' });
    expect(d.analyze).not.toHaveBeenCalled();
    expect(d.completeSession).toHaveBeenCalled();
  });

  it('still succeeds when the AI analysis fails or returns garbage', async () => {
    const failing = deps({ analyze: vi.fn(async () => { throw new Error('quota'); }) });
    expect(await (await handleFinalizeSession(req({ sessionId: SESSION }), failing)).json()).toMatchObject({ ok: true, feedbackStatus: 'unavailable' });
    expect(failing.markFeedbackUnavailable).toHaveBeenCalled();

    const garbage = deps({ analyze: vi.fn(async () => ({ nonsense: true })) });
    expect(await (await handleFinalizeSession(req({ sessionId: SESSION }), garbage)).json()).toMatchObject({ feedbackStatus: 'unavailable' });
    expect(garbage.saveFeedback).not.toHaveBeenCalled();
  });

  it('drops corrections where nothing actually changed', async () => {
    const d = deps({
      analyze: vi.fn(async () => ({ ...goodAnalysis, corrections: [{ original: 'I went home', corrected: 'i went home', explanation: 'x' }] })),
    });
    await handleFinalizeSession(req({ sessionId: SESSION }), d);
    expect(d.saveFeedback.mock.calls[0][2].corrections).toHaveLength(0);
  });
});

describe('delete-account', () => {
  const del = (overrides: Partial<DeleteDeps> = {}) =>
    ({
      authenticate: vi.fn(async (jwt: string) => (jwt === 'good' ? USER : null)),
      deleteUser: vi.fn(async () => undefined),
      ...overrides,
    }) as DeleteDeps & Record<string, ReturnType<typeof vi.fn>>;
  const call = (d: DeleteDeps, body: unknown, auth = 'Bearer good') =>
    handleDeleteAccount(new Request('https://x.test', { method: 'POST', headers: { authorization: auth }, body: JSON.stringify(body) }), d);

  it('requires auth and the exact confirmation text', async () => {
    const d = del();
    expect((await call(d, { confirm: 'DELETE_MY_ACCOUNT' }, 'Bearer bad')).status).toBe(401);
    expect((await call(d, { confirm: 'yes' })).status).toBe(400);
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes only the authenticated user', async () => {
    const d = del();
    expect((await call(d, { confirm: 'DELETE_MY_ACCOUNT', userId: 'someone-else' })).status).toBe(200);
    expect(d.deleteUser).toHaveBeenCalledWith(USER);
  });
});
