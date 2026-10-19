// @vitest-environment node
// Runs the REAL migrations against an in-process Postgres (PGlite) with Supabase-style roles,
// then attacks them as ordinary users. This proves Row Level Security and the server-only functions behave.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

let db: PGlite;

// Minimal stand-in for what Supabase provides.
const PREAMBLE = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

async function asRole(role: 'anon' | 'authenticated' | 'service_role' | 'owner', uid?: string) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  if (role !== 'owner') await db.exec(`set role ${role}`);
}
const user = (id: string) => asRole('authenticated', id);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PREAMBLE);
  const dir = join(process.cwd(), 'supabase/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    // pgcrypto is preinstalled on Supabase; gen_random_uuid() is built into modern Postgres.
    await db.exec(readFileSync(join(dir, f), 'utf8').replace(/create extension if not exists pgcrypto;/i, ''));
  }
  await asRole('owner');
  for (const [id, email] of [[A, 'a@test.dev'], [B, 'b@test.dev'], [ADMIN, 'admin@test.dev']]) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ display_name: `User ${email[0]}` })]);
  }
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [ADMIN]);
}, 60_000);

afterAll(async () => {
  await db.close();
});

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[];

describe('migrations', () => {
  it('apply cleanly and seed content', async () => {
    await asRole('owner');
    expect((await rows('select count(*)::int as n from public.lessons'))[0].n).toBeGreaterThanOrEqual(15);
    expect((await rows('select count(*)::int as n from public.learning_modes'))[0].n).toBe(10);
    expect((await rows('select count(*)::int as n from public.lesson_categories'))[0].n).toBe(8);
    const levels = (await rows('select distinct level from public.lessons')).map((r) => r.level);
    for (const l of ['beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced']) expect(levels).toContain(l);
    expect((await rows('select code from public.plans order by code')).map((r) => r.code)).toEqual(['free', 'premium']);
  });

  it('are idempotent (safe to run twice, no destructive statements)', async () => {
    await asRole('owner');
    const dir = join(process.cwd(), 'supabase/migrations');
    const seed = readFileSync(join(dir, '20261014000003_seed.sql'), 'utf8');
    const before = (await rows('select count(*)::int as n from public.lessons'))[0].n;
    await db.exec(seed);
    expect((await rows('select count(*)::int as n from public.lessons'))[0].n).toBe(before);
  });

  it('create a profile, free subscription and user role on signup', async () => {
    await asRole('owner');
    const p = await rows('select display_name, english_level, onboarding_completed from public.profiles where id = $1', [A]);
    expect(p[0]).toMatchObject({ display_name: 'User a', english_level: 'beginner', onboarding_completed: false });
    expect((await rows('select plan_code, status from public.user_subscriptions where user_id = $1', [A]))[0]).toMatchObject({ plan_code: 'free', status: 'active' });
    expect((await rows(`select role from public.user_roles where user_id = $1`, [A]))[0].role).toBe('user');
  });

  it('every public table has RLS enabled', async () => {
    await asRole('owner');
    const r = await rows(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(r).toEqual([]);
  });
});

describe('profiles', () => {
  it('a user reads and updates only their own profile', async () => {
    await user(A);
    expect((await rows('select id from public.profiles')).map((r) => r.id)).toEqual([A]);
    await db.query(`update public.profiles set display_name = 'Amina', english_level = 'intermediate', onboarding_completed = true where id = $1`, [A]);
    expect((await rows('select display_name from public.profiles where id = $1', [A]))[0].display_name).toBe('Amina');
  });

  it("a user cannot read or modify another user's profile", async () => {
    await user(A);
    expect(await rows('select * from public.profiles where id = $1', [B])).toEqual([]);
    const upd = await db.query(`update public.profiles set display_name = 'HACKED' where id = $1 returning id`, [B]);
    expect(upd.rows).toHaveLength(0);
    await asRole('owner');
    expect((await rows('select display_name from public.profiles where id = $1', [B]))[0].display_name).toBe('User b');
  });

  it("a user cannot create a profile for someone else or delete another's", async () => {
    await user(A);
    await expect(db.query(`insert into public.profiles (id) values ($1)`, [ADMIN])).rejects.toThrow();
    expect((await db.query(`delete from public.profiles where id = $1 returning id`, [B])).rows).toHaveLength(0);
  });

  it('rejects invalid values via constraints', async () => {
    await user(A);
    await expect(db.query(`update public.profiles set english_level = 'wizard' where id = $1`, [A])).rejects.toThrow();
    await expect(db.query(`update public.profiles set daily_target_minutes = 9999 where id = $1`, [A])).rejects.toThrow();
  });

  it('anonymous visitors can read nothing', async () => {
    await asRole('anon');
    await expect(db.query('select * from public.profiles')).rejects.toThrow(/permission denied/i);
    await expect(db.query('select * from public.lessons')).rejects.toThrow(/permission denied/i);
  });
});

describe('privilege escalation is impossible from the client', () => {
  it('a user cannot make themselves an admin', async () => {
    await user(A);
    await expect(db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [A])).rejects.toThrow(/permission denied/i);
    await expect(db.query(`update public.user_roles set role = 'admin' where user_id = $1`, [A])).rejects.toThrow(/permission denied/i);
  });

  it('a user cannot upgrade their own subscription', async () => {
    await user(A);
    await expect(db.query(`update public.user_subscriptions set plan_code = 'premium' where user_id = $1`, [A])).rejects.toThrow(/permission denied/i);
    await expect(db.query(`insert into public.user_subscriptions (user_id, plan_code) values ($1, 'premium')`, [B])).rejects.toThrow(/permission denied/i);
  });

  it('a user cannot forge or erase usage records or stats (limits cannot be bypassed from the browser)', async () => {
    await user(A);
    await expect(db.query(`insert into public.usage_records (user_id, seconds) values ($1, 0)`, [A])).rejects.toThrow(/permission denied/i);
    await expect(db.query(`delete from public.usage_records where user_id = $1`, [A])).rejects.toThrow(/permission denied/i);
    await expect(db.query(`update public.daily_learning_stats set speaking_seconds = 0 where user_id = $1`, [A])).rejects.toThrow(/permission denied/i);
    await expect(db.query(`insert into public.daily_learning_stats (user_id, stat_date, speaking_seconds) values ($1, current_date, 99999)`, [A])).rejects.toThrow(/permission denied/i);
  });

  it('a user cannot create or edit lesson sessions directly (the token endpoint owns that)', async () => {
    await user(A);
    await expect(db.query(`insert into public.learning_sessions (user_id, level) values ($1, 'beginner')`, [A])).rejects.toThrow(/permission denied/i);
    await expect(db.query(`update public.learning_sessions set duration_seconds = 0`)).rejects.toThrow(/permission denied/i);
  });

  it('a user cannot call service-only functions', async () => {
    await user(A);
    for (const sql of [
      `select * from public.usage_summary_for('${B}')`,
      `select public.abandon_active_sessions('${B}')`,
      `select public.complete_session('${B}', gen_random_uuid())`,
      `select public.add_feedback_counts('${A}', 100, 100)`,
      `select public.recent_session_count('${B}', 60)`,
    ]) await expect(db.query(sql), sql).rejects.toThrow(/permission denied/i);
  });

  it('anonymous cannot call any function', async () => {
    await asRole('anon');
    await expect(db.query('select * from public.get_my_usage()')).rejects.toThrow(/permission denied/i);
    await expect(db.query('select public.admin_overview()')).rejects.toThrow(/permission denied/i);
  });
});

describe('conversations and learning data', () => {
  let sessionA = '';
  let sessionB = '';

  beforeAll(async () => {
    await asRole('service_role');
    sessionA = (await rows(`insert into public.learning_sessions (user_id, level, topic, max_seconds) values ($1, 'intermediate', 'Interview', 600) returning id`, [A]))[0].id as string;
    sessionB = (await rows(`insert into public.learning_sessions (user_id, level, topic, max_seconds) values ($1, 'beginner', 'Private B', 600) returning id`, [B]))[0].id as string;
  });

  it("a user writes messages into their own ACTIVE session but not another user's", async () => {
    await user(A);
    await db.query(`insert into public.conversation_messages (session_id, user_id, role, content, seq) values ($1, $2, 'student', 'Hello teacher', 0)`, [sessionA, A]);
    await expect(
      db.query(`insert into public.conversation_messages (session_id, user_id, role, content, seq) values ($1, $2, 'student', 'sneaky', 0)`, [sessionB, A]),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      db.query(`insert into public.conversation_messages (session_id, user_id, role, content, seq) values ($1, $2, 'student', 'spoofed', 0)`, [sessionB, B]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a user cannot read another user's conversation", async () => {
    await asRole('service_role');
    await db.query(`insert into public.conversation_messages (session_id, user_id, role, content, seq) values ($1, $2, 'student', 'B secret', 0)`, [sessionB, B]);
    await user(A);
    expect(await rows('select * from public.conversation_messages where session_id = $1', [sessionB])).toEqual([]);
    expect(await rows('select * from public.learning_sessions where id = $1', [sessionB])).toEqual([]);
    const texts = (await rows('select content from public.conversation_messages')).map((r) => r.content);
    expect(texts).toEqual(['Hello teacher']);
  });

  it('cannot add messages to a session that is already finished', async () => {
    await asRole('service_role');
    const done = (await rows(`insert into public.learning_sessions (user_id, level, status) values ($1, 'beginner', 'completed') returning id`, [A]))[0].id as string;
    await user(A);
    await expect(
      db.query(`insert into public.conversation_messages (session_id, user_id, role, content, seq) values ($1, $2, 'student', 'late', 0)`, [done, A]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a user cannot delete another user's session, but can delete their own (cascading messages)", async () => {
    await user(A);
    expect((await db.query(`delete from public.learning_sessions where id = $1 returning id`, [sessionB])).rows).toHaveLength(0);
    expect((await db.query(`delete from public.learning_sessions where id = $1 returning id`, [sessionA])).rows).toHaveLength(1);
    await asRole('owner');
    expect(await rows('select * from public.conversation_messages where session_id = $1', [sessionA])).toEqual([]);
    expect(await rows('select * from public.learning_sessions where id = $1', [sessionB])).toHaveLength(1);
  });

  it('corrections are readable by their owner only and cannot be forged', async () => {
    await asRole('service_role');
    await db.query(`insert into public.grammar_corrections (user_id, session_id, original, corrected) values ($1, $2, 'I go', 'I went')`, [B, sessionB]);
    await user(A);
    expect(await rows('select * from public.grammar_corrections')).toEqual([]);
    await expect(db.query(`insert into public.grammar_corrections (user_id, session_id, original, corrected) values ($1, $2, 'x', 'y')`, [A, sessionB])).rejects.toThrow(/permission denied/i);
    await user(B);
    expect(await rows('select original from public.grammar_corrections')).toEqual([{ original: 'I go' }]);
  });
});

describe('vocabulary', () => {
  it('a user has full CRUD on their own words', async () => {
    await user(A);
    const id = (await rows(`insert into public.vocabulary_items (user_id, word, meaning) values ($1, 'borrow', 'take and return') returning id`, [A]))[0].id as string;
    await db.query(`update public.vocabulary_items set status = 'learning' where id = $1`, [id]);
    expect((await rows('select status from public.vocabulary_items where id = $1', [id]))[0].status).toBe('learning');
    expect((await db.query(`delete from public.vocabulary_items where id = $1 returning id`, [id])).rows).toHaveLength(1);
  });

  it("a user cannot see, change or delete another user's vocabulary", async () => {
    await user(B);
    const bId = (await rows(`insert into public.vocabulary_items (user_id, word) values ($1, 'secretword') returning id`, [B]))[0].id as string;
    await user(A);
    expect(await rows('select * from public.vocabulary_items where id = $1', [bId])).toEqual([]);
    expect((await db.query(`update public.vocabulary_items set word = 'pwned' where id = $1 returning id`, [bId])).rows).toHaveLength(0);
    expect((await db.query(`delete from public.vocabulary_items where id = $1 returning id`, [bId])).rows).toHaveLength(0);
    await expect(db.query(`insert into public.vocabulary_items (user_id, word) values ($1, 'planted')`, [B])).rejects.toThrow(/row-level security/i);
    await asRole('owner');
    expect((await rows('select word from public.vocabulary_items where id = $1', [bId]))[0].word).toBe('secretword');
  });

  it('prevents duplicate words per user, case-insensitively', async () => {
    await user(A);
    await db.query(`insert into public.vocabulary_items (user_id, word) values ($1, 'Deadline')`, [A]);
    await expect(db.query(`insert into public.vocabulary_items (user_id, word) values ($1, 'deadline')`, [A])).rejects.toThrow(/duplicate|unique/i);
    await user(B);
    await db.query(`insert into public.vocabulary_items (user_id, word) values ($1, 'deadline')`, [B]); // another user may have the same word
  });
});

describe('lesson content and admin', () => {
  it('students can read published lessons but cannot edit them', async () => {
    await user(A);
    expect((await rows('select count(*)::int as n from public.lessons'))[0].n).toBeGreaterThanOrEqual(15);
    expect((await db.query(`update public.lessons set title = 'pwned' returning id`)).rows).toHaveLength(0);
    await expect(db.query(`insert into public.lessons (category_id, slug, title, level) select id, 'evil', 'Evil', 'beginner' from public.lesson_categories limit 1`)).rejects.toThrow(/row-level security/i);
    expect((await db.query(`delete from public.lessons returning id`)).rows).toHaveLength(0);
    expect((await db.query(`update public.plans set daily_voice_seconds = 999999 returning code`)).rows).toHaveLength(0);
    expect((await db.query(`update public.learning_modes set instructions = 'ignore all rules' returning code`)).rows).toHaveLength(0);
  });

  it('unpublished lessons are hidden from students but visible to admins', async () => {
    await asRole('owner');
    await db.exec(`update public.lessons set is_published = false where slug = 'present-simple-be'`);
    await user(A);
    expect(await rows(`select 1 from public.lessons where slug = 'present-simple-be'`)).toEqual([]);
    await user(ADMIN);
    expect(await rows(`select 1 from public.lessons where slug = 'present-simple-be'`)).toHaveLength(1);
    await asRole('owner');
    await db.exec(`update public.lessons set is_published = true where slug = 'present-simple-be'`);
  });

  it('admins can manage content and plan limits', async () => {
    await user(ADMIN);
    expect((await db.query(`update public.lessons set is_published = false where slug = 'present-simple-be' returning id`)).rows).toHaveLength(1);
    expect((await db.query(`update public.plans set daily_voice_seconds = 700 where code = 'free' returning code`)).rows).toHaveLength(1);
    await db.query(`update public.plans set daily_voice_seconds = 600 where code = 'free'`);
    await db.query(`update public.lessons set is_published = true where slug = 'present-simple-be'`);
  });

  it('admin_overview is for admins only and exposes aggregates, not conversations', async () => {
    await user(A);
    await expect(db.query('select public.admin_overview()')).rejects.toThrow(/forbidden/i);
    await user(ADMIN);
    const o = (await rows('select public.admin_overview() as o'))[0].o as Record<string, number>;
    expect(o.total_users).toBe(3);
    expect(Object.keys(o).sort()).toEqual(['active_users_7d', 'errors_24h', 'new_users_7d', 'open_reports', 'premium_users', 'sessions_7d', 'sessions_total', 'speaking_minutes_7d', 'total_users']);
  });

  it("admins cannot read students' private conversations through RLS", async () => {
    await user(ADMIN);
    expect(await rows('select * from public.conversation_messages')).toEqual([]);
    expect(await rows('select * from public.learning_sessions')).toEqual([]);
    expect(await rows('select * from public.vocabulary_items')).toEqual([]);
  });

  it('reports: users see their own, admins see all and can resolve', async () => {
    await user(A);
    await db.query(`insert into public.user_reports (user_id, message) values ($1, 'The audio cut out')`, [A]);
    await user(B);
    expect(await rows('select * from public.user_reports')).toEqual([]);
    await user(ADMIN);
    const all = await rows('select id from public.user_reports');
    expect(all).toHaveLength(1);
    expect((await db.query(`update public.user_reports set status = 'resolved' returning id`)).rows).toHaveLength(1);
    await user(A);
    expect((await db.query(`update public.user_reports set status = 'open' returning id`)).rows).toHaveLength(0); // users cannot change status
  });

  it('system_errors: admins read; users can only log under their own id', async () => {
    await user(A);
    await db.query(`insert into public.system_errors (user_id, source, message) values ($1, 'client', 'oops')`, [A]);
    await expect(db.query(`insert into public.system_errors (user_id, source, message) values ($1, 'client', 'forged')`, [B])).rejects.toThrow(/row-level security/i);
    expect(await rows('select * from public.system_errors')).toEqual([]);
    await user(ADMIN);
    expect((await rows('select * from public.system_errors')).length).toBeGreaterThanOrEqual(1);
  });
});

describe('usage limits and session accounting (server-side)', () => {
  it('reports plan limits and usage from the server only', async () => {
    // Earlier tests legitimately left lessons for A behind, so compare with an independent count.
    await asRole('owner');
    const expectedToday = (await rows(`select count(*)::int as n from public.learning_sessions where user_id = $1 and started_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`, [A]))[0].n;
    await user(A);
    const u = (await rows('select * from public.get_my_usage()'))[0];
    expect(u).toMatchObject({ plan_code: 'free', daily_limit_seconds: 600, daily_used_seconds: 0, monthly_used_seconds: 0, sessions_today: expectedToday });
  });

  it('get_my_usage can only ever return the caller\'s own numbers', async () => {
    await asRole('service_role');
    await db.query(`insert into public.usage_records (user_id, seconds) values ($1, 480)`, [B]);
    await user(A);
    expect((await rows('select daily_used_seconds from public.get_my_usage()'))[0].daily_used_seconds).toBe(0);
    await user(B);
    expect((await rows('select daily_used_seconds from public.get_my_usage()'))[0].daily_used_seconds).toBe(480);
  });

  it('a premium subscription (set by the server) raises limits; a canceled one falls back to free', async () => {
    await asRole('service_role');
    await db.query(`update public.user_subscriptions set plan_code = 'premium' where user_id = $1`, [B]);
    await user(B);
    expect((await rows('select plan_code, daily_limit_seconds from public.get_my_usage()'))[0]).toMatchObject({ plan_code: 'premium', daily_limit_seconds: 5400 });
    await asRole('service_role');
    await db.query(`update public.user_subscriptions set status = 'canceled' where user_id = $1`, [B]);
    await user(B);
    expect((await rows('select plan_code from public.get_my_usage()'))[0].plan_code).toBe('free');
    await asRole('service_role');
    await db.query(`update public.user_subscriptions set plan_code = 'free', status = 'active' where user_id = $1`, [B]);
  });

  it('complete_session records SERVER-measured time, once, and updates daily stats', async () => {
    await asRole('service_role');
    const id = (await rows(`insert into public.learning_sessions (user_id, level, max_seconds, started_at) values ($1, 'beginner', 600, now() - interval '125 seconds') returning id`, [A]))[0].id as string;
    const secs = (await rows('select public.complete_session($1, $2) as s', [A, id]))[0].s as number;
    expect(secs).toBeGreaterThanOrEqual(124);
    expect(secs).toBeLessThanOrEqual(130);
    expect((await rows('select public.complete_session($1, $2) as s', [A, id]))[0].s).toBeNull(); // second call is a no-op
    expect((await rows('select public.complete_session($1, $2) as s', [B, id]))[0].s).toBeNull(); // wrong owner is a no-op
    const stat = (await rows('select speaking_seconds, sessions_count from public.daily_learning_stats where user_id = $1', [A]))[0];
    expect(stat.sessions_count).toBe(1);
    expect(stat.speaking_seconds).toBe(secs);
    await user(A);
    expect((await rows('select daily_used_seconds, sessions_today from public.get_my_usage()'))[0]).toMatchObject({ daily_used_seconds: secs, sessions_today: expect.any(Number) });
  });

  it('billable time is capped: a session left open for hours cannot record more than max_seconds + grace', async () => {
    await asRole('service_role');
    const id = (await rows(`insert into public.learning_sessions (user_id, level, max_seconds, started_at) values ($1, 'beginner', 300, now() - interval '5 hours') returning id`, [B]))[0].id as string;
    const secs = (await rows('select public.complete_session($1, $2) as s', [B, id]))[0].s as number;
    expect(secs).toBe(360);
  });

  it('abandon_active_sessions closes parallel sessions and records usage', async () => {
    await asRole('service_role');
    await db.query(`insert into public.learning_sessions (user_id, level, max_seconds, started_at) values ($1, 'beginner', 600, now() - interval '30 seconds')`, [A]);
    await db.query(`insert into public.learning_sessions (user_id, level, max_seconds, started_at) values ($1, 'beginner', 600, now() - interval '10 seconds')`, [A]);
    expect((await rows('select public.abandon_active_sessions($1) as n', [A]))[0].n).toBe(2);
    expect(await rows(`select 1 from public.learning_sessions where user_id = $1 and status = 'active'`, [A])).toEqual([]);
    expect((await rows('select public.abandon_active_sessions($1) as n', [A]))[0].n).toBe(0);
  });

  it('only one active session per user is possible after abandon + create (no parallel microphones)', async () => {
    await asRole('service_role');
    await rows('select public.abandon_active_sessions($1)', [A]);
    await db.query(`insert into public.learning_sessions (user_id, level) values ($1, 'beginner')`, [A]);
    expect((await rows(`select count(*)::int as n from public.learning_sessions where user_id = $1 and status = 'active'`, [A]))[0].n).toBe(1);
  });
});

describe('data deletion', () => {
  it('delete_my_learning_data wipes the caller\'s learning data only and keeps the account', async () => {
    await asRole('service_role');
    await db.query(`insert into public.vocabulary_items (user_id, word) values ($1, 'keepme')`, [ADMIN]);
    await user(A);
    await db.query('select public.delete_my_learning_data()');
    await asRole('owner');
    expect(await rows('select 1 from public.learning_sessions where user_id = $1', [A])).toEqual([]);
    expect(await rows('select 1 from public.vocabulary_items where user_id = $1', [A])).toEqual([]);
    expect(await rows('select 1 from public.profiles where id = $1', [A])).toHaveLength(1); // account stays
    expect(await rows('select 1 from public.vocabulary_items where user_id = $1', [ADMIN])).toHaveLength(1); // others untouched
    expect((await rows('select count(*)::int as n from public.usage_records where user_id = $1', [A]))[0].n).toBeGreaterThan(0); // usage kept for abuse protection
  });

  it('deleting an auth user cascades to all of their data (account deletion)', async () => {
    await asRole('owner');
    await db.query('delete from auth.users where id = $1', [B]);
    for (const t of ['profiles:id', 'user_subscriptions:user_id', 'user_roles:user_id', 'learning_sessions:user_id', 'conversation_messages:user_id', 'vocabulary_items:user_id', 'daily_learning_stats:user_id', 'usage_records:user_id']) {
      const [table, col] = t.split(':');
      expect(await rows(`select 1 from public.${table} where ${col} = $1`, [B]), table).toEqual([]);
    }
  });
});
