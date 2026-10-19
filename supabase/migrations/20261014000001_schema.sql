-- AI English Teacher — core schema
-- Safe for a brand-new Supabase project. Uses IF NOT EXISTS; no DROP statements.

create extension if not exists pgcrypto;

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── plans & limits ─────────────────────────
create table if not exists public.plans (
  code text primary key check (code in ('free', 'premium')),
  name text not null,
  daily_voice_seconds integer not null check (daily_voice_seconds >= 0),
  monthly_voice_seconds integer not null check (monthly_voice_seconds >= 0),
  daily_sessions integer not null check (daily_sessions >= 0),
  max_session_seconds integer not null default 1500 check (max_session_seconds between 60 and 1800),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  email text,
  english_level text not null default 'beginner'
    check (english_level in ('beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced')),
  learning_goals text[] not null default '{}',
  primary_goal text check (primary_goal is null or char_length(primary_goal) <= 200),
  explanation_language text not null default 'english' check (explanation_language in ('english', 'hausa')),
  daily_target_minutes integer not null default 10 check (daily_target_minutes between 1 and 240),
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index if not exists user_roles_user_idx on public.user_roles (user_id);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan_code text not null default 'free' references public.plans (code),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'trialing')),
  provider text not null default 'none' check (provider in ('none', 'paystack', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────── learning content ─────────────────────────
create table if not exists public.learning_modes (
  code text primary key,
  name text not null,
  description text not null default '',
  icon text not null default 'mic',
  instructions text not null default '',
  topics text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  icon text not null default 'book-open',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.lesson_categories (id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text not null default '',
  level text not null check (level in ('beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced')),
  objective text not null default '',
  content text not null default '',
  examples jsonb not null default '[]'::jsonb,
  exercises jsonb not null default '[]'::jsonb,
  suggested_mode text references public.learning_modes (code) on delete set null,
  estimated_minutes integer not null default 10 check (estimated_minutes between 1 and 120),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lessons_category_idx on public.lessons (category_id);
create index if not exists lessons_level_idx on public.lessons (level);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  score integer check (score is null or score between 0 and 100),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);
create index if not exists lesson_progress_user_idx on public.lesson_progress (user_id);

-- ───────────────────────── conversations ─────────────────────────
create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode_code text references public.learning_modes (code) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  topic text not null default 'Free conversation' check (char_length(topic) <= 200),
  level text not null check (level in ('beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  max_seconds integer not null default 1500,
  summary text,
  suggestions jsonb not null default '[]'::jsonb,
  recommended_next text,
  estimated_score integer check (estimated_score is null or estimated_score between 0 and 100),
  feedback_status text not null default 'pending' check (feedback_status in ('pending', 'ready', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learning_sessions_user_started_idx on public.learning_sessions (user_id, started_at desc);
create index if not exists learning_sessions_active_idx on public.learning_sessions (user_id) where status = 'active';

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.learning_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  content text not null check (char_length(content) between 1 and 4000),
  seq integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_session_idx on public.conversation_messages (session_id, seq);
create index if not exists conversation_messages_user_idx on public.conversation_messages (user_id);

create table if not exists public.grammar_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.learning_sessions (id) on delete cascade,
  original text not null,
  corrected text not null,
  explanation text not null default '',
  category text not null default 'grammar',
  created_at timestamptz not null default now()
);
create index if not exists grammar_corrections_user_idx on public.grammar_corrections (user_id, created_at desc);
create index if not exists grammar_corrections_session_idx on public.grammar_corrections (session_id);

create table if not exists public.vocabulary_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.learning_sessions (id) on delete set null,
  word text not null check (char_length(word) between 1 and 80),
  meaning text not null default '',
  example text not null default '',
  hausa_explanation text,
  status text not null default 'new' check (status in ('new', 'learning', 'mastered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists vocabulary_user_word_uidx on public.vocabulary_items (user_id, lower(word));
create index if not exists vocabulary_user_status_idx on public.vocabulary_items (user_id, status);

-- ───────────────────────── usage & stats ─────────────────────────
create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.learning_sessions (id) on delete set null,
  kind text not null default 'voice_session' check (kind in ('voice_session')),
  seconds integer not null default 0 check (seconds >= 0),
  created_at timestamptz not null default now()
);
create index if not exists usage_records_user_created_idx on public.usage_records (user_id, created_at desc);

create table if not exists public.daily_learning_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stat_date date not null,
  speaking_seconds integer not null default 0 check (speaking_seconds >= 0),
  sessions_count integer not null default 0 check (sessions_count >= 0),
  corrections_count integer not null default 0 check (corrections_count >= 0),
  vocabulary_count integer not null default 0 check (vocabulary_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stat_date)
);
create index if not exists daily_stats_user_date_idx on public.daily_learning_stats (user_id, stat_date desc);

-- ───────────────────────── operations ─────────────────────────
create table if not exists public.system_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  source text not null,
  message text not null check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists system_errors_created_idx on public.system_errors (created_at desc);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  category text not null default 'other' check (category in ('bug', 'content', 'abuse', 'other')),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_reports_status_idx on public.user_reports (status, created_at desc);

-- ───────────────────────── updated_at triggers ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'plans','profiles','user_subscriptions','learning_modes','lesson_categories','lessons',
    'lesson_progress','learning_sessions','vocabulary_items','daily_learning_stats','user_reports'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated', t);
  end loop;
end $$;

-- ───────────────────────── role helper ─────────────────────────
create or replace function public.has_role(p_user uuid, p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role);
$$;
revoke all on function public.has_role(uuid, text) from public;
grant execute on function public.has_role(uuid, text) to authenticated, service_role;

-- ───────────────────────── new user bootstrap ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), ''))
  on conflict (id) do nothing;

  insert into public.user_subscriptions (user_id, plan_code) values (new.id, 'free')
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, 'user')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── usage summary ─────────────────────────
-- Internal: used by Edge Functions (service role only).
create or replace function public.usage_summary_for(p_user uuid)
returns table (
  plan_code text,
  daily_limit_seconds integer,
  monthly_limit_seconds integer,
  daily_sessions_limit integer,
  max_session_seconds integer,
  daily_used_seconds integer,
  monthly_used_seconds integer,
  sessions_today integer
) language sql stable security definer set search_path = public as $$
  select
    p.code,
    p.daily_voice_seconds,
    p.monthly_voice_seconds,
    p.daily_sessions,
    p.max_session_seconds,
    coalesce((select sum(seconds) from public.usage_records u
              where u.user_id = p_user and u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'), 0)::int,
    coalesce((select sum(seconds) from public.usage_records u
              where u.user_id = p_user and u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'), 0)::int,
    (select count(*) from public.learning_sessions s
      where s.user_id = p_user and s.started_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::int
  from public.user_subscriptions sub
  join public.plans p on p.code = case when sub.status in ('active', 'trialing') then sub.plan_code else 'free' end
  where sub.user_id = p_user;
$$;
revoke all on function public.usage_summary_for(uuid) from public, anon, authenticated;
grant execute on function public.usage_summary_for(uuid) to service_role;

-- Client-facing wrapper: only ever returns the caller's own usage.
create or replace function public.get_my_usage()
returns table (
  plan_code text,
  daily_limit_seconds integer,
  monthly_limit_seconds integer,
  daily_sessions_limit integer,
  max_session_seconds integer,
  daily_used_seconds integer,
  monthly_used_seconds integer,
  sessions_today integer
) language sql stable security definer set search_path = public as $$
  select * from public.usage_summary_for(auth.uid());
$$;
revoke all on function public.get_my_usage() from public, anon;
grant execute on function public.get_my_usage() to authenticated;

-- ───────────────────────── admin aggregates (no private conversation content) ─────────────────────────
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_users_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'active_users_7d', (select count(distinct user_id) from public.learning_sessions where started_at >= now() - interval '7 days'),
    'sessions_total', (select count(*) from public.learning_sessions),
    'sessions_7d', (select count(*) from public.learning_sessions where started_at >= now() - interval '7 days'),
    'speaking_minutes_7d', (select coalesce(sum(seconds), 0) / 60 from public.usage_records where created_at >= now() - interval '7 days'),
    'premium_users', (select count(*) from public.user_subscriptions where plan_code = 'premium' and status in ('active', 'trialing')),
    'open_reports', (select count(*) from public.user_reports where status = 'open'),
    'errors_24h', (select count(*) from public.system_errors where created_at >= now() - interval '24 hours')
  );
end $$;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- ───────────────────────── data deletion ─────────────────────────
-- Deletes the caller's learning history but keeps the account.
create or replace function public.delete_my_learning_data()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.learning_sessions where user_id = uid;   -- cascades messages & corrections
  delete from public.vocabulary_items where user_id = uid;
  delete from public.lesson_progress where user_id = uid;
  delete from public.daily_learning_stats where user_id = uid;
  -- usage_records are kept (billing/abuse protection) but detached from sessions via ON DELETE SET NULL.
end $$;
revoke all on function public.delete_my_learning_data() from public, anon;
grant execute on function public.delete_my_learning_data() to authenticated;
