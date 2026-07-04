-- Enable RLS on all tables and restrict every row to its owner

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.mood_logs enable row level security;
alter table public.goals enable row level security;
alter table public.journal_entries enable row level security;
alter table public.metrics enable row level security;
alter table public.metric_logs enable row level security;

-- profiles: keyed on id rather than user_id
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete using ((select auth.uid()) = id);

create policy "habits_select_own" on public.habits
  for select using ((select auth.uid()) = user_id);
create policy "habits_insert_own" on public.habits
  for insert with check ((select auth.uid()) = user_id);
create policy "habits_update_own" on public.habits
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habits_delete_own" on public.habits
  for delete using ((select auth.uid()) = user_id);

create policy "habit_logs_select_own" on public.habit_logs
  for select using ((select auth.uid()) = user_id);
create policy "habit_logs_insert_own" on public.habit_logs
  for insert with check ((select auth.uid()) = user_id);
create policy "habit_logs_update_own" on public.habit_logs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit_logs_delete_own" on public.habit_logs
  for delete using ((select auth.uid()) = user_id);

create policy "mood_logs_select_own" on public.mood_logs
  for select using ((select auth.uid()) = user_id);
create policy "mood_logs_insert_own" on public.mood_logs
  for insert with check ((select auth.uid()) = user_id);
create policy "mood_logs_update_own" on public.mood_logs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mood_logs_delete_own" on public.mood_logs
  for delete using ((select auth.uid()) = user_id);

create policy "goals_select_own" on public.goals
  for select using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.goals
  for insert with check ((select auth.uid()) = user_id);
create policy "goals_update_own" on public.goals
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals_delete_own" on public.goals
  for delete using ((select auth.uid()) = user_id);

create policy "journal_entries_select_own" on public.journal_entries
  for select using ((select auth.uid()) = user_id);
create policy "journal_entries_insert_own" on public.journal_entries
  for insert with check ((select auth.uid()) = user_id);
create policy "journal_entries_update_own" on public.journal_entries
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "journal_entries_delete_own" on public.journal_entries
  for delete using ((select auth.uid()) = user_id);

create policy "metrics_select_own" on public.metrics
  for select using ((select auth.uid()) = user_id);
create policy "metrics_insert_own" on public.metrics
  for insert with check ((select auth.uid()) = user_id);
create policy "metrics_update_own" on public.metrics
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "metrics_delete_own" on public.metrics
  for delete using ((select auth.uid()) = user_id);

create policy "metric_logs_select_own" on public.metric_logs
  for select using ((select auth.uid()) = user_id);
create policy "metric_logs_insert_own" on public.metric_logs
  for insert with check ((select auth.uid()) = user_id);
create policy "metric_logs_update_own" on public.metric_logs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "metric_logs_delete_own" on public.metric_logs
  for delete using ((select auth.uid()) = user_id);
