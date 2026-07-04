# Spor — decisions & habit library

*Addendum to spor-life-tracker-spec.md*

---

## Decisions (locked)

1. **Name:** Spor.
2. **Habit set:** the app ships with the library below as an in-app picker; recommended starter set at the bottom.
3. **Language:** Norwegian UI, English code and spec.
4. **Check-ins:** in V1 from day one — mood/energy correlation data only becomes interesting with months of history, so start collecting immediately.
5. **Supabase:** fresh free-tier project named `spor`, nothing shared with other experiments.

---

## Measurement types (expanded from the spec's check/counter)

Six ways to measure + one schedule mode. Every habit in the library uses one of these.

| Type | How you log | Counts as success when |
|---|---|---|
| ✅ **Sjekk** | one tap | logged that day |
| 🔢 **Teller** | stepper / tap-per-unit | value ≥ target (or ≤ target when direction = ned) |
| ⏱️ **Minutter** | quick-chips: 5 · 10 · 20 · 30 · egendefinert | minutes ≥ target |
| 📏 **Mengde** | number + unit (km, kg, gram, sider, kr…) | direction **opp**: ≥ target · **ned**: ≤ target · **logg**: no success, trend-only (e.g. body weight) |
| 🕐 **Tidspunkt** | pick a clock time | logged time is on the right side of target ("før 23:00", "etter 06:30") |
| 🚫 **Unngå** | *inverted:* the day auto-succeeds unless you log a slip | no slip logged. Renders as "12 dager uten" — the 1000 Nos mechanic, generalized |
| 🗓️ **Ukemål** *(schedule mode, combinable with any type)* | — | N completions per week instead of fixed weekdays. Success computed per week, shown as 2/3 |

**Schema delta** for the spec:

```sql
-- habits.kind: 'sjekk','teller','minutter','mengde','tidspunkt','unngaa'
alter table habits
  add column unit text,
  add column direction text not null default 'opp'
    check (direction in ('opp','ned','logg')),
  add column target_time time,
  add column weekly_target int;      -- NULL → use weekdays[]
alter table logs alter column value type numeric;
alter table logs add column at time;  -- for tidspunkt-habits
```

Unngå needs no cron: at read time, a scheduled past day with no slip row = success.

---

## Habit library (~60)

Ships in-app as the "Legg til vane"-picker, grouped like this. Targets are defaults, all editable.

### 🏋️ Trening & kropp

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 🏋️ | Styrkeøkt | Sjekk | ma · on · fr |
| 🤸 | Ring-/muscle-up-drill | Sjekk | Ukemål 2× |
| 🤾 | Håndstående-øving | Minutter | 10 min |
| 🏃 | Løpetur | Mengde | 5 km, ukemål 1× |
| 🚶 | Gåtur | Minutter | 30 min |
| 👟 | Skritt | Teller | 10 000 (push fra Garmin-shortcut) |
| 💪 | Kettlebell swings | Teller | 100 |
| 🧘 | Tøying / mobilitet | Minutter | 10 min |
| 🚿 | Kalddusj | Sjekk | daglig |
| ⚖️ | Kroppsvekt | Mengde (logg) | kg, kun trend — ingen rød/grønn |

### 🥦 Mat & drikke

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 💧 | Vann | Teller | 6 glass |
| 🍬 | Ingen søtsaker | Unngå | — |
| 🥤 | Ingen brus | Unngå | — |
| 🥩 | Proteinmål | Mengde | 170 g (opp) |
| 🥦 | Grønnsaker til middag | Sjekk | daglig |
| 🍎 | Frukt | Teller | 2 |
| ☕ | Kaffe-tak | Teller | maks 2 (ned) |
| 🌙 | Ingen kveldssnacks | Unngå | — |
| 🥪 | Matpakke til jobb | Sjekk | ma–fr |
| 🍺 | Alkoholfri dag | Sjekk | søn–tor |

### 😴 Søvn & kveld

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 🛏️ | I seng før 23 | Tidspunkt | før 23:00 |
| ⏰ | Opp før 06:30 | Tidspunkt | før 06:30, ma–fr |
| 📵 | Skjerm av før 22 | Tidspunkt | før 22:00 |
| 🚪 | Mobil ut av soverommet | Sjekk | daglig |
| 💤 | 7+ timer søvn | Mengde | 7 t (Garmin) |
| 🕯️ | Kveldsrutine fullført | Sjekk | daglig |

### 🧠 Hode & ro

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 📖 | Lese | Minutter | 20 min |
| 🧘‍♂️ | Pust / meditasjon | Minutter | 10 min |
| ✍️ | Journal — tre linjer | Sjekk | daglig |
| 🙏 | Én takknemlighet | Sjekk | daglig |
| 🎓 | Lære noe nytt | Minutter | 15 min, ukemål 3× |
| 📰 | Ingen nyheter før lunsj | Unngå | ma–fr |
| 📱 | Sosiale medier-tak | Mengde | maks 30 min (ned) |
| ☀️ | Ut i dagslys | Minutter | 15 min |

### 👨‍👩‍👧‍👦 Familie & relasjoner

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 🧸 | Gulvtid med barna (uten mobil) | Minutter | 20 min |
| ❤️ | Kvalitetstid med Jennie | Sjekk | Ukemål 2× |
| 📞 | Ringe venn / familie | Sjekk | Ukemål 1× |
| 🎲 | Spillkveld | Sjekk | Ukemål 1× |
| 🍳 | Lage middag sammen | Sjekk | Ukemål 2× |
| 🌲 | Familietur ut | Sjekk | Ukemål 1× (helg) |
| 📵 | Mobilfri middag | Sjekk | daglig |

### 🔨 Hjem & prosjekt

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 🏗️ | Husprosjekt-økt (rødt hus) | Minutter | 30 min, ukemål 3× |
| 🪵 | Hobbysnekring | Sjekk | Ukemål 1× |
| 🧹 | 15-minutters rydding | Minutter | 15 min |
| 🌱 | Hage / uteområde | Sjekk | Ukemål 2× (sesong) |
| 🔧 | Én ting fra vedlikeholdslista | Sjekk | Ukemål 1× |
| 🚗 | Bilstell | Sjekk | Ukemål 1× |
| 📥 | Papirer / innboks null hjemme | Sjekk | Ukemål 1× |

### 💼 Jobb & fokus

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 🎯 | Viktigste oppgave først | Sjekk | ma–fr |
| 🍅 | Fokusblokker | Teller | 3 à 25 min, ma–fr |
| 📧 | Innboks tømt | Sjekk | ma–fr |
| 🗂️ | CRM/notater oppdatert | Sjekk | ma–fr |
| 🕵️ | Agentur-research | Minutter | 20 min, ukemål 2× |
| 🗣️ | Forberedt til alle møter | Sjekk | ma–fr |
| 🥗 | Faktisk tatt lunsjpause | Sjekk | ma–fr |

### 💰 Økonomi

| | Vane | Type | Mål/plan |
|---|---|---|---|
| 🛑 | Ingen impulskjøp | Unngå | — |
| 🏦 | Overført til sparing | Mengde | kr, ukemål 1× |
| 🧾 | Utgifter loggført | Sjekk | Ukemål 1× |
| 🚫💳 | No-spend-dag | Sjekk | Ukemål 2× |
| 📦 | Solgt/gitt bort én ting | Sjekk | Ukemål 1× |

---

## How to pick (in-app guidance text)

Maks 7 aktive. Velg fra maks 3–4 kategorier — et godt sett dekker kropp, hode og én relasjon/ett prosjekt, ikke alt på én gang. Start lettere enn du tror: en vane du klarer på en dårlig dag er verdt ti du bare klarer på gode dager. Arkivér og bytt fritt mellom sesonger — historikken består.

## Recommended starter 7 (Richard)

🏋️ Styrkeøkt (ma·on·fr) · 🍬 Ingen søtsaker (unngå) · 📖 Lese 20 min · 💧 Vann ×6 · 🛏️ I seng før 23 · 🧸 Gulvtid med barna 20 min · 🏗️ Husprosjekt-økt (ukemål 3×)

One per major life area, two types of hard (physical + restraint), nothing that requires a good day to complete.
