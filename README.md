# Life-Tracker

Personal life-tracking app backed by the **Spor** Supabase project.

## Backend (Supabase)

- Project: `Spor` (ref `bynvelvcbpdnvhpwjuru`, region `eu-west-1`)
- API URL: `https://bynvelvcbpdnvhpwjuru.supabase.co`
- Publishable key: `sb_publishable_uppu5OuUW11Ml9mMVtq3GQ_n0ofeGRM` (safe for client-side use)

### Schema

All tables live in the `public` schema and are protected by row-level security —
every row is readable and writable only by its owning user (`auth.uid()`).

| Table | Purpose |
| --- | --- |
| `profiles` | One row per user (display name, timezone). Created automatically on signup. |
| `habits` | Habit definitions: name, frequency (`daily`/`weekly`/`monthly`), target per period, color/icon, archived flag. |
| `habit_logs` | Habit completions, one row per habit per day (`unique (habit_id, logged_on)`). |
| `mood_logs` | Mood (1–5) and optional energy (1–5) check-ins with notes. |
| `goals` | Goals with target date and status (`active`/`completed`/`abandoned`). |
| `journal_entries` | Dated free-text journal entries. |
| `metrics` | User-defined measurement series (e.g. weight, sleep hours) with a unit. |
| `metric_logs` | Timestamped numeric values for a metric. |

Automation:

- `on_auth_user_created` trigger inserts a `profiles` row for every new auth user.
- `updated_at` columns are maintained by a `set_updated_at` trigger on
  `profiles`, `habits`, `goals`, and `journal_entries`.

### Migrations

The SQL applied to the Spor project is checked in under
[`supabase/migrations/`](supabase/migrations/), in order:

1. `core_life_tracking_schema` — tables, indexes, `updated_at` triggers
2. `row_level_security_policies` — RLS enabled + owner-only policies on all tables
3. `auto_create_profile_on_signup` — profile bootstrap trigger on `auth.users`
4. `lock_down_trigger_functions` — revokes REST-API execute on trigger functions

### TypeScript types

Generated database types are in
[`src/types/database.types.ts`](src/types/database.types.ts). Regenerate after
schema changes with:

```sh
supabase gen types typescript --project-id bynvelvcbpdnvhpwjuru > src/types/database.types.ts
```

### Client setup

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/database.types'

export const supabase = createClient<Database>(
  'https://bynvelvcbpdnvhpwjuru.supabase.co',
  'sb_publishable_uppu5OuUW11Ml9mMVtq3GQ_n0ofeGRM'
)
```
