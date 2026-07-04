/* Spor — built-in habit library ("Legg til vane" picker).
 * Weekdays use JS getDay() numbering: 0=Sunday … 6=Saturday.
 * Omitted fields get defaults when a habit is created from a template:
 * weekdays=[all], direction='opp', timeSide='before'. `weekly` → weeklyTarget. */

const HABIT_LIBRARY = [
  {
    category: '🏋️ Trening & kropp',
    items: [
      { id: 'styrkeokt', emoji: '🏋️', name: 'Styrkeøkt', kind: 'sjekk', weekdays: [1, 3, 5] },
      { id: 'ringdrill', emoji: '🤸', name: 'Ring-/muscle-up-drill', kind: 'sjekk', weekly: 2 },
      { id: 'handstaende', emoji: '🤾', name: 'Håndstående-øving', kind: 'minutter', target: 10 },
      { id: 'lopetur', emoji: '🏃', name: 'Løpetur', kind: 'mengde', target: 5, unit: 'km', weekly: 1 },
      { id: 'gatur', emoji: '🚶', name: 'Gåtur', kind: 'minutter', target: 30 },
      { id: 'skritt', emoji: '👟', name: 'Skritt', kind: 'teller', target: 10000 },
      { id: 'kettlebell', emoji: '💪', name: 'Kettlebell swings', kind: 'teller', target: 100 },
      { id: 'toying', emoji: '🧘', name: 'Tøying / mobilitet', kind: 'minutter', target: 10 },
      { id: 'kalddusj', emoji: '🚿', name: 'Kalddusj', kind: 'sjekk' },
      { id: 'kroppsvekt', emoji: '⚖️', name: 'Kroppsvekt', kind: 'mengde', unit: 'kg', direction: 'logg' },
    ],
  },
  {
    category: '🥦 Mat & drikke',
    items: [
      { id: 'vann', emoji: '💧', name: 'Vann', kind: 'teller', target: 6, unit: 'glass' },
      { id: 'ingen-sotsaker', emoji: '🍬', name: 'Ingen søtsaker', kind: 'unngaa' },
      { id: 'ingen-brus', emoji: '🥤', name: 'Ingen brus', kind: 'unngaa' },
      { id: 'protein', emoji: '🥩', name: 'Proteinmål', kind: 'mengde', target: 170, unit: 'g' },
      { id: 'gronnsaker', emoji: '🥦', name: 'Grønnsaker til middag', kind: 'sjekk' },
      { id: 'frukt', emoji: '🍎', name: 'Frukt', kind: 'teller', target: 2 },
      { id: 'kaffe-tak', emoji: '☕', name: 'Kaffe-tak', kind: 'teller', target: 2, direction: 'ned', unit: 'kopper' },
      { id: 'ingen-kveldssnacks', emoji: '🌙', name: 'Ingen kveldssnacks', kind: 'unngaa' },
      { id: 'matpakke', emoji: '🥪', name: 'Matpakke til jobb', kind: 'sjekk', weekdays: [1, 2, 3, 4, 5] },
      { id: 'alkoholfri', emoji: '🍺', name: 'Alkoholfri dag', kind: 'sjekk', weekdays: [0, 1, 2, 3, 4] },
    ],
  },
  {
    category: '😴 Søvn & kveld',
    items: [
      { id: 'seng-for-23', emoji: '🛏️', name: 'I seng før 23', kind: 'tidspunkt', targetTime: '23:00' },
      { id: 'opp-for-0630', emoji: '⏰', name: 'Opp før 06:30', kind: 'tidspunkt', targetTime: '06:30', weekdays: [1, 2, 3, 4, 5] },
      { id: 'skjerm-av-22', emoji: '📵', name: 'Skjerm av før 22', kind: 'tidspunkt', targetTime: '22:00' },
      { id: 'mobil-ut', emoji: '🚪', name: 'Mobil ut av soverommet', kind: 'sjekk' },
      { id: 'sovn-7t', emoji: '💤', name: '7+ timer søvn', kind: 'mengde', target: 7, unit: 't' },
      { id: 'kveldsrutine', emoji: '🕯️', name: 'Kveldsrutine fullført', kind: 'sjekk' },
    ],
  },
  {
    category: '🧠 Hode & ro',
    items: [
      { id: 'lese', emoji: '📖', name: 'Lese', kind: 'minutter', target: 20 },
      { id: 'meditasjon', emoji: '🧘‍♂️', name: 'Pust / meditasjon', kind: 'minutter', target: 10 },
      { id: 'journal', emoji: '✍️', name: 'Journal — tre linjer', kind: 'sjekk' },
      { id: 'takknemlighet', emoji: '🙏', name: 'Én takknemlighet', kind: 'sjekk' },
      { id: 'laere-nytt', emoji: '🎓', name: 'Lære noe nytt', kind: 'minutter', target: 15, weekly: 3 },
      { id: 'ingen-nyheter', emoji: '📰', name: 'Ingen nyheter før lunsj', kind: 'unngaa', weekdays: [1, 2, 3, 4, 5] },
      { id: 'some-tak', emoji: '📱', name: 'Sosiale medier-tak', kind: 'mengde', target: 30, unit: 'min', direction: 'ned' },
      { id: 'dagslys', emoji: '☀️', name: 'Ut i dagslys', kind: 'minutter', target: 15 },
    ],
  },
  {
    category: '👨‍👩‍👧‍👦 Familie & relasjoner',
    items: [
      { id: 'gulvtid', emoji: '🧸', name: 'Gulvtid med barna (uten mobil)', kind: 'minutter', target: 20 },
      { id: 'kvalitetstid', emoji: '❤️', name: 'Kvalitetstid med Jennie', kind: 'sjekk', weekly: 2 },
      { id: 'ringe-venn', emoji: '📞', name: 'Ringe venn / familie', kind: 'sjekk', weekly: 1 },
      { id: 'spillkveld', emoji: '🎲', name: 'Spillkveld', kind: 'sjekk', weekly: 1 },
      { id: 'middag-sammen', emoji: '🍳', name: 'Lage middag sammen', kind: 'sjekk', weekly: 2 },
      { id: 'familietur', emoji: '🌲', name: 'Familietur ut', kind: 'sjekk', weekly: 1 },
      { id: 'mobilfri-middag', emoji: '📵', name: 'Mobilfri middag', kind: 'sjekk' },
    ],
  },
  {
    category: '🔨 Hjem & prosjekt',
    items: [
      { id: 'husprosjekt', emoji: '🏗️', name: 'Husprosjekt-økt (rødt hus)', kind: 'minutter', target: 30, weekly: 3 },
      { id: 'hobbysnekring', emoji: '🪵', name: 'Hobbysnekring', kind: 'sjekk', weekly: 1 },
      { id: 'rydding-15', emoji: '🧹', name: '15-minutters rydding', kind: 'minutter', target: 15 },
      { id: 'hage', emoji: '🌱', name: 'Hage / uteområde', kind: 'sjekk', weekly: 2 },
      { id: 'vedlikehold', emoji: '🔧', name: 'Én ting fra vedlikeholdslista', kind: 'sjekk', weekly: 1 },
      { id: 'bilstell', emoji: '🚗', name: 'Bilstell', kind: 'sjekk', weekly: 1 },
      { id: 'papirer', emoji: '📥', name: 'Papirer / innboks null hjemme', kind: 'sjekk', weekly: 1 },
    ],
  },
  {
    category: '💼 Jobb & fokus',
    items: [
      { id: 'viktigste-forst', emoji: '🎯', name: 'Viktigste oppgave først', kind: 'sjekk', weekdays: [1, 2, 3, 4, 5] },
      { id: 'fokusblokker', emoji: '🍅', name: 'Fokusblokker', kind: 'teller', target: 3, unit: 'blokker', weekdays: [1, 2, 3, 4, 5] },
      { id: 'innboks-tomt', emoji: '📧', name: 'Innboks tømt', kind: 'sjekk', weekdays: [1, 2, 3, 4, 5] },
      { id: 'crm-oppdatert', emoji: '🗂️', name: 'CRM/notater oppdatert', kind: 'sjekk', weekdays: [1, 2, 3, 4, 5] },
      { id: 'agentur-research', emoji: '🕵️', name: 'Agentur-research', kind: 'minutter', target: 20, weekly: 2 },
      { id: 'moteforberedt', emoji: '🗣️', name: 'Forberedt til alle møter', kind: 'sjekk', weekdays: [1, 2, 3, 4, 5] },
      { id: 'lunsjpause', emoji: '🥗', name: 'Faktisk tatt lunsjpause', kind: 'sjekk', weekdays: [1, 2, 3, 4, 5] },
    ],
  },
  {
    category: '💰 Økonomi',
    items: [
      { id: 'ingen-impulskjop', emoji: '🛑', name: 'Ingen impulskjøp', kind: 'unngaa' },
      { id: 'sparing', emoji: '🏦', name: 'Overført til sparing', kind: 'mengde', target: 500, unit: 'kr', weekly: 1 },
      { id: 'utgifter-loggfort', emoji: '🧾', name: 'Utgifter loggført', kind: 'sjekk', weekly: 1 },
      { id: 'no-spend', emoji: '🚫', name: 'No-spend-dag', kind: 'sjekk', weekly: 2 },
      { id: 'solgt-gitt-bort', emoji: '📦', name: 'Solgt/gitt bort én ting', kind: 'sjekk', weekly: 1 },
    ],
  },
];

/* Recommended starter set: one per major life area, two types of hard
 * (physical + restraint), nothing that requires a good day to complete. */
const STARTER_SET = [
  'styrkeokt', 'ingen-sotsaker', 'lese', 'vann', 'seng-for-23', 'gulvtid', 'husprosjekt',
];

const PICKER_GUIDANCE =
  'Maks 7 aktive. Velg fra maks 3–4 kategorier — et godt sett dekker kropp, hode og én ' +
  'relasjon/ett prosjekt, ikke alt på én gang. Start lettere enn du tror: en vane du klarer ' +
  'på en dårlig dag er verdt ti du bare klarer på gode dager. Arkivér og bytt fritt mellom ' +
  'sesonger — historikken består.';
