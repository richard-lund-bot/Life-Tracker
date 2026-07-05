/* Spor — a local-first habit tracker. Norwegian UI, English code.
 * Data lives in localStorage; export/import as JSON from the "Vaner" tab. */

(() => {
  'use strict';

  // ---------------------------------------------------------------- constants

  const STORE_KEY = 'spor:v1';
  const HEATMAP_WEEKS = 12;
  const CORRELATION_WINDOW_DAYS = 90;
  const CORRELATION_MIN_GROUP = 5;

  const DAY_SHORT = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']; // Monday-first
  const MOOD_FACES = ['😖', '😕', '😐', '🙂', '😄'];
  const MINUTE_CHIPS = [5, 10, 20, 30];

  const KIND_META = {
    sjekk: { icon: '✅', label: 'Sjekk' },
    teller: { icon: '🔢', label: 'Teller' },
    minutter: { icon: '⏱️', label: 'Minutter' },
    mengde: { icon: '📏', label: 'Mengde' },
    tidspunkt: { icon: '🕐', label: 'Tidspunkt' },
    unngaa: { icon: '🚫', label: 'Unngå' },
    poeng: { icon: '🎯', label: 'Poengmål' },
  };

  const POENG_DEFAULT_TARGET = 1000;

  // ---------------------------------------------------------------- utilities

  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad2 = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromISO = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const todayISO = () => toISO(new Date());
  const addDays = (iso, n) => {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  const dowMonFirst = (iso) => (fromISO(iso).getDay() + 6) % 7; // 0=Mon … 6=Sun
  const weekStartISO = (iso) => addDays(iso, -dowMonFirst(iso));
  const weekDates = (anyIso) => {
    const start = weekStartISO(anyIso);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  };

  const fmtLong = (iso) =>
    fromISO(iso).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = (iso) =>
    fromISO(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });

  const fmtNum = (n) => {
    const v = Math.round(n * 10) / 10;
    return String(v).replace('.', ',');
  };
  const daysText = (n) => `${n} ${n === 1 ? 'dag' : 'dager'}`;

  // ---------------------------------------------------------------- state

  const defaultState = () => ({
    habits: [],       // habit objects, see createHabit()
    logs: {},         // "habitId|YYYY-MM-DD" -> { value?, at?, updatedAt }  (unngaa: value 1 = slip)
    checkins: {},     // "YYYY-MM-DD" -> { mood?, energy?, note?, updatedAt }
    settings: { theme: null }, // null = follow system
    onboarded: false,
    outbox: [],       // pending sync ops, managed by SporSync
    syncInitialized: false,
  });

  let state = load();
  let ui = { tab: 'today', date: todayISO(), syncEmail: '', syncSent: false, syncError: '', syncBusy: false };
  let lastPerfectShown = null; // avoid re-firing confetti on re-render

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...(parsed.settings || {}) } };
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  // ---------------------------------------------------------------- domain

  function createHabit(tpl) {
    return {
      id: tpl.id || `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: tpl.name,
      emoji: tpl.emoji || '⭐',
      category: tpl.category || 'Egne vaner',
      kind: tpl.kind,
      target: tpl.target ?? (tpl.kind === 'poeng' ? POENG_DEFAULT_TARGET
        : tpl.kind === 'teller' || tpl.kind === 'minutter' || tpl.kind === 'mengde' ? 1 : null),
      unit: tpl.unit || null,
      direction: tpl.direction || 'opp',           // opp | ned | logg (mengde/teller)
      allowNegative: tpl.allowNegative || false,   // teller: la −-knappen gå under 0 (netto-score)
      targetTime: tpl.targetTime || null,          // "HH:MM" for tidspunkt
      timeSide: tpl.timeSide || 'before',          // before | after
      weeklyTarget: tpl.weekly ?? tpl.weeklyTarget ?? null, // N per week; null → weekdays[]
      weekdays: tpl.weekdays ? [...tpl.weekdays] : [0, 1, 2, 3, 4, 5, 6],
      createdAt: tpl.createdAt || todayISO(),
      archivedAt: tpl.archivedAt || null,
    };
  }

  const activeHabits = () => state.habits.filter((h) => !h.archivedAt);
  const archivedHabits = () => state.habits.filter((h) => h.archivedAt);
  const isWeekly = (h) => h.weeklyTarget != null;
  const habitById = (id) => state.habits.find((h) => h.id === id);

  const logKey = (id, iso) => `${id}|${iso}`;
  const getLog = (id, iso) => state.logs[logKey(id, iso)] || null;
  function setLog(id, iso, entry) {
    const key = logKey(id, iso);
    if (entry == null) delete state.logs[key];
    else state.logs[key] = { ...entry, updatedAt: Date.now() };
    save();
    SporSync.queue('log', entry == null ? 'del' : 'up', key);
  }

  function setCheckin(iso, ci) {
    if (ci && Object.keys(ci).length) state.checkins[iso] = { ...ci, updatedAt: Date.now() };
    else delete state.checkins[iso];
    save();
    SporSync.queue('checkin', ci && Object.keys(ci).length ? 'up' : 'del', iso);
  }

  function touchHabit(h) {
    h.updatedAt = Date.now();
    save();
    SporSync.queue('habit', 'up', h.id);
  }

  // Is this fixed-schedule habit due on the given date?
  const dueOnDay = (h, iso) => !isWeekly(h) && h.weekdays.includes(fromISO(iso).getDay());
  const existsOn = (h, iso) => iso >= h.createdAt && (!h.archivedAt || iso < h.archivedAt);

  /* Day status for a habit:
   *   'success' | 'fail' | 'open' (no verdict yet) | 'off' (not scheduled) | 'log' (trend-only)
   * "Limit" habits (unngå, direction=ned) auto-succeed unless a log breaks the limit —
   * the 1000-Nos mechanic generalized. */
  function statusFor(h, iso) {
    if (!existsOn(h, iso)) return 'off';
    if (h.direction === 'logg') return 'log';
    const scheduled = isWeekly(h) || h.weekdays.includes(fromISO(iso).getDay());
    if (!scheduled) return 'off';

    const log = getLog(h.id, iso);
    const past = iso < todayISO();

    switch (h.kind) {
      case 'sjekk':
        if (log && log.value >= 1) return 'success';
        return weeklyOrOpen(h, past);
      case 'unngaa':
        return log && log.value >= 1 ? 'fail' : 'success';
      case 'poeng':
        return 'log'; // cumulative goal — never a per-day verdict
      case 'teller':
      case 'minutter':
      case 'mengde': {
        const value = log ? Number(log.value) || 0 : null;
        if (h.direction === 'ned') return value != null && value > h.target ? 'fail' : 'success';
        if (value != null && value >= h.target) return 'success';
        return weeklyOrOpen(h, past);
      }
      case 'tidspunkt': {
        if (log && log.at) {
          const ok = h.timeSide === 'after' ? log.at >= h.targetTime : log.at <= h.targetTime;
          return ok ? 'success' : 'fail';
        }
        return weeklyOrOpen(h, past);
      }
      default:
        return 'open';
    }
  }

  // Weekly habits never fail on a single day; fixed-schedule ones fail once the day is over.
  const weeklyOrOpen = (h, past) => (isWeekly(h) ? 'open' : past ? 'fail' : 'open');

  const weekSuccessCount = (h, anyIso) =>
    weekDates(anyIso).filter((d) => d <= todayISO() && statusFor(h, d) === 'success').length;
  const weekMet = (h, anyIso) => weekSuccessCount(h, anyIso) >= h.weeklyTarget;

  function currentStreak(h) {
    if (isWeekly(h)) return weeklyStreak(h);
    let streak = 0;
    let d = todayISO();
    let first = true;
    while (d >= h.createdAt) {
      const s = statusFor(h, d);
      if (s === 'success') streak++;
      else if (s === 'fail') break;
      else if (s === 'open' && !first) break; // only today may be undecided
      first = false;
      d = addDays(d, -1);
    }
    return streak;
  }

  function weeklyStreak(h) {
    let streak = 0;
    let ws = weekStartISO(todayISO());
    if (weekMet(h, ws)) streak++; // current week counts once met…
    ws = addDays(ws, -7);         // …otherwise it just doesn't break the chain yet
    while (addDays(ws, 6) >= h.createdAt) {
      if (weekMet(h, ws)) streak++;
      else break;
      ws = addDays(ws, -7);
    }
    return streak;
  }

  function bestStreak(h) {
    if (isWeekly(h)) return bestWeeklyStreak(h);
    let best = 0, run = 0;
    for (let d = h.createdAt; d <= todayISO(); d = addDays(d, 1)) {
      const s = statusFor(h, d);
      if (s === 'success') { run++; best = Math.max(best, run); }
      else if (s === 'fail') run = 0;
    }
    return best;
  }

  function bestWeeklyStreak(h) {
    let best = 0, run = 0;
    for (let ws = weekStartISO(h.createdAt); ws <= todayISO(); ws = addDays(ws, 7)) {
      if (weekMet(h, ws)) { run++; best = Math.max(best, run); }
      else if (addDays(ws, 6) < todayISO()) run = 0; // current, unfinished week doesn't break
    }
    return best;
  }

  // Cumulative ("poeng") total — sum of every day's net delta, up to and
  // including `uptoIso`. Never resets; this is the running lifetime score.
  function cumulativeTotal(h, uptoIso) {
    let sum = 0;
    for (const key in state.logs) {
      const cut = key.lastIndexOf('|');
      if (key.slice(0, cut) !== h.id) continue;
      if (uptoIso && key.slice(cut + 1) > uptoIso) continue;
      sum += Number(state.logs[key].value) || 0;
    }
    return sum;
  }
  const poengReached = (h, iso) => h.target > 0 && cumulativeTotal(h, iso) >= h.target;

  // Days since last slip (unngå) — the "12 dager uten"-counter.
  function daysWithout(h, iso) {
    let count = 0;
    for (let d = iso; d >= h.createdAt; d = addDays(d, -1)) {
      const log = getLog(h.id, d);
      if (log && log.value >= 1) break;
      count++;
    }
    return count;
  }

  // Completion for the day ring: fixed-schedule, verdict-bearing habits only.
  function dayCompletion(iso) {
    const due = activeHabits().filter((h) => existsOn(h, iso) && dueOnDay(h, iso) && h.direction !== 'logg' && h.kind !== 'poeng');
    const done = due.filter((h) => statusFor(h, iso) === 'success').length;
    return { done, total: due.length };
  }

  function completionRate(h, days) {
    let done = 0, total = 0;
    for (let d = addDays(todayISO(), -(days - 1)); d <= todayISO(); d = addDays(d, 1)) {
      const s = statusFor(h, d);
      if (s === 'success') { done++; total++; }
      else if (s === 'fail') total++;
    }
    return total ? Math.round((100 * done) / total) : null;
  }

  // ---------------------------------------------------------------- rendering

  function applyTheme() {
    const theme = state.settings.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0e120f' : '#f4f6f2';
  }

  function render() {
    applyTheme();
    document.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === ui.tab));
    const view = $('#view');
    if (ui.tab === 'today') view.innerHTML = renderToday();
    else if (ui.tab === 'stats') view.innerHTML = renderStats();
    else view.innerHTML = renderManage();
  }

  // ------------------------------------------------ today

  function renderToday() {
    const iso = ui.date;
    const isToday = iso === todayISO();
    const habits = activeHabits().filter((h) => existsOn(h, iso));
    const daily = habits.filter((h) => h.kind !== 'poeng' && (dueOnDay(h, iso) || (!isWeekly(h) && h.direction === 'logg' && dueOnDay(h, iso))));
    const weekly = habits.filter((h) => isWeekly(h) && h.kind !== 'poeng');
    const poeng = habits.filter((h) => h.kind === 'poeng');
    const { done, total } = dayCompletion(iso);
    const pct = total ? done / total : 0;

    let html = `
      <div class="datenav">
        <button data-action="nav-prev" aria-label="Forrige dag">‹</button>
        <div class="day-title">
          <strong>${esc(cap(fmtLong(iso)))}</strong>
          <span>${isToday ? 'i dag' : 'tilbakelogging'}</span>
        </div>
        <button data-action="nav-next" aria-label="Neste dag" ${isToday ? 'disabled' : ''}>›</button>
      </div>
      ${isToday ? '' : `<button class="not-today-pill" data-action="nav-today">Hopp til i dag</button>`}
    `;

    if (habits.length === 0) {
      html += `
        <div class="card">
          <div class="empty-note">
            <p style="font-size:34px;margin:0">🐾</p>
            <p><strong>Velkommen til Spor!</strong><br>Legg til dine første vaner for å komme i gang.</p>
          </div>
          <button class="big-btn" data-action="picker-open">＋ Legg til vane</button>
          <button class="ghost-btn" data-action="starter-add">Bruk anbefalt startsett (7 vaner)</button>
        </div>`;
      return html;
    }

    if (total > 0) {
      html += `
        <div class="card hero">
          ${ringSVG(pct)}
          <div class="hero-text">
            <h2>${heroTitle(done, total, isToday)}</h2>
            <p>${done} av ${total} dagsvaner fullført${weekly.length ? ` · ${weekly.filter((h) => weekMet(h, iso)).length}/${weekly.length} ukemål i boks` : ''}</p>
          </div>
        </div>`;
    }

    html += renderCheckin(iso);

    if (daily.length) {
      html += `<div class="section-title">Dagens vaner</div>`;
      html += daily.map((h) => habitCard(h, iso)).join('');
    }
    const logOnly = habits.filter((h) => h.kind !== 'poeng' && h.direction === 'logg' && !isWeekly(h) && !dueOnDay(h, iso));
    if (weekly.length) {
      html += `<div class="section-title">Ukemål</div>`;
      html += weekly.map((h) => habitCard(h, iso)).join('');
    }
    if (poeng.length) {
      html += `<div class="section-title">Poengmål</div>`;
      html += poeng.map((h) => habitCard(h, iso)).join('');
    }
    if (logOnly.length) {
      html += `<div class="section-title">Kun logg</div>`;
      html += logOnly.map((h) => habitCard(h, iso)).join('');
    }
    return html;
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function heroTitle(done, total, isToday) {
    if (total === 0) return 'Ingen dagsvaner i dag';
    if (done === total) return isToday ? 'Perfekt dag! 🎉' : 'Perfekt dag 🎉';
    if (done / total >= 0.5) return 'Godt i gang 💪';
    return isToday ? 'Ett spor om gangen' : 'Fyll inn det du husker';
  }

  function ringSVG(pct) {
    const r = 30, c = 2 * Math.PI * r;
    const filled = Math.max(0.001, pct) * c;
    return `
      <div class="ring">
        <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">
          <circle cx="37" cy="37" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="8"/>
          <circle cx="37" cy="37" r="${r}" fill="none" stroke="var(--accent)" stroke-width="8"
                  stroke-linecap="round" stroke-dasharray="${filled} ${c}"/>
        </svg>
        <div class="ring-label">${Math.round(pct * 100)}%</div>
      </div>`;
  }

  function renderCheckin(iso) {
    const ci = state.checkins[iso] || {};
    const moodBtns = MOOD_FACES.map((face, i) => `
      <button data-action="checkin-mood" data-val="${i + 1}"
              class="${ci.mood === i + 1 ? 'selected' : ''}"
              aria-label="Humør ${i + 1} av 5">${face}</button>`).join('');
    const energyBtns = [1, 2, 3, 4, 5].map((n) => `
      <button data-action="checkin-energy" data-val="${n}"
              class="energy ${ci.energy === n ? 'selected' : ''}"
              aria-label="Energi ${n} av 5">${n}</button>`).join('');
    return `
      <div class="card checkin">
        <h3>Innsjekk ${ci.mood || ci.energy ? '✓' : ''}</h3>
        <div class="row"><span class="row-label">Humør</span><div class="scale">${moodBtns}</div></div>
        <div class="row"><span class="row-label">Energi ⚡</span><div class="scale">${energyBtns}</div></div>
        <input type="text" data-change="checkin-note" placeholder="Notat (valgfritt)" value="${esc(ci.note || '')}" maxlength="200">
      </div>`;
  }

  function habitCard(h, iso) {
    const s = statusFor(h, iso);
    const log = getLog(h.id, iso);
    const cls = h.kind === 'poeng'
      ? (poengReached(h, iso) ? 'done' : '')
      : s === 'success' ? 'done' : s === 'fail' && h.kind !== 'unngaa' ? 'failed' : '';
    return `
      <div class="card habit ${cls}" data-habit="${h.id}">
        <div class="emoji">${h.emoji}</div>
        <div class="habit-main">
          <div class="habit-name">${esc(h.name)}</div>
          <div class="habit-sub">${habitSubtitle(h, iso)}</div>
        </div>
        <div class="controls">${habitControls(h, iso, log, s)}</div>
      </div>`;
  }

  function habitSubtitle(h, iso) {
    const bits = [];
    if (isWeekly(h)) {
      const n = weekSuccessCount(h, iso);
      const dots = Array.from({ length: h.weeklyTarget }, (_, i) =>
        `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      bits.push(`${n}/${h.weeklyTarget} denne uka<span class="week-dots">${dots}</span>`);
    } else if (h.kind === 'unngaa') {
      const slipped = statusFor(h, iso) === 'fail';
      bits.push(slipped
        ? `<span class="oops">Glipp denne dagen</span>`
        : `<span class="streak">🔥 ${daysText(daysWithout(h, iso))} uten</span>`);
    } else if (h.kind === 'poeng') {
      const total = cumulativeTotal(h, iso);
      const pct = h.target > 0 ? Math.max(0, Math.min(1, total / h.target)) : 0;
      bits.push(`<span class="pbar"><i style="width:${Math.round(pct * 100)}%"></i></span>`);
      bits.push(poengReached(h, iso)
        ? `<span class="streak">🎯 Mål nådd! (${fmtNum(total)})</span>`
        : `${fmtNum(total)} / ${fmtNum(h.target)}${h.unit ? ' ' + esc(h.unit) : ''}`);
    } else if (h.direction === 'logg') {
      bits.push('kun trend — ingen rød/grønn');
    } else {
      bits.push(targetText(h));
      const streak = currentStreak(h);
      if (streak >= 2) bits.push(`<span class="streak">🔥 ${streak}</span>`);
    }
    return bits.join(' · ');
  }

  function targetText(h) {
    switch (h.kind) {
      case 'sjekk': return scheduleText(h);
      case 'teller': return h.direction === 'ned' ? `maks ${h.target}${h.unit ? ' ' + esc(h.unit) : ''}` : `mål: ${h.target}${h.unit ? ' ' + esc(h.unit) : ''}`;
      case 'minutter': return `mål: ${h.target} min`;
      case 'mengde': return h.direction === 'ned' ? `maks ${fmtNum(h.target)} ${esc(h.unit || '')}` : `mål: ${fmtNum(h.target)} ${esc(h.unit || '')}`;
      case 'tidspunkt': return `${h.timeSide === 'after' ? 'etter' : 'før'} ${h.targetTime}`;
      case 'poeng': return `mål: ${fmtNum(h.target)}${h.unit ? ' ' + esc(h.unit) : ' poeng'} (akkumulert)`;
      default: return '';
    }
  }

  function scheduleText(h) {
    if (isWeekly(h)) return `${h.weeklyTarget}× i uka`;
    if (h.weekdays.length === 7) return 'daglig';
    const monFirst = [1, 2, 3, 4, 5, 6, 0];
    return monFirst.filter((d) => h.weekdays.includes(d))
      .map((d) => DAY_SHORT[(d + 6) % 7].slice(0, 2)).join('·');
  }

  function habitControls(h, iso, log, s) {
    const value = log ? Number(log.value) || 0 : 0;
    switch (h.kind) {
      case 'sjekk':
        return `<button class="check-btn ${value >= 1 ? 'on' : ''}" data-action="toggle-check"
                        aria-label="${value >= 1 ? 'Fjern avhuking' : 'Merk som gjort'}">✓</button>`;
      case 'teller':
        return `
          <div class="stepper">
            <button data-action="counter-dec" aria-label="Minus én">−</button>
            <span class="val">${value}${h.direction === 'logg' ? '' : `<small>/${h.target}</small>`}</span>
            <button data-action="counter-inc" aria-label="Pluss én">＋</button>
          </div>`;
      case 'poeng': {
        const total = cumulativeTotal(h, iso);
        const today = value;
        return `
          <div class="stepper poeng">
            <button data-action="counter-dec" aria-label="Minus én">−</button>
            <span class="val">${fmtNum(total)}${today ? `<small>${today > 0 ? '+' : ''}${fmtNum(today)} i dag</small>` : ''}</span>
            <button data-action="counter-inc" aria-label="Pluss én">＋</button>
          </div>`;
      }
      case 'minutter': {
        const chips = MINUTE_CHIPS.map((m) =>
          `<button data-action="minutes-add" data-min="${m}">+${m}</button>`).join('');
        return `
          <div class="chips">
            <span class="val" style="align-self:center;font-weight:700;font-size:13px">${value ? value + ' min' : ''}</span>
            ${chips}
            <button data-action="minutes-custom">✎</button>
            ${value ? '<button class="chip-reset" data-action="minutes-reset" aria-label="Nullstill">×</button>' : ''}
          </div>`;
      }
      case 'mengde':
        return `
          <div class="amount">
            <input type="number" inputmode="decimal" step="any" data-change="amount"
                   value="${log && log.value != null ? esc(log.value) : ''}" placeholder="0"
                   aria-label="Verdi i ${esc(h.unit || 'enheter')}">
            <span class="unit">${esc(h.unit || '')}</span>
          </div>`;
      case 'tidspunkt':
        return `
          <div class="amount">
            <input type="time" data-change="time" value="${log && log.at ? esc(log.at) : ''}"
                   aria-label="Tidspunkt">
            ${log && log.at ? (s === 'success' ? '<span>✅</span>' : '<span>❌</span>') : `<button class="undo-btn" data-action="time-now">nå</button>`}
          </div>`;
      case 'unngaa':
        return s === 'fail'
          ? `<button class="undo-btn" data-action="slip-undo">angre glipp</button>`
          : `<button class="slip-btn" data-action="slip">Logg glipp</button>`;
      default:
        return '';
    }
  }

  // ------------------------------------------------ stats

  function renderStats() {
    const habits = activeHabits();
    if (!habits.length && !Object.keys(state.checkins).length) {
      return `<div class="card"><div class="empty-note">Statistikken våkner når du har vaner og noen dager med historikk. 🌱</div></div>`;
    }

    let perfectStreak = 0;
    for (let d = todayISO(); ; d = addDays(d, -1)) {
      const { done, total } = dayCompletion(d);
      if (total > 0 && done === total) perfectStreak++;
      else if (d === todayISO() && total > 0) { /* today not perfect yet — look back */ }
      else break;
      if (perfectStreak > 3650) break;
    }
    let perfectTotal = 0;
    const earliest = habits.length ? habits.reduce((a, h) => (h.createdAt < a ? h.createdAt : a), todayISO()) : todayISO();
    for (let d = earliest; d <= todayISO(); d = addDays(d, 1)) {
      const { done, total } = dayCompletion(d);
      if (total > 0 && done === total) perfectTotal++;
    }
    const rate7 = overallRate(7);
    const checkinCount = Object.keys(state.checkins).length;

    let html = `
      <div class="section-title">Oversikt</div>
      <div class="tiles">
        <div class="tile"><div class="tile-num">🔥 ${perfectStreak}</div><div class="tile-label">perfekte dager på rad</div></div>
        <div class="tile"><div class="tile-num">${rate7 == null ? '–' : rate7 + '<small>%</small>'}</div><div class="tile-label">fullført siste 7 dager</div></div>
        <div class="tile"><div class="tile-num">🏅 ${perfectTotal}</div><div class="tile-label">perfekte dager totalt</div></div>
        <div class="tile"><div class="tile-num">📝 ${checkinCount}</div><div class="tile-label">innsjekk logget</div></div>
      </div>`;

    html += renderMoodChart();
    html += renderInsights();

    if (habits.length) {
      html += `<div class="section-title">Per vane — siste ${HEATMAP_WEEKS} uker</div>`;
      html += habits.map(statHabitCard).join('');
    }
    return html;
  }

  function overallRate(days) {
    let done = 0, total = 0;
    for (let d = addDays(todayISO(), -(days - 1)); d <= todayISO(); d = addDays(d, 1)) {
      const c = dayCompletion(d);
      done += c.done; total += c.total;
    }
    return total ? Math.round((100 * done) / total) : null;
  }

  function statHabitCard(h) {
    const rate = completionRate(h, 30);
    const meta = [];
    if (h.kind === 'unngaa') {
      meta.push(`🔥 <b>${daysWithout(h, todayISO())}</b> ${daysWithout(h, todayISO()) === 1 ? 'dag' : 'dager'} uten`);
      meta.push(`beste: <b>${bestStreak(h)}</b>`);
    } else if (h.kind === 'poeng') {
      const total = cumulativeTotal(h, todayISO());
      const pct = h.target > 0 ? Math.round(100 * Math.max(0, Math.min(1, total / h.target))) : 0;
      meta.push(`total: <b>${fmtNum(total)}</b> / ${fmtNum(h.target)}`);
      meta.push(`<b>${pct}%</b> av målet`);
      if (poengReached(h, todayISO())) meta.push('🎯 <b>nådd</b>');
    } else if (h.direction === 'logg') {
      // handled by sparkline below
    } else if (isWeekly(h)) {
      meta.push(`denne uka: <b>${weekSuccessCount(h, todayISO())}/${h.weeklyTarget}</b>`);
      meta.push(`ukesrekke: <b>${currentStreak(h)}</b>`);
      meta.push(`beste: <b>${bestStreak(h)}</b> uker`);
    } else {
      meta.push(`rekke: <b>${currentStreak(h)}</b>`);
      meta.push(`beste: <b>${bestStreak(h)}</b>`);
    }

    let body;
    if (h.kind === 'poeng') {
      body = poengStatBody(h);
    } else if (h.direction === 'logg') {
      body = sparkline(h);
    } else {
      body = heatmap(h) + `
        <div class="hm-legend">
          <span class="l-ok"><i></i>fullført</span>
          <span class="l-part"><i></i>delvis</span>
          <span class="l-miss"><i></i>bom</span>
          <span class="l-off"><i></i>ikke planlagt</span>
        </div>`;
    }

    return `
      <div class="card stat-habit">
        <div class="stat-head">
          <span class="emoji">${h.emoji}</span>
          <span class="name">${esc(h.name)}</span>
          ${rate != null && h.direction !== 'logg' && !isWeekly(h) ? `<span class="rate">${rate}&nbsp;% siste 30 d</span>` : ''}
        </div>
        ${body}
        ${meta.length ? `<div class="stat-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
      </div>`;
  }

  function heatmap(h) {
    const today = todayISO();
    const start = weekStartISO(addDays(today, -7 * (HEATMAP_WEEKS - 1)));
    let cells = '';
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      for (let dow = 0; dow < 7; dow++) {
        const d = addDays(start, w * 7 + dow);
        if (d > today) { cells += '<i class="blank"></i>'; continue; }
        if (!existsOn(h, d)) { cells += `<i class="off" title="${esc(fmtShort(d))}: før oppstart"></i>`; continue; }
        const s = statusFor(h, d);
        let cls = 'off';
        if (s === 'success') cls = 'ok';
        else if (s === 'fail') cls = 'miss';
        else if (s === 'open') {
          const log = getLog(h.id, d);
          cls = log && Number(log.value) > 0 ? 'part' : 'off';
          if (isWeekly(h)) cls = log && Number(log.value) > 0 ? 'part' : 'off';
        }
        const label = `${fmtShort(d)}: ${{ ok: 'fullført', miss: 'bom', part: 'delvis', off: 'ikke planlagt' }[cls]}`;
        cells += `<i class="${cls}" title="${esc(label)}"></i>`;
      }
    }
    return `<div class="heatmap" role="img" aria-label="Kalender over fullførte dager, siste ${HEATMAP_WEEKS} uker">${cells}</div>`;
  }

  function sparkline(h) {
    const today = todayISO();
    const points = [];
    for (let d = addDays(today, -59); d <= today; d = addDays(d, 1)) {
      const log = getLog(h.id, d);
      if (log && log.value != null && log.value !== '') points.push({ d, v: Number(log.value) });
    }
    if (points.length < 2) {
      return `<div class="empty-note" style="padding:12px">Logg minst to målinger for å se trenden.</div>`;
    }
    const W = 320, H = 64, PAD = 6;
    const vs = points.map((p) => p.v);
    const min = Math.min(...vs), max = Math.max(...vs);
    const span = max - min || 1;
    const x = (i) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
    const y = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return `
      <div class="spark">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend siste 60 dager: fra ${fmtNum(points[0].v)} til ${fmtNum(last.v)} ${esc(h.unit || '')}">
          <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--line)" stroke-width="1"/>
          <path d="${path}" fill="none" stroke="var(--chart-blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3.5" fill="var(--chart-blue)"/>
        </svg>
        <div class="spark-now">Siste: <b>${fmtNum(last.v)} ${esc(h.unit || '')}</b>
          <span style="color:var(--muted)">· min ${fmtNum(min)} · maks ${fmtNum(max)} (60 d)</span></div>
      </div>`;
  }

  function poengStatBody(h) {
    const today = todayISO();
    const total = cumulativeTotal(h, today);
    const pct = h.target > 0 ? Math.max(0, Math.min(1, total / h.target)) : 0;
    const bar = `
      <div class="poeng-progress">
        <div class="pp-track"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
        <div class="pp-nums"><b>${fmtNum(total)}</b> / ${fmtNum(h.target)}${h.unit ? ' ' + esc(h.unit) : ''} · ${Math.round(pct * 100)}%</div>
      </div>`;

    const pts = [];
    let run = 0;
    for (let d = h.createdAt; d <= today; d = addDays(d, 1)) {
      run += Number((getLog(h.id, d) || {}).value) || 0;
      pts.push(run);
    }
    if (pts.length < 2) return bar;

    const W = 320, H = 56, PAD = 6;
    const min = Math.min(0, ...pts), max = Math.max(h.target || 1, ...pts);
    const span = max - min || 1;
    const x = (i) => PAD + (i / (pts.length - 1)) * (W - 2 * PAD);
    const y = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
    const path = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const goalY = y(h.target).toFixed(1);
    return `${bar}
      <div class="spark">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Akkumulert poeng over tid mot mål ${fmtNum(h.target)}">
          <line x1="${PAD}" y1="${goalY}" x2="${W - PAD}" y2="${goalY}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3"/>
          <path d="${path}" fill="none" stroke="var(--chart-blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </div>`;
  }

  function renderMoodChart() {
    const today = todayISO();
    const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
    const entries = days.map((d) => ({ d, ...(state.checkins[d] || {}) }));
    const hasData = entries.filter((e) => e.mood || e.energy).length >= 2;
    if (!hasData) {
      return `
        <div class="card">
          <div class="stat-head"><span class="emoji">📝</span><span class="name">Humør &amp; energi</span></div>
          <div class="empty-note" style="padding:10px">Sjekk inn noen dager, så tegnes kurven her. Korrelasjonsdata blir først interessant etter noen uker.</div>
        </div>`;
    }
    const W = 320, H = 90, PAD = 8;
    const x = (i) => PAD + (i / (days.length - 1)) * (W - 2 * PAD);
    const y = (v) => H - PAD - ((v - 1) / 4) * (H - 2 * PAD);
    const line = (key) => {
      let dStr = '', pen = false;
      entries.forEach((e, i) => {
        if (e[key]) { dStr += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(e[key]).toFixed(1)} `; pen = true; }
        else pen = false;
      });
      return dStr.trim();
    };
    const dots = (key, color) => entries.map((e, i) =>
      e[key] ? `<circle cx="${x(i).toFixed(1)}" cy="${y(e[key]).toFixed(1)}" r="2.4" fill="${color}"><title>${esc(fmtShort(e.d))}: ${e[key]}</title></circle>` : '').join('');
    const grid = [1, 3, 5].map((v) =>
      `<line x1="${PAD}" y1="${y(v)}" x2="${W - PAD}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>
       <text x="${W - PAD + 1}" y="${y(v) + 3}" font-size="8" fill="var(--muted)">${v}</text>`).join('');
    return `
      <div class="card">
        <div class="stat-head"><span class="emoji">📝</span><span class="name">Humør &amp; energi — siste 30 dager</span></div>
        <div class="legend-row">
          <span><i style="background:var(--chart-blue)"></i>Humør</span>
          <span><i style="background:var(--chart-yellow)"></i>Energi</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Humør og energi per dag, skala 1 til 5, siste 30 dager">
          ${grid}
          <path d="${line('mood')}" fill="none" stroke="var(--chart-blue)" stroke-width="2" stroke-linejoin="round"/>
          <path d="${line('energy')}" fill="none" stroke="var(--chart-yellow)" stroke-width="2" stroke-linejoin="round"/>
          ${dots('mood', 'var(--chart-blue)')}
          ${dots('energy', 'var(--chart-yellow)')}
        </svg>
      </div>`;
  }

  function renderInsights() {
    const rows = [];
    for (const h of activeHabits()) {
      if (h.direction === 'logg') continue;
      const withM = [], withoutM = [], withE = [], withoutE = [];
      for (let d = addDays(todayISO(), -CORRELATION_WINDOW_DAYS); d < todayISO(); d = addDays(d, 1)) {
        const ci = state.checkins[d];
        if (!ci) continue;
        const s = statusFor(h, d);
        if (s !== 'success' && s !== 'fail') continue;
        const bucketM = s === 'success' ? withM : withoutM;
        const bucketE = s === 'success' ? withE : withoutE;
        if (ci.mood) bucketM.push(ci.mood);
        if (ci.energy) bucketE.push(ci.energy);
      }
      const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      if (withM.length >= CORRELATION_MIN_GROUP && withoutM.length >= CORRELATION_MIN_GROUP) {
        rows.push({ h, metric: 'humør', delta: avg(withM) - avg(withoutM) });
      }
      if (withE.length >= CORRELATION_MIN_GROUP && withoutE.length >= CORRELATION_MIN_GROUP) {
        rows.push({ h, metric: 'energi', delta: avg(withE) - avg(withoutE) });
      }
    }
    if (!rows.length) return '';
    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const items = rows.slice(0, 8).map(({ h, metric, delta }) => `
      <div class="insight">
        <span class="emoji">${h.emoji}</span>
        <span class="who">${esc(h.name)} — ${metric} på dager med fullført</span>
        <span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${fmtNum(Math.abs(delta))}</span>
      </div>`).join('');
    return `
      <div class="card">
        <div class="stat-head"><span class="emoji">💡</span><span class="name">Innsikt — vaner vs. innsjekk</span></div>
        ${items}
        <p style="font-size:11.5px;color:var(--muted);margin:8px 0 0">Gjennomsnittlig forskjell (skala 1–5), siste ${CORRELATION_WINDOW_DAYS} dager. Korrelasjon er ikke årsak — men det er et spor. 🐾</p>
      </div>`;
  }

  // ------------------------------------------------ manage (Vaner)

  function renderManage() {
    const act = activeHabits();
    const arch = archivedHabits();
    let html = `<div class="section-title">Aktive vaner (${act.length}/7 anbefalt)</div>`;
    if (act.length > 7) {
      html += `<div class="over-limit">⚠️ Du har mer enn 7 aktive vaner. Færre vaner du klarer hver dag slår mange du bare klarer av og til — vurder å arkivere noen.</div>`;
    }
    if (!act.length) html += `<div class="card"><div class="empty-note">Ingen aktive vaner ennå.</div></div>`;
    html += act.map((h) => manageRow(h, false)).join('');
    html += `<button class="big-btn" data-action="picker-open">＋ Legg til vane</button>`;

    if (arch.length) {
      html += `<div class="section-title">Arkiverte (${arch.length})</div>`;
      html += arch.map((h) => manageRow(h, true)).join('');
    }

    html += `<div class="section-title">Skysynk</div>${renderSyncCard()}`;

    html += `
      <div class="section-title">Data</div>
      <div class="card">
        <p style="font-size:13px;color:var(--text-2);margin:0 0 8px">
          Alt lagres kun lokalt i denne nettleseren. Ta jevnlige sikkerhetskopier.
        </p>
        <button class="link-btn" data-action="export">⬇️ Eksporter alt (JSON)</button>
        <button class="link-btn" data-action="import">⬆️ Importer sikkerhetskopi</button>
        <button class="link-btn danger-link" data-action="reset-all">🗑️ Slett alle data</button>
      </div>`;
    return html;
  }

  function manageRow(h, archived) {
    const meta = KIND_META[h.kind];
    return `
      <div class="card manage-row" data-habit="${h.id}">
        <span class="emoji">${h.emoji}</span>
        <div class="m-main">
          <div class="m-name">${esc(h.name)}<span class="badge">${meta.icon} ${meta.label}</span></div>
          <div class="m-sub">${targetText(h)}${h.kind !== 'sjekk' ? ' · ' + scheduleText(h) : ''}</div>
        </div>
        <div class="m-actions">
          ${archived
            ? `<button data-action="restore" title="Gjenopprett" aria-label="Gjenopprett">↩️</button>`
            : `<button data-action="edit-open" title="Rediger" aria-label="Rediger">✏️</button>
               <button data-action="archive" title="Arkiver" aria-label="Arkiver">📦</button>`}
        </div>
      </div>`;
  }

  function renderSyncCard() {
    const st = SporSync.getStatus();
    const err = ui.syncError ? `<p style="font-size:12.5px;color:var(--danger);margin:8px 0 0">${esc(ui.syncError)}</p>` : '';

    if (!st.configured) {
      return `
        <div class="card">
          <p style="font-size:13px;color:var(--text-2);margin:0">
            ☁️ Ikke konfigurert — appen virker helt lokalt.
            Vil du synke mellom enheter, følg <strong>docs/supabase-setup.md</strong>
            og fyll inn <code>js/config.js</code>.
          </p>
        </div>`;
    }

    if (st.state !== 'in') {
      return `
        <div class="card">
          <p style="font-size:13px;color:var(--text-2);margin:0 0 8px">
            Logg inn med e-post for å synke mellom enheter — intet passord.
          </p>
          <div class="form-grid">
            <input type="email" id="sync-email" placeholder="din@epost.no" value="${esc(ui.syncEmail)}"
                   style="width:100%;border:1px solid var(--line);background:var(--surface-2);color:var(--text);border-radius:10px;padding:9px 10px;font-size:15px">
            ${ui.syncSent ? `
              <p style="font-size:13px;color:var(--text-2);margin:0">
                📬 Sjekk e-posten din og <strong>klikk innloggingslenken</strong>.
                Fikk du en 6-sifret kode i stedet, skriv den inn her:
              </p>
              <input type="text" id="sync-code" inputmode="numeric" placeholder="6-sifret kode (valgfritt)"
                     style="width:100%;border:1px solid var(--line);background:var(--surface-2);color:var(--text);border-radius:10px;padding:9px 10px;font-size:15px">
              <button class="big-btn" style="margin:0" data-action="sync-verify" ${ui.syncBusy ? 'disabled' : ''}>Logg inn med kode</button>
              <button class="link-btn" data-action="sync-send" ${ui.syncBusy ? 'disabled' : ''}>Send ny e-post</button>
            ` : `
              <button class="big-btn" style="margin:0" data-action="sync-send" ${ui.syncBusy ? 'disabled' : ''}>Send innloggingslenke</button>
            `}
          </div>
          ${err}
        </div>`;
    }

    const lastSync = st.lastSync
      ? new Date(st.lastSync).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
      : '–';
    return `
      <div class="card">
        <p style="font-size:13.5px;margin:0 0 4px">☁️ Innlogget som <strong>${esc(st.email || '')}</strong></p>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 8px">
          ${st.syncing ? 'Synkroniserer …' : `Sist synket: ${lastSync}`}
          ${st.pending ? ` · ${st.pending} endring${st.pending === 1 ? '' : 'er'} i kø` : ''}
          ${st.detail ? ` · ⚠️ ${esc(st.detail)}` : ''}
        </p>
        <button class="link-btn" data-action="sync-now" ${st.syncing ? 'disabled' : ''}>🔄 Synk nå</button>
        <button class="link-btn danger-link" data-action="sync-logout">Logg ut</button>
      </div>`;
  }

  // ------------------------------------------------ picker & form modals

  function openModal(html) {
    const root = $('#modal-root');
    $('.modal', root).innerHTML = html;
    root.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modal-root').hidden = true;
    document.body.style.overflow = '';
  }

  function openPicker() {
    const activeIds = new Set(activeHabits().map((h) => h.id));
    const cats = HABIT_LIBRARY.map((cat, i) => {
      const items = cat.items.map((tpl) => {
        const added = activeIds.has(tpl.id);
        return `
          <div class="lib-item">
            <span class="emoji">${tpl.emoji}</span>
            <div class="li-main">
              <div class="li-name">${esc(tpl.name)}</div>
              <div class="li-sub">${KIND_META[tpl.kind].icon} ${KIND_META[tpl.kind].label} · ${esc(templatePlanText(tpl))}</div>
            </div>
            <button class="add-mini" data-action="lib-add" data-lib="${tpl.id}" ${added ? 'disabled' : ''}>
              ${added ? '✓ Lagt til' : '＋ Legg til'}
            </button>
          </div>`;
      }).join('');
      return `
        <details class="lib-cat" ${i === 0 ? 'open' : ''}>
          <summary>${esc(cat.category)} <span class="count">${cat.items.length}</span></summary>
          ${items}
        </details>`;
    }).join('');

    openModal(`
      <h2>Legg til vane <button class="icon-btn" data-action="modal-close" aria-label="Lukk">✕</button></h2>
      <div class="guidance">${esc(PICKER_GUIDANCE)}</div>
      <button class="ghost-btn" data-action="starter-add">🐾 Anbefalt startsett — 7 vaner, én per livsområde</button>
      <button class="ghost-btn" data-action="custom-open">✨ Lag din egen vane</button>
      ${cats}
    `);
  }

  function templatePlanText(tpl) {
    const h = createHabit(tpl);
    const t = targetText(h);
    const sched = scheduleText(h);
    return h.kind === 'sjekk' ? t : `${t} · ${sched}`;
  }

  function openHabitForm(existing) {
    const h = existing || createHabit({ name: '', kind: 'sjekk' });
    const isEdit = !!existing;
    const schedMode = isWeekly(h) ? 'weekly' : h.weekdays.length === 7 ? 'daily' : 'days';
    const monFirst = [1, 2, 3, 4, 5, 6, 0];
    const dayBtns = monFirst.map((d, i) => `
      <button type="button" data-day="${d}" class="${h.weekdays.includes(d) ? 'on' : ''}">${DAY_SHORT[i]}</button>`).join('');
    const kindOpts = Object.entries(KIND_META).map(([k, m]) =>
      `<option value="${k}" ${h.kind === k ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('');

    openModal(`
      <h2>${isEdit ? 'Rediger vane' : 'Ny vane'} <button class="icon-btn" data-action="modal-close" aria-label="Lukk">✕</button></h2>
      <form id="habit-form" class="form-grid" data-editing="${isEdit ? h.id : ''}">
        <div class="form-row-emoji">
          <div><label for="hf-emoji">Emoji</label><input id="hf-emoji" name="emoji" type="text" value="${esc(h.emoji)}" maxlength="8"></div>
          <div><label for="hf-name">Navn</label><input id="hf-name" name="name" type="text" value="${esc(h.name)}" required placeholder="F.eks. Kveldstur"></div>
        </div>
        <div>
          <label for="hf-kind">Måletype</label>
          <select id="hf-kind" name="kind" ${isEdit ? 'disabled' : ''}>${kindOpts}</select>
        </div>
        <div class="form-row-2" id="hf-target-row">
          <div id="hf-target-wrap"><label for="hf-target">Mål</label>
            <input id="hf-target" name="target" type="number" step="any" min="0" value="${h.target ?? ''}"></div>
          <div id="hf-unit-wrap"><label for="hf-unit">Enhet</label>
            <input id="hf-unit" name="unit" type="text" value="${esc(h.unit || '')}" placeholder="km, gram, sider…"></div>
        </div>
        <div class="form-row-2" id="hf-time-row">
          <div><label for="hf-time">Klokkeslett</label>
            <input id="hf-time" name="targetTime" type="time" value="${esc(h.targetTime || '22:00')}"></div>
          <div><label>Side</label>
            <div class="seg" data-seg="timeSide">
              <button type="button" data-val="before" class="${h.timeSide !== 'after' ? 'on' : ''}">før</button>
              <button type="button" data-val="after" class="${h.timeSide === 'after' ? 'on' : ''}">etter</button>
            </div></div>
        </div>
        <div id="hf-direction-row">
          <label>Retning</label>
          <div class="seg" data-seg="direction">
            <button type="button" data-val="opp" class="${h.direction === 'opp' ? 'on' : ''}">⬆ opp (minst)</button>
            <button type="button" data-val="ned" class="${h.direction === 'ned' ? 'on' : ''}">⬇ ned (maks)</button>
            <button type="button" data-val="logg" class="${h.direction === 'logg' ? 'on' : ''}">📓 kun logg</button>
          </div>
        </div>
        <div id="hf-negative-row">
          <label class="check-label">
            <input id="hf-negative" name="allowNegative" type="checkbox" ${h.allowNegative ? 'checked' : ''}>
            <span>Tillat negative tall — telleren kan gå under 0 (netto-score, f.eks. +1 for «nei», −1 for «ja»)</span>
          </label>
        </div>
        <div id="hf-plan-row">
          <label>Plan</label>
          <div class="seg" data-seg="schedMode">
            <button type="button" data-val="daily" class="${schedMode === 'daily' ? 'on' : ''}">daglig</button>
            <button type="button" data-val="days" class="${schedMode === 'days' ? 'on' : ''}">faste dager</button>
            <button type="button" data-val="weekly" class="${schedMode === 'weekly' ? 'on' : ''}">ukemål</button>
          </div>
        </div>
        <div id="hf-days-row"><label>Dager</label><div class="weekday-picker" id="hf-days">${dayBtns}</div></div>
        <div id="hf-weekly-row"><label for="hf-weekly">Ganger per uke</label>
          <input id="hf-weekly" name="weeklyTarget" type="number" min="1" max="7" value="${h.weeklyTarget ?? 3}"></div>
        <button class="big-btn" type="submit" style="margin-top:4px">${isEdit ? 'Lagre endringer' : 'Legg til vane'}</button>
      </form>
    `);
    updateFormVisibility();
  }

  function updateFormVisibility() {
    const form = $('#habit-form');
    if (!form) return;
    const kind = form.elements.namedItem('kind').value;
    const schedMode = $('[data-seg="schedMode"] .on', form)?.dataset.val || 'daily';
    const show = (id, on) => { const el = $(id, form); if (el) el.style.display = on ? '' : 'none'; };
    const isPoeng = kind === 'poeng';
    show('#hf-target-row', kind === 'teller' || kind === 'minutter' || kind === 'mengde' || isPoeng);
    show('#hf-unit-wrap', kind === 'mengde' || kind === 'teller' || isPoeng);
    show('#hf-time-row', kind === 'tidspunkt');
    show('#hf-direction-row', kind === 'mengde' || kind === 'teller');
    show('#hf-negative-row', kind === 'teller' || isPoeng);
    // Prefill a sensible default target the first time Poengmål is picked.
    const tgt = $('#hf-target', form);
    if (isPoeng && tgt && tgt.value === '') tgt.value = POENG_DEFAULT_TARGET;
    // Poengmål is a lifetime cumulative goal — no daily/weekly schedule.
    show('#hf-plan-row', !isPoeng);
    show('#hf-days-row', schedMode === 'days' && !isPoeng);
    show('#hf-weekly-row', schedMode === 'weekly' && !isPoeng);
  }

  function submitHabitForm(form) {
    // form.name / form.target collide with HTMLFormElement's own properties,
    // so read controls via form.elements.
    const field = (n) => form.elements.namedItem(n);
    const editingId = form.dataset.editing;
    const kind = field('kind').value;
    const schedMode = $('[data-seg="schedMode"] .on', form)?.dataset.val || 'daily';
    const direction = kind === 'mengde' || kind === 'teller'
      ? ($('[data-seg="direction"] .on', form)?.dataset.val || 'opp') : 'opp';
    const timeSide = $('[data-seg="timeSide"] .on', form)?.dataset.val || 'before';
    const days = [...form.querySelectorAll('#hf-days button.on')].map((b) => Number(b.dataset.day));

    const data = {
      name: field('name').value.trim(),
      emoji: field('emoji').value.trim() || '⭐',
      kind,
      target: field('target').value !== '' ? Number(field('target').value) : null,
      unit: field('unit').value.trim() || null,
      direction,
      allowNegative: (kind === 'teller' || kind === 'poeng') && !!field('allowNegative')?.checked,
      targetTime: kind === 'tidspunkt' ? field('targetTime').value || '22:00' : null,
      timeSide,
      weeklyTarget: schedMode === 'weekly' ? Math.max(1, Math.min(7, Number(field('weeklyTarget').value) || 1)) : null,
      weekdays: schedMode === 'days' && days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    };
    if (!data.name) return;
    if ((kind === 'teller' || kind === 'minutter' || kind === 'mengde') && direction !== 'logg' && (data.target == null || Number.isNaN(data.target))) {
      data.target = 1;
    }
    if (kind === 'poeng' && (data.target == null || Number.isNaN(data.target) || data.target <= 0)) {
      data.target = POENG_DEFAULT_TARGET;
    }

    if (editingId) {
      const h = habitById(editingId);
      Object.assign(h, {
        name: data.name, emoji: data.emoji, target: data.target, unit: data.unit,
        direction: data.direction, allowNegative: data.allowNegative,
        targetTime: data.targetTime, timeSide: data.timeSide,
        weeklyTarget: data.weeklyTarget, weekdays: data.weekdays,
      });
      touchHabit(h);
    } else {
      const h = createHabit(data);
      state.habits.push(h);
      touchHabit(h);
    }
    closeModal();
    render();
  }

  // ------------------------------------------------ library / starter actions

  function addFromLibrary(libId) {
    const tpl = HABIT_LIBRARY.flatMap((c) => c.items.map((i) => ({ ...i, category: c.category })))
      .find((i) => i.id === libId);
    if (!tpl) return;
    const existing = habitById(libId);
    if (existing) {
      if (existing.archivedAt) { existing.archivedAt = null; touchHabit(existing); } // restore, history intact
    } else {
      const h = createHabit(tpl);
      state.habits.push(h);
      touchHabit(h);
    }
  }

  function addStarterSet() {
    STARTER_SET.forEach(addFromLibrary);
    state.onboarded = true;
    save();
    closeModal();
    ui.tab = 'today';
    render();
  }

  // ------------------------------------------------ confetti

  function fireConfetti() {
    const colors = ['#4ccf8a', '#eda100', '#5598e7', '#e66767', '#d55181', '#f2f7f0'];
    const root = $('#confetti-root');
    for (let i = 0; i < 48; i++) {
      const c = document.createElement('span');
      c.className = 'confetto';
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.5}s`;
      c.style.animationDuration = `${2 + Math.random() * 1.2}s`;
      root.appendChild(c);
      setTimeout(() => c.remove(), 3800);
    }
  }

  function maybeCelebrate(iso) {
    if (iso !== todayISO()) return;
    const { done, total } = dayCompletion(iso);
    if (total > 0 && done === total && lastPerfectShown !== iso) {
      lastPerfectShown = iso;
      fireConfetti();
    }
  }

  // ------------------------------------------------ data management

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'spor', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spor-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.habits) || typeof data.logs !== 'object') {
          alert('Fila ser ikke ut som en Spor-sikkerhetskopi.');
          return;
        }
        if (!confirm('Importere sikkerhetskopi? Dette erstatter alle data i denne nettleseren.')) return;
        state = { ...defaultState(), habits: data.habits, logs: data.logs || {}, checkins: data.checkins || {}, settings: data.settings || defaultState().settings, onboarded: true };
        save();
        SporSync.enqueueFullPush(); // if signed in, imported data replaces the cloud copy too
        SporSync.syncNow();
        render();
      } catch {
        alert('Kunne ikke lese fila.');
      }
    };
    reader.readAsText(file);
  }

  // ------------------------------------------------ events (delegated)

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const habitEl = btn.closest('[data-habit]');
    const habit = habitEl ? habitById(habitEl.dataset.habit) : null;
    const iso = ui.date;

    const rerender = () => { maybeCelebrate(iso); render(); };

    switch (action) {
      case 'tab': ui.tab = btn.dataset.tab; render(); break;
      case 'toggle-theme': {
        const cur = document.documentElement.getAttribute('data-theme');
        state.settings.theme = cur === 'dark' ? 'light' : 'dark';
        save(); render(); break;
      }
      case 'nav-prev': ui.date = addDays(ui.date, -1); render(); break;
      case 'nav-next': if (ui.date < todayISO()) { ui.date = addDays(ui.date, 1); render(); } break;
      case 'nav-today': ui.date = todayISO(); render(); break;

      case 'checkin-mood': case 'checkin-energy': {
        const key = action === 'checkin-mood' ? 'mood' : 'energy';
        const val = Number(btn.dataset.val);
        const ci = { ...(state.checkins[iso] || {}) };
        delete ci.updatedAt;
        if (ci[key] === val) delete ci[key]; else ci[key] = val;
        setCheckin(iso, Object.keys(ci).length ? ci : null);
        render(); break;
      }

      case 'toggle-check': {
        const log = getLog(habit.id, iso);
        setLog(habit.id, iso, log && log.value >= 1 ? null : { value: 1 });
        rerender(); break;
      }
      case 'counter-inc': case 'counter-dec': {
        const delta = action === 'counter-inc' ? 1 : -1;
        const log = getLog(habit.id, iso);
        const cur = log ? Number(log.value) || 0 : 0;
        if (habit.kind === 'poeng') {
          // Clamp on the cumulative lifetime total, not the single day.
          if (!habit.allowNegative && cumulativeTotal(habit, iso) + delta < 0) break;
          const reachedBefore = poengReached(habit, iso);
          const nextDay = cur + delta;
          setLog(habit.id, iso, nextDay === 0 ? null : { value: nextDay });
          if (iso === todayISO() && !reachedBefore && poengReached(habit, iso)) fireConfetti();
        } else {
          const floor = habit.allowNegative ? -Infinity : 0;
          const next = Math.max(floor, cur + delta);
          setLog(habit.id, iso, next === 0 ? null : { value: next });
        }
        rerender(); break;
      }
      case 'minutes-add': {
        const log = getLog(habit.id, iso);
        const cur = log ? Number(log.value) || 0 : 0;
        setLog(habit.id, iso, { value: cur + Number(btn.dataset.min) });
        rerender(); break;
      }
      case 'minutes-custom': {
        const input = prompt('Antall minutter å legge til:');
        const mins = Number((input || '').replace(',', '.'));
        if (mins > 0) {
          const log = getLog(habit.id, iso);
          const cur = log ? Number(log.value) || 0 : 0;
          setLog(habit.id, iso, { value: cur + mins });
          rerender();
        }
        break;
      }
      case 'minutes-reset': setLog(habit.id, iso, null); render(); break;
      case 'time-now': {
        const now = new Date();
        setLog(habit.id, iso, { at: `${pad2(now.getHours())}:${pad2(now.getMinutes())}` });
        rerender(); break;
      }
      case 'slip': setLog(habit.id, iso, { value: 1 }); render(); break;
      case 'slip-undo': setLog(habit.id, iso, null); rerender(); break;

      case 'picker-open': openPicker(); break;
      case 'custom-open': openHabitForm(null); break;
      case 'modal-close': closeModal(); break;
      case 'lib-add': {
        addFromLibrary(btn.dataset.lib);
        btn.disabled = true;
        btn.textContent = '✓ Lagt til';
        break;
      }
      case 'starter-add': addStarterSet(); break;
      case 'edit-open': openHabitForm(habit); break;
      case 'archive': {
        habit.archivedAt = todayISO();
        touchHabit(habit); render(); break;
      }
      case 'restore': habit.archivedAt = null; touchHabit(habit); render(); break;

      case 'sync-send': {
        const email = $('#sync-email')?.value.trim();
        if (!email) break;
        ui.syncEmail = email; ui.syncError = ''; ui.syncBusy = true; render();
        SporSync.sendCode(email)
          .then(() => { ui.syncSent = true; })
          .catch((err) => { ui.syncError = err.message || 'Kunne ikke sende kode.'; })
          .finally(() => { ui.syncBusy = false; render(); });
        break;
      }
      case 'sync-verify': {
        const code = $('#sync-code')?.value.trim();
        if (!code) break;
        ui.syncError = ''; ui.syncBusy = true; render();
        SporSync.verifyCode(ui.syncEmail, code)
          .then(() => { ui.syncSent = false; })
          .catch((err) => { ui.syncError = err.message || 'Feil kode.'; })
          .finally(() => { ui.syncBusy = false; render(); });
        break;
      }
      case 'sync-now': SporSync.syncNow(); break;
      case 'sync-logout': SporSync.signOut().then(render); break;

      case 'export': exportData(); break;
      case 'import': $('#import-file').click(); break;
      case 'reset-all': {
        if (confirm('Slette ALLE vaner, logger og innsjekk i denne nettleseren? (En eventuell sky-kopi røres ikke.) Dette kan ikke angres.')
          && confirm('Helt sikker? Eksporter gjerne først.')) {
          state = defaultState();
          save(); render();
        }
        break;
      }
    }
  });

  // Form-internal clicks: segmented controls, weekday toggles.
  document.addEventListener('click', (e) => {
    const segBtn = e.target.closest('.seg button');
    if (segBtn) {
      segBtn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === segBtn));
      updateFormVisibility();
      return;
    }
    const dayBtn = e.target.closest('#hf-days button');
    if (dayBtn) dayBtn.classList.toggle('on');
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'hf-kind') { updateFormVisibility(); return; }
    if (el.id === 'import-file') {
      if (el.files[0]) importData(el.files[0]);
      el.value = '';
      return;
    }
    const kind = el.dataset.change;
    if (!kind) return;
    const iso = ui.date;
    if (kind === 'checkin-note') {
      const ci = { ...(state.checkins[iso] || {}) };
      delete ci.updatedAt;
      if (el.value.trim()) ci.note = el.value.trim(); else delete ci.note;
      setCheckin(iso, Object.keys(ci).length ? ci : null);
      return; // don't re-render mid-typing flow
    }
    const habitEl = el.closest('[data-habit]');
    if (!habitEl) return;
    const habit = habitById(habitEl.dataset.habit);
    if (kind === 'amount') {
      const v = el.value === '' ? null : Number(el.value.replace(',', '.'));
      setLog(habit.id, iso, v == null || Number.isNaN(v) ? null : { value: v });
      maybeCelebrate(iso); render();
    } else if (kind === 'time') {
      setLog(habit.id, iso, el.value ? { at: el.value } : null);
      maybeCelebrate(iso); render();
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'habit-form') {
      e.preventDefault();
      submitHabitForm(e.target);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal-root').hidden) closeModal();
  });

  // ------------------------------------------------ boot

  render();

  SporSync.init({
    getState: () => state,
    saveState: save,
    onChange: () => {
      // Skip background re-renders while the user is typing in a field.
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
      render();
    },
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is best-effort */ });
  }
})();
