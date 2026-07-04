# Supabase-oppsett for Spor

Synk er valgfritt — appen er fullt brukbar lokalt. Med synk får du samme data på
alle enheter, med passordløs innlogging (engangskode på e-post).

Alt klient-arbeidet er allerede gjort: `js/sync.js` (offline-kø + flett),
`js/vendor/supabase.js` (ingen CDN-avhengighet) og migrasjonen i
`supabase/migrations/20260704120000_init.sql`. Det eneste som gjenstår er å opprette
prosjektet og lime inn to verdier.

## 1. Opprett prosjektet

Gå til [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**:

- **Navn:** `spor` (eget, ferskt gratis-prosjekt — ikke delt med andre eksperimenter,
  jf. beslutning 5 i spesifikasjonen)
- **Region:** `eu-north-1` (Stockholm) — nærmest Norge
- Database-passordet trenger du aldri i appen; lagre det i en passordbehandler.

*(Alternativ: be Claude Code gjøre det i en interaktiv økt der Supabase-MCP-kall
kan godkjennes — verktøyene er koblet til, men krever godkjenning per kall.)*

## 2. Kjør migrasjonen

Dashboard → **SQL Editor** → lim inn hele innholdet i
[`supabase/migrations/20260704120000_init.sql`](../supabase/migrations/20260704120000_init.sql) → **Run**.

Dette oppretter `habits`, `logs` og `checkins` med Row Level Security slik at
hver bruker kun ser sine egne rader. Skjemaet følger spesifikasjonens delta
(`kind`, `unit`, `direction`, `target_time`, `weekly_target`, `logs.value numeric`,
`logs.at time`).

Med Supabase CLI i stedet (repoet har `supabase/config.toml`, så `supabase init`
trengs ikke):

```sh
supabase login
supabase link --project-ref bynvelvcbpdnvhpwjuru   # spør etter databasepassordet
supabase db push                                    # kjører migrasjonen
```

## 3. Sjekk innloggingsmetoden

Dashboard → **Authentication → Sign In / Up → Email**: skal være **på**
(standard). Appen bruker engangskode (OTP), ikke magisk lenke, så ingen
redirect-URL trengs. Uten egen SMTP er utsending begrenset til noen få
e-poster i timen — mer enn nok til personlig bruk.

## 4. Lim inn nøklene i appen

Dashboard → **Project Settings → API**:

- **Project URL** → `supabaseUrl` i [`js/config.js`](../js/config.js)
- **Publishable key** (`sb_publishable_…`) → `supabaseKey`

```js
const SPOR_CONFIG = {
  supabaseUrl: 'https://DIN-REF.supabase.co',
  supabaseKey: 'sb_publishable_…',
};
```

Begge verdiene er trygge å committe: nøkkelen er offentlig per design, og RLS
avgjør hva den får lese.

## 5. Logg inn og synk

Åpne appen → **Vaner** → **Skysynk** → skriv e-postadressen din → «Send
innloggingskode» → tast inn koden. Ved første innlogging lastes alt lokalt
innhold opp; deretter synkes hver endring automatisk (2,5 s debounce), ved
oppstart og når nettverket kommer tilbake. «Synk nå»-knappen finnes også.

## Slik virker synken

- **Lokal-først:** localStorage er alltid sannheten; skyen er en kopi.
- **Utboks:** hver endring legges i en kø som tåler offline og flushes i
  rekkefølge (vaner før logger, pga. fremmednøkler).
- **Flett:** ved pull vinner nyeste `updated_at` per rad (last-write-wins);
  lokale endringer som venter i køen overstyres aldri av pull.
- **Kjent begrensning:** sletting har ingen gravsteiner — sletter du på én
  enhet mens en annen er offline, kan den andre enheten gjenopplive raden ved
  neste push. Akseptabelt for personlig bruk i V1.

## Feilsøking

- «Ikke konfigurert» i Skysynk-kortet → `js/config.js` er tom eller siden er
  ikke lastet på nytt etter endring (hard-refresh pga. service worker-cache).
- Kode kommer ikke på e-post → sjekk spam; Supabase gratis-SMTP er
  rate-begrenset, vent en time eller sett opp egen SMTP.
- `⚠️`-detalj i Skysynk-kortet viser siste synk-feil; endringene ligger trygt
  i køen og prøves igjen ved neste synk.
