/* Spor — Supabase sync adapter.
 *
 * Local-first: localStorage stays the source of truth and the app is fully
 * usable offline or signed out. When configured (js/config.js) and signed in
 * (passwordless email code), every mutation is queued in an outbox and pushed;
 * on startup/reconnect we pull and merge with last-write-wins per row
 * (updated_at). Known limit: deletes have no tombstones, so a delete made on
 * one device while another device is offline can be resurrected by that
 * device's later push. For a personal tracker this trade-off keeps V1 simple.
 *
 * app.js talks to this module only through SporSync.init({...}) and the
 * notify/queue hooks; if sync is unconfigured every hook is a cheap no-op. */

const SporSync = (() => {
  'use strict';

  let client = null;
  let session = null;
  let host = null; // { getState, saveState, onChange } provided by app.js
  let pushTimer = null;
  let status = { state: 'off', detail: '', lastSync: null, syncing: false };

  const configured = () =>
    typeof SPOR_CONFIG !== 'undefined' && !!SPOR_CONFIG.supabaseUrl && !!SPOR_CONFIG.supabaseKey;

  const getStatus = () => ({
    ...status,
    email: session?.user?.email || null,
    pending: host ? (host.getState().outbox || []).length : 0,
    configured: configured(),
  });

  function setStatus(state, detail) {
    status.state = state;
    if (detail !== undefined) status.detail = detail;
    host?.onChange();
  }

  async function init(appHost) {
    host = appHost;
    if (!configured() || typeof supabase === 'undefined') {
      status.state = 'off';
      return;
    }
    client = supabase.createClient(SPOR_CONFIG.supabaseUrl, SPOR_CONFIG.supabaseKey);
    const { data } = await client.auth.getSession();
    session = data.session;
    client.auth.onAuthStateChange((_evt, s) => {
      const wasOut = !session;
      session = s;
      if (s && wasOut) afterLogin();
      host.onChange();
    });
    window.addEventListener('online', () => { if (session) syncNow(); });
    if (session) {
      setStatus('in');
      syncNow();
    } else {
      setStatus('out');
    }
  }

  // ------------------------------------------------ auth (email code)

  async function sendCode(email) {
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }

  async function verifyCode(email, token) {
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }

  async function signOut() {
    await client.auth.signOut();
    session = null;
    setStatus('out');
  }

  async function afterLogin() {
    const state = host.getState();
    if (!state.syncInitialized) {
      enqueueFullPush(); // first login from this browser: offer everything local
      state.syncInitialized = true;
      host.saveState();
    }
    setStatus('in');
    await syncNow();
  }

  // ------------------------------------------------ outbox

  /* op: { t: 'habit'|'log'|'checkin', op: 'up'|'del', key, ts }
   * Payloads are read from current state at flush time, so the newest version
   * always wins and repeated edits collapse into one op. */
  function queue(t, op, key) {
    if (!configured()) return;
    const state = host.getState();
    state.outbox = (state.outbox || []).filter((o) => !(o.t === t && o.key === key));
    state.outbox.push({ t, op, key, ts: Date.now() });
    host.saveState();
    schedulePush();
  }

  function enqueueFullPush() {
    const state = host.getState();
    state.habits.forEach((h) => queueSilent(state, 'habit', 'up', h.id));
    Object.keys(state.logs).forEach((k) => queueSilent(state, 'log', 'up', k));
    Object.keys(state.checkins).forEach((d) => queueSilent(state, 'checkin', 'up', d));
  }

  function queueSilent(state, t, op, key) {
    state.outbox = (state.outbox || []).filter((o) => !(o.t === t && o.key === key));
    state.outbox.push({ t, op, key, ts: Date.now() });
  }

  function schedulePush() {
    if (!session) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(), 2500);
  }

  // ------------------------------------------------ row mapping

  const habitToRow = (h) => ({
    id: h.id, name: h.name, emoji: h.emoji, category: h.category, kind: h.kind,
    target: h.target, unit: h.unit, direction: h.direction,
    target_time: h.targetTime, time_side: h.timeSide,
    weekly_target: h.weeklyTarget, weekdays: h.weekdays,
    created_on: h.createdAt, archived_on: h.archivedAt,
    updated_at: new Date(h.updatedAt || Date.now()).toISOString(),
  });
  const rowToHabit = (r) => ({
    id: r.id, name: r.name, emoji: r.emoji || '⭐', category: r.category || 'Egne vaner',
    kind: r.kind, target: r.target != null ? Number(r.target) : null, unit: r.unit,
    direction: r.direction, targetTime: r.target_time ? r.target_time.slice(0, 5) : null,
    timeSide: r.time_side, weeklyTarget: r.weekly_target,
    weekdays: r.weekdays || [0, 1, 2, 3, 4, 5, 6],
    createdAt: r.created_on, archivedAt: r.archived_on,
    updatedAt: new Date(r.updated_at).getTime(),
  });

  const logToRow = (key, entry) => {
    const [habitId, day] = splitLogKey(key);
    return {
      habit_id: habitId, day,
      value: entry.value ?? null, at: entry.at ?? null,
      updated_at: new Date(entry.updatedAt || Date.now()).toISOString(),
    };
  };
  const splitLogKey = (key) => {
    const i = key.lastIndexOf('|');
    return [key.slice(0, i), key.slice(i + 1)];
  };

  const checkinToRow = (day, ci) => ({
    day, mood: ci.mood ?? null, energy: ci.energy ?? null, note: ci.note ?? null,
    updated_at: new Date(ci.updatedAt || Date.now()).toISOString(),
  });

  // ------------------------------------------------ sync

  async function syncNow() {
    if (!client || !session || status.syncing) return;
    status.syncing = true;
    setStatus('in', '');
    try {
      await flushOutbox();
      await pullAll();
      status.lastSync = Date.now();
      setStatus('in', '');
    } catch (e) {
      setStatus('in', e.message || 'Synk feilet');
    } finally {
      status.syncing = false;
      host.onChange();
    }
  }

  async function flushOutbox() {
    const state = host.getState();
    // Habits first so log upserts never hit a missing foreign key.
    const order = { habit: 0, checkin: 1, log: 2 };
    const ops = [...(state.outbox || [])].sort((a, b) => order[a.t] - order[b.t] || a.ts - b.ts);
    for (const op of ops) {
      await applyOp(state, op);
      state.outbox = state.outbox.filter((o) => o !== op);
      host.saveState();
    }
  }

  async function applyOp(state, { t, op, key }) {
    if (t === 'habit') {
      const h = state.habits.find((x) => x.id === key);
      if (op === 'del' || !h) {
        const { error } = await client.from('habits').delete().eq('id', key);
        if (error) throw error;
      } else {
        const { error } = await client.from('habits').upsert(habitToRow(h), { onConflict: 'user_id,id' });
        if (error) throw error;
      }
    } else if (t === 'log') {
      const entry = state.logs[key];
      const [habitId, day] = splitLogKey(key);
      if (op === 'del' || !entry) {
        const { error } = await client.from('logs').delete().eq('habit_id', habitId).eq('day', day);
        if (error) throw error;
      } else {
        if (!state.habits.some((x) => x.id === habitId)) return; // orphan log; skip
        const { error } = await client.from('logs').upsert(logToRow(key, entry), { onConflict: 'user_id,habit_id,day' });
        if (error) throw error;
      }
    } else if (t === 'checkin') {
      const ci = state.checkins[key];
      if (op === 'del' || !ci) {
        const { error } = await client.from('checkins').delete().eq('day', key);
        if (error) throw error;
      } else {
        const { error } = await client.from('checkins').upsert(checkinToRow(key, ci), { onConflict: 'user_id,day' });
        if (error) throw error;
      }
    }
  }

  async function pullAll() {
    const state = host.getState();
    const pending = new Set((state.outbox || []).map((o) => `${o.t}|${o.key}`));
    let changed = false;

    const [habits, logs, checkins] = await Promise.all([
      client.from('habits').select('*'),
      client.from('logs').select('*'),
      client.from('checkins').select('*'),
    ]);
    for (const res of [habits, logs, checkins]) if (res.error) throw res.error;

    for (const row of habits.data) {
      if (pending.has(`habit|${row.id}`)) continue; // local change not pushed yet wins
      const remote = rowToHabit(row);
      const local = state.habits.find((h) => h.id === remote.id);
      if (!local) { state.habits.push(remote); changed = true; }
      else if (remote.updatedAt > (local.updatedAt || 0)) { Object.assign(local, remote); changed = true; }
    }
    for (const row of logs.data) {
      const key = `${row.habit_id}|${row.day}`;
      if (pending.has(`log|${key}`)) continue;
      const remoteTs = new Date(row.updated_at).getTime();
      const local = state.logs[key];
      if (!local || remoteTs > (local.updatedAt || 0)) {
        const entry = { updatedAt: remoteTs };
        if (row.value != null) entry.value = Number(row.value);
        if (row.at != null) entry.at = row.at.slice(0, 5);
        state.logs[key] = entry;
        changed = true;
      }
    }
    for (const row of checkins.data) {
      if (pending.has(`checkin|${row.day}`)) continue;
      const remoteTs = new Date(row.updated_at).getTime();
      const local = state.checkins[row.day];
      if (!local || remoteTs > (local.updatedAt || 0)) {
        const ci = { updatedAt: remoteTs };
        if (row.mood != null) ci.mood = row.mood;
        if (row.energy != null) ci.energy = row.energy;
        if (row.note != null) ci.note = row.note;
        state.checkins[row.day] = ci;
        changed = true;
      }
    }
    if (changed) host.saveState();
  }

  return { init, queue, enqueueFullPush, syncNow, sendCode, verifyCode, signOut, getStatus };
})();
