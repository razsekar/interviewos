// Persistence layer: IndexedDB-backed progress, reviews, bookmarks, sessions and goals with an
// in-memory cache so views can render synchronously. All writes go through here.
import { openDb } from './db.js';
import { newCard, recordExposure, review } from './srs.js';
import { srsOpts, getPrefs, setPrefs } from './store.js';
import { buildBackup, mergeData, validateBackup } from './backup-core.js';
import { APP_VERSION } from './config.js';

let db;
const cards = new Map();
const bookmarks = new Map();
let reviews = [];
let sessions = [];
const goals = new Map();
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const isPersistent = () => db?.persistent !== false;

export async function init() {
  db = await openDb();
  await reloadCache();
  return { persistent: db.persistent };
}

async function reloadCache() {
  cards.clear();
  bookmarks.clear();
  goals.clear();
  (await db.getAll('progress')).forEach((c) => cards.set(c.id, c));
  (await db.getAll('bookmarks')).forEach((b) => bookmarks.set(b.id, b));
  (await db.getAll('goals')).forEach((g) => goals.set(g.key, g.value));
  reviews = (await db.getAll('reviews')).sort((a, b) => a.ts - b.ts);
  sessions = await db.getAll('sessions');
}

/* ----- progress ----- */
export const allCards = () => cards;
export const getCard = (id) => cards.get(id);
export const allReviews = () => reviews;

export async function markExposure(id, now = Date.now()) {
  const next = recordExposure(cards.get(id) || newCard(id, now), now);
  cards.set(id, next);
  await db.put('progress', next);
  emit();
  return next;
}

export async function rate(id, rating, { mode = 'study', style = '' } = {}, now = Date.now()) {
  const cur = cards.get(id) || recordExposure(newCard(id, now), now);
  const next = review(cur, rating, now, srsOpts());
  cards.set(id, next);
  const row = { qid: id, ts: now, rating, mode, style };
  reviews.push(row);
  await db.put('progress', next);
  await db.put('reviews', row);
  emit();
  return next;
}

/* ----- bookmarks ----- */
export const isBookmarked = (id) => bookmarks.has(id);
export const bookmarkIds = () => [...bookmarks.values()].sort((a, b) => a.ts - b.ts).map((b) => b.id);
export async function toggleBookmark(id) {
  if (bookmarks.has(id)) {
    bookmarks.delete(id);
    await db.delete('bookmarks', id);
  } else {
    const b = { id, ts: Date.now() };
    bookmarks.set(id, b);
    await db.put('bookmarks', b);
  }
  emit();
  return bookmarks.has(id);
}

/* ----- sessions ----- */
export const allSessions = () => sessions;
export const activeSession = () => sessions.filter((s) => !s.done).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
export async function saveSession(s) {
  s.updatedAt = Date.now();
  const i = sessions.findIndex((x) => x.sid === s.sid);
  if (i >= 0) sessions[i] = s;
  else sessions.push(s);
  await db.put('sessions', s);
  emit();
}
export async function deleteSession(sid) {
  sessions = sessions.filter((s) => s.sid !== sid);
  await db.delete('sessions', sid);
  emit();
}
export async function pruneSessions(keep = 20) {
  const old = sessions.filter((s) => s.done).sort((a, b) => b.updatedAt - a.updatedAt).slice(keep);
  for (const s of old) await deleteSession(s.sid);
}

/* ----- goals ----- */
export const getGoal = (key, fallback = null) => (goals.has(key) ? goals.get(key) : fallback);
export async function setGoal(key, value) {
  if (value == null) {
    goals.delete(key);
    await db.delete('goals', key);
  } else {
    goals.set(key, value);
    await db.put('goals', { key, value });
  }
  emit();
}

/* ----- backup / restore ----- */
export function snapshot() {
  return {
    progress: [...cards.values()],
    reviews: [...reviews],
    bookmarks: [...bookmarks.values()],
    sessions: [...sessions],
    goals: [...goals].map(([key, value]) => ({ key, value })),
    prefs: getPrefs(),
  };
}
export const exportBackup = () => JSON.stringify(buildBackup(snapshot(), Date.now(), APP_VERSION), null, 1);

export function inspectBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'], data: null };
  }
  return validateBackup(obj);
}

/** mode: 'merge' | 'replace'. `data` must come from validateBackup. All-or-nothing in one transaction. */
export async function applyBackup(data, mode) {
  const final = mode === 'replace' ? data : mergeData(snapshot(), data);
  await db.replaceMany({ progress: final.progress, reviews: final.reviews, bookmarks: final.bookmarks, sessions: final.sessions, goals: final.goals });
  if (mode === 'replace') setPrefs(final.prefs);
  else setPrefs({ ...final.prefs, ...getPrefs() });
  await reloadCache();
  emit();
  return { progress: final.progress.length, reviews: final.reviews.length, bookmarks: final.bookmarks.length };
}

export async function resetAll() {
  await db.replaceMany({ progress: [], reviews: [], bookmarks: [], sessions: [], goals: [] });
  await reloadCache();
  emit();
}
