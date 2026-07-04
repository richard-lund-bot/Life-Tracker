# Spor 🐾

**Spor** («track/trail» på norsk) er en enkel, lokal vanesporing-app — bygget fra
[spesifikasjonen i `docs/spor-habit-library.md`](docs/spor-habit-library.md).
Norwegian UI, English code.

Ingen konto, ingen server: alt lagres i nettleseren din (localStorage), og appen
fungerer offline som PWA. Eksporter/importer JSON når du vil ta backup eller bytte enhet.

## Kom i gang

Åpne `index.html` rett i nettleseren, eller server mappa lokalt (service worker og
PWA-installasjon krever http):

```sh
npx serve .
# eller
python3 -m http.server 8080
```

Trykk **«Bruk anbefalt startsett»** for de 7 anbefalte vanene, eller plukk fritt fra
biblioteket med ~60 vaner i 8 kategorier.

## Funksjoner

### Seks måletyper + ukemål (fra spesifikasjonen)

| Type | Slik logger du | Suksess når |
|---|---|---|
| ✅ Sjekk | ett trykk | logget den dagen |
| 🔢 Teller | − / ＋ stepper | verdi ≥ mål (eller ≤ mål ved retning «ned») |
| ⏱️ Minutter | hurtigknapper 5 · 10 · 20 · 30 · ✎ | minutter ≥ mål |
| 📏 Mengde | tall + enhet (km, g, kr …) | opp: ≥ mål · ned: ≤ mål · logg: kun trend |
| 🕐 Tidspunkt | klokkeslett (eller «nå») | på riktig side av målet («før 23:00») |
| 🚫 Unngå | *invertert:* dagen lykkes automatisk med mindre du logger en glipp | vises som «🔥 12 dager uten» |
| 🗓️ Ukemål | kombineres med alle typene | N fullføringer per uke, vises som 2/3 |

### I tillegg

- **Innsjekk fra dag én** — humør og energi (1–5) + valgfritt notat, siden
  korrelasjonsdata først blir interessant med måneder av historikk.
- **Statistikk** — perfekte dager (nå-rekke og totalt), fullføringsgrad,
  12-ukers varmekart per vane, rekker og beste rekker (dag- og ukebasert).
- **💡 Innsikt** — når du har nok innsjekk-historikk: gjennomsnittlig humør/energi
  på dager med fullført vane vs. ikke, rangert etter utslag.
- **Trend-sparkline** for «kun logg»-vaner som kroppsvekt (ingen rød/grønn).
- **Tilbakelogging** — bla til tidligere dager og fyll inn det du husker.
- **Arkivering** — bytt vaner fritt mellom sesonger, historikken består.
- **Konfetti** når alle dagens vaner er fullført. 🎉
- **Lyst/mørkt tema**, følger systemet eller manuell veksling.
- **Eksport/import** av alle data som JSON.

## Skysynk (valgfritt)

Appen har innebygd Supabase-synk: passordløs innlogging med engangskode på
e-post, offline-kø for endringer, og last-write-wins-fletting mellom enheter.
Oppsett tar ~5 minutter — se **[docs/supabase-setup.md](docs/supabase-setup.md)**:

1. Opprett et gratis Supabase-prosjekt kalt `spor` (region `eu-north-1`).
2. Kjør [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql)
   i SQL-editoren (tabeller + Row Level Security).
3. Lim inn Project URL og publishable key i [`js/config.js`](js/config.js).
4. Logg inn under **Vaner → Skysynk**.

Uten konfigurasjon kjører alt som før — helt lokalt.

## Prosjektstruktur

```
index.html                 appskall (tre faner: I dag · Statistikk · Vaner)
css/styles.css             tema (lys/mørk), komponenter
js/library.js              vanebiblioteket (~60 vaner) + anbefalt startsett
js/app.js                  tilstand, domenelogikk, rendering, hendelser
js/config.js               Supabase-nøkler (tom = kun lokal)
js/sync.js                 synk-adapter: auth, utboks, pull/flett
js/vendor/supabase.js      supabase-js (UMD, vendored — funker offline)
supabase/migrations/       databaseskjema med RLS
sw.js                      service worker (offline)
docs/                      spesifikasjon + Supabase-oppsett
```

## Veikart (fra spesifikasjonen)

- [x] Supabase-synk — klient ferdig; opprett prosjektet og lim inn nøklene
      (se over).
- [ ] Push av skritt/søvn fra Garmin-shortcut.
- [ ] Påminnelser (web push).
