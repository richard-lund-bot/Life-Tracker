-- Spor — initial schema (see docs/spor-habit-library.md).
-- Single-user-per-account model: every row is owned by an auth user and
-- protected by RLS. The app signs in with a passwordless email code.

create table public.habits (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id            text not null,                 -- stable slug ('styrkeokt') or 'custom-…'
  name          text not null,
  emoji         text,
  category      text,
  kind          text not null check (kind in ('sjekk','teller','minutter','mengde','tidspunkt','unngaa')),
  target        numeric,
  unit          text,
  direction     text not null default 'opp' check (direction in ('opp','ned','logg')),
  target_time   time,
  time_side     text not null default 'before' check (time_side in ('before','after')),
  weekly_target int,                           -- NULL → use weekdays[]
  weekdays      int[] not null default '{0,1,2,3,4,5,6}',
  created_on    date not null,
  archived_on   date,
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.logs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id   text not null,
  day        date not null,
  value      numeric,                          -- unngå: 1 = slip
  at         time,                             -- for tidspunkt-habits
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id, day),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);

create table public.checkins (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  mood       int check (mood between 1 and 5),
  energy     int check (energy between 1 and 5),
  note       text,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.habits enable row level security;
alter table public.logs enable row level security;
alter table public.checkins enable row level security;

create policy "own habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own logs" on public.logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own checkins" on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
