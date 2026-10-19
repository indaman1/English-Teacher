-- Service-role-only helpers used by Edge Functions to keep usage accounting tamper-proof.

-- Closes any still-active sessions of a user (prevents parallel sessions), recording
-- usage capped by what the token could possibly have allowed.
create or replace function public.abandon_active_sessions(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  secs integer;
  n integer := 0;
begin
  for r in
    select id, started_at, max_seconds from public.learning_sessions
    where user_id = p_user and status = 'active'
    for update
  loop
    secs := greatest(0, least(extract(epoch from (now() - r.started_at))::int, r.max_seconds + 60));
    update public.learning_sessions
      set status = 'abandoned', ended_at = now(), duration_seconds = secs, feedback_status = 'unavailable'
      where id = r.id;
    if secs > 0 then
      insert into public.usage_records (user_id, session_id, seconds) values (p_user, r.id, secs);
      insert into public.daily_learning_stats (user_id, stat_date, speaking_seconds, sessions_count)
        values (p_user, (now() at time zone 'utc')::date, secs, 1)
        on conflict (user_id, stat_date) do update
          set speaking_seconds = public.daily_learning_stats.speaking_seconds + excluded.speaking_seconds,
              sessions_count = public.daily_learning_stats.sessions_count + 1;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Completes an active session using SERVER-measured elapsed time (client cannot inflate/deflate it).
-- Returns the duration recorded, or null if the session was not active.
create or replace function public.complete_session(p_user uuid, p_session uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  s record;
  secs integer;
begin
  select id, started_at, max_seconds into s
    from public.learning_sessions
    where id = p_session and user_id = p_user and status = 'active'
    for update;
  if not found then return null; end if;

  secs := greatest(0, least(extract(epoch from (now() - s.started_at))::int, s.max_seconds + 60));
  update public.learning_sessions
    set status = 'completed', ended_at = now(), duration_seconds = secs
    where id = s.id;
  insert into public.usage_records (user_id, session_id, seconds) values (p_user, s.id, secs);
  insert into public.daily_learning_stats (user_id, stat_date, speaking_seconds, sessions_count)
    values (p_user, (now() at time zone 'utc')::date, secs, 1)
    on conflict (user_id, stat_date) do update
      set speaking_seconds = public.daily_learning_stats.speaking_seconds + excluded.speaking_seconds,
          sessions_count = public.daily_learning_stats.sessions_count + 1;
  return secs;
end $$;

create or replace function public.add_feedback_counts(p_user uuid, p_corrections integer, p_vocabulary integer)
returns void language sql security definer set search_path = public as $$
  insert into public.daily_learning_stats (user_id, stat_date, corrections_count, vocabulary_count)
  values (p_user, (now() at time zone 'utc')::date, greatest(p_corrections, 0), greatest(p_vocabulary, 0))
  on conflict (user_id, stat_date) do update
    set corrections_count = public.daily_learning_stats.corrections_count + greatest(p_corrections, 0),
        vocabulary_count = public.daily_learning_stats.vocabulary_count + greatest(p_vocabulary, 0);
$$;

create or replace function public.recent_session_count(p_user uuid, p_seconds integer)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.learning_sessions
  where user_id = p_user and created_at >= now() - make_interval(secs => p_seconds);
$$;

revoke all on function public.abandon_active_sessions(uuid) from public, anon, authenticated;
revoke all on function public.complete_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_feedback_counts(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.recent_session_count(uuid, integer) from public, anon, authenticated;
grant execute on function public.abandon_active_sessions(uuid) to service_role;
grant execute on function public.complete_session(uuid, uuid) to service_role;
grant execute on function public.add_feedback_counts(uuid, integer, integer) to service_role;
grant execute on function public.recent_session_count(uuid, integer) to service_role;
