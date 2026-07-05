# Spor — sync & deployment handoff (2026-07-05)

Continuation doc for finishing **Supabase email login** and the **GitHub Pages
deployment** of Spor. Read this alongside the original build handoff in
`docs/session-handoff.md` (that one covers the app itself; this one covers the
go-live problems we hit after merge).

## TL;DR of where we are

- The app is **built, merged to `main`, and deployed**. Live at
  **https://richard-lund-bot.github.io/Life-Tracker/** (GitHub Pages, project
  site). Working locally and online.
- Supabase schema is **applied and verified** (see below). Login *authenticates
  correctly* — the only blocker is the post-login **redirect landing on a 404**.
- Root cause of the 404 is understood (below). Fix in progress: a **root
  forwarder repo**. It's created but still needs one file committed.

## Connections the NEXT session must have

This is the important part — the current session kept hitting permission walls.

1. **GitHub write access to TWO repos:**
   - `richard-lund-bot/life-tracker` (the app) — was in scope this session. ✅
   - `richard-lund-bot/richard-lund-bot.github.io` (the forwarder) — **was NOT
     in scope.** Creating it and writing to it both returned
     `403 Resource not accessible by integration` / "not configured for this
     session". The user created the repo manually. To let Claude push to it,
     **add it at session start** (or approve `add_repo` for
     `richard-lund-bot/richard-lund-bot.github.io`). `add_repo` this session
     failed with "MCP tool call requires approval".
2. **Supabase MCP** on project `bynvelvcbpdnvhpwjuru`:
   - `apply_migration`, `list_tables`, `get_advisors`, `get_project_url`,
     `get_publishable_keys` all worked. ✅
   - `execute_sql` was **blocked** ("MCP tool call requires approval") — needed
     for session revocation / auth debugging. Get this pre-approved.
3. **GitHub Actions read** (via `mcp__github__actions_*`) — worked, used to
   diagnose Pages deploys.
4. Web egress from the sandbox **cannot reach `*.github.io` or `supabase.co`**
   (403 at the agent proxy), and `WebFetch` is blocked on those hosts too. So
   the live site/login can only be verified by the human. Diagnose deploys via
   the Actions API instead.

## Supabase project (unchanged, confirmed correct)

| | |
|---|---|
| Project ref | `bynvelvcbpdnvhpwjuru` |
| URL | `https://bynvelvcbpdnvhpwjuru.supabase.co` |
| Publishable key | `sb_publishable_uppu5OuUW11Ml9mMVtq3GQ_n0ofeGRM` (matches `js/config.js`) |
| User id (richard-lund@hotmail.com) | `3159610b-ba09-4082-9db0-7fc926277db5` |

Schema: tables `habits`, `logs`, `checkins` applied via migration
`init_spor_schema`, all RLS-enabled with owner-only policies, `get_advisors`
security = clean. NOTE: a **separate generic life-tracking schema** already
existed in this project (tables `profiles`, `goals`, `journal_entries`,
`metrics`, `metric_logs`, `mood_logs`, `habit_logs`, and a colliding `habits`
which we renamed to **`habits_legacy`**). All were empty. They can be dropped if
the user confirms they're unwanted — not done yet.

## The login problem (root cause)

Auth **works** — a valid session is minted. The failure is purely the redirect
target. A freshly generated magic link contains:

```
redirect_to=https://richard-lund-bot.github.io/      ← bare domain, no /Life-Tracker/
```

So after verifying, Supabase drops the user at
`https://richard-lund-bot.github.io/#access_token=…`, which **404s because
nothing is published at the domain root** (the app is a *project* site under
`/Life-Tracker/`).

Why bare domain? Supabase has no knowledge of the `/Life-Tracker/` subpath. It
echoes back whatever URL it was handed: either the app's `emailRedirectTo` or,
as fallback, the **Site URL**. The bare-origin-with-slash shape is the
fingerprint of the Site URL fallback resolving to just the origin — consistent
with the browser still running the **old service-worker-cached build** (pre-fix
`sync.js` sent no `emailRedirectTo`) and/or the dashboard Site URL edit not yet
propagated to the running GoTrue config.

Supabase dashboard **is** now set correctly (user confirmed, saved):
- Auth → URL Configuration → **Site URL** = `https://richard-lund-bot.github.io/Life-Tracker/`
- **Redirect URLs** allow-list includes `https://richard-lund-bot.github.io/Life-Tracker/**`

…but a fresh link still came out bare, which is why we stopped fighting config
and went with the forwarder.

## The fix: root forwarder (IN PROGRESS)

Make the bare domain stop being a 404 by publishing a **GitHub user site** at
the root that bounces to the app, preserving the token fragment.

- New repo **`richard-lund-bot/richard-lund-bot.github.io`** — created by the
  user (exists, `main`, README only).
- **Still needs `index.html` committed** (Claude couldn't push — repo not in
  session scope; user is adding it via
  `https://github.com/richard-lund-bot/richard-lund-bot.github.io/new/main`).

Exact `index.html` contents:

```html
<!DOCTYPE html>
<html lang="no">
<head>
  <meta charset="utf-8">
  <title>Spor</title>
  <script>
    // Root forwarder: send the domain root — and any auth token that Supabase
    // appended in the query or hash — on to the real app under /Life-Tracker/.
    location.replace('/Life-Tracker/' + location.search + location.hash);
  </script>
</head>
<body>Sender deg videre til Spor…</body>
</html>
```

Why it works: the token rides in the URL **fragment** (`#access_token=…`), which
never goes to the server, so GitHub serving this page preserves it in the
browser; the script then carries `search + hash` over to `/Life-Tracker/`, where
supabase-js reads the session. Immune to the Site URL / cache / allow-list
quirks because it no longer depends on Supabase producing the right path.

## Remaining steps (do in order)

1. **Commit `index.html`** to `richard-lund-bot.github.io` (user in progress).
   Verify `https://richard-lund-bot.github.io/` redirects to `/Life-Tracker/`.
   (May need repo Settings → Pages source = `main` / root; user sites usually
   auto-publish.)
2. **Clear the stale app build** on the user's device: app → DevTools →
   Application → Service Workers → **Unregister** → reload. Ensures the new
   `sync.js` (which sends `emailRedirectTo`) is running.
3. **Fresh login:** app → Vaner → Skysynk → enter email → "Send innloggingslenke"
   → click the link in the mail. Should land in `/Life-Tracker/`, logged in.
4. **Verify sync:** first login triggers a full push; confirm rows appear in
   Supabase Table Editor (`habits`, `logs`, `checkins`) — or via `execute_sql`
   `select count(*)` per table once approved.
5. **Session hygiene:** several magic-link URLs (with live tokens) were pasted
   into chat during debugging. User already ran
   `delete from auth.sessions where user_id = '3159610b-…';` (returned success).
   Re-run if any new tokens were exposed. Unused one-time `token=` values in
   verify links expire ~1h; don't click old links.

## Code changes made this session (committed to `main`)

- `2efe2e9` — sync.js: send `emailRedirectTo = origin + pathname` so magic links
  return to the app; run `afterLogin()` (not just `syncNow`) for sessions that
  arrive during `init` (magic-link return); keep the 6-digit code input as a
  fallback. app.js login card reworded to "innloggingslenke" + link-first copy.
  sw.js cache bumped `spor-v2` → `spor-v3`.
- `8b2695f` — added `.nojekyll` (Pages was failing a transient deploy; a
  push-triggered rebuild fixed it and `.nojekyll` avoids Jekyll processing).

Possible follow-up code hardening (not done): change `emailRedirectTo` to an
**absolute** `https://richard-lund-bot.github.io/Life-Tracker/` instead of
`origin + pathname`, to guard against PWA `start_url` making `pathname` wrong.
Low priority once the forwarder is live.

## Deploy notes

- GitHub Pages workflow = `dynamic/pages/pages-build-deployment` on `main`.
  Pushes deploy in ~30–40s. One early run failed with "Deployment failed, try
  again later" (transient GitHub-side); a subsequent push succeeded.
- Verify deploys via `mcp__github__actions_list` /
  `actions_get get_workflow_run` on `richard-lund-bot/life-tracker` — the human
  confirms the live page since the sandbox can't reach `github.io`.
