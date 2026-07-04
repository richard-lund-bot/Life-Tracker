-- Spor: personal life-tracking backend
-- Core tables: profiles, habits, habit_logs, mood_logs, goals, journal_entries, metrics, metric_logs

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  frequency text not null default 'daily' check (frequency in ('daily','weekly','monthly')),
  target_per_period integer not null default 1 check (target_per_period > 0),
  color text,
  icon text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_on date not null default current_date,
  count integer not null default 1 check (count > 0),
  note text,
  created_at timestamptz not null default now(),
  unique (habit_id, logged_on)
);

create table public.mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  mood smallint not null check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  title text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.metric_logs (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.metrics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  value numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create index habits_user_id_idx on public.habits (user_id);
create index habit_logs_user_logged_idx on public.habit_logs (user_id, logged_on desc);
create index habit_logs_habit_id_idx on public.habit_logs (habit_id);
create index mood_logs_user_logged_idx on public.mood_logs (user_id, logged_at desc);
create index goals_user_id_idx on public.goals (user_id);
create index journal_entries_user_date_idx on public.journal_entries (user_id, entry_date desc);
create index metrics_user_id_idx on public.metrics (user_id);
create index metric_logs_metric_logged_idx on public.metric_logs (metric_id, logged_at desc);
create index metric_logs_user_id_idx on public.metric_logs (user_id);

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();
create trigger set_goals_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
create trigger set_journal_entries_updated_at before update on public.journal_entries
  for each row execute function public.set_updated_at();
