import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(p, 'utf8');
const sql = () =>
  readdirSync(join(root, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => read(join(root, 'supabase/migrations', f)))
    .join('\n');

describe('secrets never reach the browser', () => {
  const frontendFiles = [...walk(join(root, 'src')), ...walk(join(root, 'public')), join(root, 'index.html')].filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'),
  );

  it('has no Gemini API key variable or hard-coded key anywhere in frontend code', () => {
    for (const f of frontendFiles) {
      const text = read(f);
      expect(text, f).not.toMatch(/VITE_GEMINI/i);
      expect(text, f).not.toMatch(/GEMINI_API_KEY/);
      expect(text, f).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
      expect(text, f).not.toMatch(/SERVICE_ROLE/i);
    }
  });

  it('never stores tokens or keys in localStorage/sessionStorage', () => {
    for (const f of frontendFiles.filter((x) => /\.(ts|tsx)$/.test(x))) {
      expect(read(f), f).not.toMatch(/(localStorage|sessionStorage)\.(setItem)/);
    }
  });

  it('.env.example contains placeholders only and no frontend Gemini variable', () => {
    const env = read(join(root, '.env.example'));
    expect(env).not.toMatch(/^VITE_GEMINI/m);
    expect(env).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(env).toMatch(/YOUR_/);
    // Server secrets are documented but commented out.
    expect(env).toMatch(/^# GEMINI_API_KEY=/m);
    expect(env).not.toMatch(/^GEMINI_API_KEY=/m);
  });

  it('the Gemini key is only read inside Edge Functions', () => {
    const offenders = walk(root)
      .filter((f) => /\.(ts|tsx|js)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .filter((f) => read(f).includes('GEMINI_API_KEY'))
      .map((f) => f.replace(root + '/', ''));
    for (const f of offenders) expect(f.startsWith('supabase/functions/'), f).toBe(true);
    expect(offenders.length).toBeGreaterThan(0);
  });

  it('.gitignore keeps env files out of git', () => {
    const ignore = read(join(root, '.gitignore'));
    expect(ignore).toMatch(/^\.env$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
  });
});

describe('database security (static analysis of the migrations)', () => {
  const all = sql();
  const tables = [...all.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1]);

  it('creates the expected tables', () => {
    for (const t of [
      'profiles', 'learning_sessions', 'conversation_messages', 'grammar_corrections', 'vocabulary_items', 'lesson_categories',
      'lessons', 'lesson_progress', 'daily_learning_stats', 'usage_records', 'user_subscriptions', 'user_roles', 'plans', 'learning_modes',
    ]) expect(tables).toContain(t);
  });

  it('enables Row Level Security on EVERY table', () => {
    expect(tables.length).toBeGreaterThan(10);
    for (const t of tables) expect(all, `RLS missing for ${t}`).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, 'i'));
  });

  it('defines at least one policy for every table', () => {
    for (const t of tables) expect(all, `no policy for ${t}`).toMatch(new RegExp(`create policy \\w+ on public\\.${t}\\b`, 'i'));
  });

  it('has explicit SELECT, INSERT, UPDATE and DELETE policies for user-owned data', () => {
    for (const t of ['profiles', 'vocabulary_items', 'lesson_progress']) {
      for (const op of ['select', 'insert', 'update', 'delete']) {
        expect(all, `${t} ${op}`).toMatch(new RegExp(`create policy \\w+ on public\\.${t} for ${op}`, 'i'));
      }
    }
  });

  it('scopes every user policy to auth.uid()', () => {
    const policies = [...all.matchAll(/create policy (\w+) on public\.(\w+)([\s\S]*?);/gi)];
    for (const [, name, table, body] of policies) {
      const adminOnly = /has_role\(auth\.uid\(\), 'admin'\)/.test(body);
      const own = /auth\.uid\(\)/.test(body);
      const publicRead = /using \(true\)|using \(\s*is_active|using \(\s*is_published/i.test(body);
      expect(adminOnly || own || publicRead, `${table}.${name} is not scoped`).toBe(true);
    }
  });

  it('never lets clients self-assign roles or edit subscriptions and usage', () => {
    expect(all).not.toMatch(/create policy \w+ on public\.user_roles for (insert|update|delete)/i);
    expect(all).not.toMatch(/create policy \w+ on public\.user_subscriptions for (insert|update|delete)/i);
    expect(all).not.toMatch(/create policy \w+ on public\.usage_records for (insert|update|delete)/i);
    expect(all).not.toMatch(/create policy \w+ on public\.daily_learning_stats for (insert|update|delete)/i);
    expect(all).toMatch(/revoke insert, update, delete on public\.user_roles, public\.user_subscriptions, public\.usage_records, public\.daily_learning_stats from authenticated/i);
  });

  it('only allows editing admin-managed content through the admin role', () => {
    for (const t of ['lessons', 'learning_modes', 'lesson_categories', 'plans']) {
      for (const op of ['insert', 'update', 'delete']) {
        const m = all.match(new RegExp(`create policy \\w+ on public\\.${t} for ${op}[\\s\\S]*?;`, 'i'));
        expect(m, `${t} ${op}`).not.toBeNull();
        expect(m![0]).toMatch(/has_role\(auth\.uid\(\), 'admin'\)/);
      }
    }
  });

  it('keeps service-only SQL functions away from clients', () => {
    for (const fn of ['usage_summary_for(uuid)', 'abandon_active_sessions(uuid)', 'complete_session(uuid, uuid)', 'add_feedback_counts(uuid, integer, integer)', 'recent_session_count(uuid, integer)']) {
      expect(all).toContain(`revoke all on function public.${fn} from public, anon, authenticated`);
      expect(all).toContain(`grant execute on function public.${fn} to service_role`);
    }
  });

  it('every SECURITY DEFINER function pins its search_path', () => {
    const defs = [...all.matchAll(/security definer([^$]*?)\$\$/gi)];
    expect(defs.length).toBeGreaterThan(5);
    for (const d of defs) expect(d[1]).toMatch(/set search_path = public/i);
  });

  it('contains no destructive statements against data', () => {
    expect(all).not.toMatch(/drop table|drop schema|truncate|drop column/i);
  });

  it('gives anonymous users no table access', () => {
    expect(all).toMatch(/revoke all on all tables in schema public from anon/i);
  });

  it('seeds lessons for every level and the required categories', () => {
    for (const level of ['beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced']) expect(all).toContain(`'${level}'`);
    for (const slug of ['grammar', 'speaking', 'vocabulary', 'listening', 'pronunciation', 'everyday', 'business', 'interview']) expect(all).toContain(`('${slug}'`);
    for (const mode of ['free_conversation', 'daily_english', 'grammar', 'vocabulary', 'pronunciation', 'interview', 'business', 'travel', 'storytelling', 'role_play']) {
      expect(all).toContain(`('${mode}'`);
    }
  });
});
