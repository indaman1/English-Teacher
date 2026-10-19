-- Row Level Security. Every table is locked down; users only reach their own rows.
-- Privileged writes (sessions, usage, stats, corrections, subscriptions) happen ONLY
-- through Edge Functions using the service role, which bypasses RLS.

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.learning_modes enable row level security;
alter table public.lesson_categories enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.grammar_corrections enable row level security;
alter table public.vocabulary_items enable row level security;
alter table public.usage_records enable row level security;
alter table public.daily_learning_stats enable row level security;
alter table public.system_errors enable row level security;
alter table public.user_reports enable row level security;

-- ── plans (readable by signed-in users; admin-managed) ──
create policy plans_select on public.plans for select to authenticated using (true);
create policy plans_admin_insert on public.plans for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy plans_admin_update on public.plans for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy plans_admin_delete on public.plans for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ── profiles ──
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete_own on public.profiles for delete to authenticated using (id = auth.uid());

-- ── user_roles: read own only. No client writes => no self-promotion to admin. ──
create policy user_roles_select_own on public.user_roles for select to authenticated using (user_id = auth.uid());

-- ── user_subscriptions: read own only. Changed by payment webhooks / service role. ──
create policy subscriptions_select_own on public.user_subscriptions for select to authenticated using (user_id = auth.uid());

-- ── learning_modes (admin-managed) ──
create policy modes_select on public.learning_modes for select to authenticated
  using (is_active or public.has_role(auth.uid(), 'admin'));
create policy modes_admin_insert on public.learning_modes for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy modes_admin_update on public.learning_modes for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy modes_admin_delete on public.learning_modes for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ── lesson_categories ──
create policy categories_select on public.lesson_categories for select to authenticated using (true);
create policy categories_admin_insert on public.lesson_categories for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy categories_admin_update on public.lesson_categories for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy categories_admin_delete on public.lesson_categories for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ── lessons ──
create policy lessons_select on public.lessons for select to authenticated
  using (is_published or public.has_role(auth.uid(), 'admin'));
create policy lessons_admin_insert on public.lessons for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy lessons_admin_update on public.lessons for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy lessons_admin_delete on public.lessons for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ── lesson_progress ──
create policy lesson_progress_select_own on public.lesson_progress for select to authenticated using (user_id = auth.uid());
create policy lesson_progress_insert_own on public.lesson_progress for insert to authenticated with check (user_id = auth.uid());
create policy lesson_progress_update_own on public.lesson_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy lesson_progress_delete_own on public.lesson_progress for delete to authenticated using (user_id = auth.uid());

-- ── learning_sessions: read + delete own. Create/update only via Edge Functions (limits enforcement). ──
create policy sessions_select_own on public.learning_sessions for select to authenticated using (user_id = auth.uid());
create policy sessions_delete_own on public.learning_sessions for delete to authenticated using (user_id = auth.uid());

-- ── conversation_messages: insert only into the caller's own ACTIVE session ──
create policy messages_select_own on public.conversation_messages for select to authenticated using (user_id = auth.uid());
create policy messages_insert_own on public.conversation_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.learning_sessions s
      where s.id = session_id and s.user_id = auth.uid() and s.status = 'active'
    )
  );
create policy messages_delete_own on public.conversation_messages for delete to authenticated using (user_id = auth.uid());

-- ── grammar_corrections: read + delete own; written by finalize-session ──
create policy corrections_select_own on public.grammar_corrections for select to authenticated using (user_id = auth.uid());
create policy corrections_delete_own on public.grammar_corrections for delete to authenticated using (user_id = auth.uid());

-- ── vocabulary_items: full CRUD on own rows ──
create policy vocabulary_select_own on public.vocabulary_items for select to authenticated using (user_id = auth.uid());
create policy vocabulary_insert_own on public.vocabulary_items for insert to authenticated with check (user_id = auth.uid());
create policy vocabulary_update_own on public.vocabulary_items for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy vocabulary_delete_own on public.vocabulary_items for delete to authenticated using (user_id = auth.uid());

-- ── usage_records & daily stats: read own only (tamper-proof; written by service role) ──
create policy usage_select_own on public.usage_records for select to authenticated using (user_id = auth.uid());
create policy daily_stats_select_own on public.daily_learning_stats for select to authenticated using (user_id = auth.uid());

-- ── system_errors: admin read; users may log their own client-side errors ──
create policy errors_admin_select on public.system_errors for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy errors_insert_own on public.system_errors for insert to authenticated
  with check (user_id = auth.uid() and char_length(source) <= 60);

-- ── user_reports: users create/read their own; admins read and resolve all ──
create policy reports_select on public.user_reports for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy reports_insert_own on public.user_reports for insert to authenticated with check (user_id = auth.uid());
create policy reports_admin_update on public.user_reports for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy reports_delete_own on public.user_reports for delete to authenticated using (user_id = auth.uid());

-- ── explicit table privileges: nothing for anon ──
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Sensitive tables: remove write privileges entirely from clients (defence in depth beyond RLS).
revoke insert, update, delete on public.user_roles, public.user_subscriptions, public.usage_records, public.daily_learning_stats from authenticated;
revoke insert, update on public.learning_sessions from authenticated;
revoke insert, update on public.grammar_corrections from authenticated;
