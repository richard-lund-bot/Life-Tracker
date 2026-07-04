# Spor — session handoff

Context document for continuing work in a new Claude session **with a working
Supabase connection** (connector approved / MCP tool calls allowed).

## What this is

**Spor** is a local-first habit tracker (Norwegian UI, English code) built from
the spec in `docs/spor-habit-library.md`, in repo **richard-lund-bot/Life-Tracker**,
branch **`claude/app-from-markdown-igmimi`**, all work collected in
**[PR #1](https://github.com/richard-lund-bot/Life-Tracker/pull/1)** (open, mergeable).

Zero-build vanilla JS PWA: open `index.html` or `npx serve .`. Everything is
committed and pushed as of commit `e709b63`.

## Done ✅

- **App**: six measurement types (sjekk, teller, minutter, mengde, tidspunkt,
  unngå) + ukemål schedule mode, exactly per the spec's success semantics;
  ~60-habit library picker in 8 categories; recommended starter 7; custom habit
  form; edit/archive/restore; retro-logging via date navigation; mood/energy
  check-ins; stats (perfect-day streaks, 12-week heatmaps, day/week streaks,
  sparklines for trend-only metrics, mood/energy correlation insights);
  light/dark theme; JSON export/import; offline service worker; confetti.
- **Sync client** (`js/sync.js`): passwordless email OTP login, offline outbox
  queue (dedup per key, habits flush before logs for FK order), pull with
  last-write-wins merge on `updated_at`, auto-sync (2.5 s debounce) + on
  startup/reconnect, full push on first login and backup import. App is 100%
  functional with sync unconfigured. Known limit: no delete tombstones.
- **Config** (`js/config.js`): filled in —
  `supabaseUrl: https://bynvelvcbpdnvhpwjuru.supabase.co`,
  `supabaseKey: sb_publishable_uppu5OuUW11Ml9mMVtq3GQ_n0ofeGRM` (public by
  design; RLS protects data).
- **Vendored** `@supabase/supabase-js` 2.110.0 UMD at `js/vendor/supabase.js`.
- **Supabase CLI scaffolding**: `supabase/config.toml` (project_id "spor"),
  migration at `supabase/migrations/20260704120000_init.sql`.
- **Tested** (Playwright, zero console errors): all logging flows, stats with
  10 weeks seeded history, heatmap cell integrity, persistence across reload,
  outbox queuing/dedup, login UI against mocked auth endpoint.

## Blocked in the previous session ❌ → TASK FOR THIS SESSION

The Supabase project **exists** (user created it) but the previous session
could not reach it: MCP calls were auto-rejected ("requires approval") and the
sandbox egress policy blocked `supabase.co`. **It is unknown whether the
migration has been applied.**

Project details:

| | |
|---|---|
| Project name | `spor` |
| Project ref / id | `bynvelvcbpdnvhpwjuru` |
| URL | `https://bynvelvcbpdnvhpwjuru.supabase.co` |
| Intended region | `eu-north-1` |
| Auth method used by app | Email OTP (6-digit code), default Supabase email — no SMTP setup, no redirect URLs needed |

Do, in order:

1. `list_tables` (schema `public`) on project `bynvelvcbpdnvhpwjuru`.
2. If `habits`/`logs`/`checkins` are missing → `apply_migration` (name
   `init_spor_schema`) with the SQL below (identical to
   `supabase/migrations/20260704120000_init.sql`).
3. `get_advisors` type `security` (expect no RLS warnings; all three tables
   have owner-only policies) — relay any findings with remediation links.
4. Confirm `get_project_url` and the publishable key from
   `get_publishable_keys` match `js/config.js` in the repo (values above).
5. Optionally confirm Authentication → Email sign-in is enabled (it is by
   default).

Then the user verifies end-to-end: open the app → **Vaner → Skysynk** → email
code login → rows appear in Table Editor (first login uploads all local data).

## Migration SQL

```sql
create table public.habits (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id            text not null,
  name          text not null,
  emoji         text,
  category      text,
  kind          text not null check (kind in ('sjekk','teller','minutter','mengde','tidspunkt','unngaa')),
  target        numeric,
  unit          text,
  direction     text not null default 'opp' check (direction in ('opp','ned','logg')),
  target_time   time,
  time_side     text not null default 'before' check (time_side in ('before','after')),
  weekly_target int,
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
  value      numeric,
  at         time,
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
```

## Data mapping (client ↔ DB), for reference

- Local habit fields map camelCase→snake_case: `targetTime→target_time`,
  `timeSide→time_side`, `weeklyTarget→weekly_target`, `createdAt→created_on`
  (date), `archivedAt→archived_on`, `updatedAt→updated_at` (timestamptz).
- `logs` key in localStorage is `"habitId|YYYY-MM-DD"`; unngå slip = `value 1`;
  tidspunkt uses `at` (HH:MM). `checkins` keyed by day.
- Weekdays use JS `getDay()` numbering (0=Sunday). Upserts use conflict targets
  `user_id,id` / `user_id,habit_id,day` / `user_id,day`; `user_id` defaults to
  `auth.uid()` server-side so the client never sends it.

## Repo layout

```
index.html                    app shell (I dag · Statistikk · Vaner)
css/styles.css                themes + components
js/app.js                     state, domain logic, rendering, events
js/library.js                 habit library + starter set
js/sync.js                    sync adapter (auth, outbox, pull/merge)
js/config.js                  Supabase URL + publishable key (filled)
js/vendor/supabase.js         supabase-js UMD
supabase/config.toml          CLI config (project_id "spor")
supabase/migrations/20260704120000_init.sql
sw.js                         service worker (cache "spor-v2")
docs/spor-habit-library.md    original spec
docs/supabase-setup.md        setup guide
```

## Testing

Serve locally (`python3 -m http.server 8123`) and drive with Playwright
(chromium at `/opt/pw-browsers/chromium` in Claude sandboxes). Previous
sessions' checks: add starter set → log each type → stats tab renders → reload
persists → Vaner shows Skysynk card. Sync against the live project can only be
tested by a human (email OTP).

## Remaining roadmap after sync is live

- Garmin shortcut push (skritt/søvn) — likely a small edge function accepting
  a token + value, writing to `logs`.
- Web push reminders.
- Delete tombstones for multi-device delete propagation (only if needed).
