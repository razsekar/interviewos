// Backup / restore core: build, validate (untrusted input!) and merge. No storage or DOM access.
export const BACKUP_FORMAT = 'interviewos-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isId = (x) => typeof x === 'string' && /^[a-z0-9-]{1,64}\/[a-z0-9-]{1,80}$/.test(x);

export function buildBackup(data, now = Date.now(), appVersion = '1.0.0') {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date(now).toISOString(),
    data: {
      progress: data.progress || [],
      reviews: data.reviews || [],
      bookmarks: data.bookmarks || [],
      sessions: data.sessions || [],
      goals: data.goals || [],
      prefs: data.prefs || {},
    },
  };
}

const PREF_KEYS = {
  theme: (v) => ['system', 'light', 'dark'].includes(v),
  style: (v) => ['detailed', 'quick', 'revision'].includes(v),
  rate: (v) => isNum(v) && v >= 0.5 && v <= 2.5,
  voice: (v) => typeof v === 'string' && v.length < 300,
  ladder: (v) => Array.isArray(v) && v.length >= 2 && v.length <= 12 && v.every((n) => isNum(n) && n > 0 && n <= 3650),
  masteryDays: (v) => isNum(v) && v >= 1 && v <= 365,
  dailyGoal: (v) => isNum(v) && v >= 1 && v <= 500,
  shortcuts: (v) => typeof v === 'boolean',
  simSeconds: (v) => isNum(v) && v >= 10 && v <= 1800,
  rapidSeconds: (v) => isNum(v) && v >= 5 && v <= 300,
};

/** Keep only known preference keys with valid values (never trust stored or imported prefs). */
export function sanitizePrefs(p) {
  const out = {};
  if (!isObj(p)) return out;
  for (const [k, v] of Object.entries(p)) if (Object.hasOwn(PREF_KEYS, k) && PREF_KEYS[k](v)) out[k] = v;
  return out;
}

/** Returns { ok, errors[], data } where data contains only sanitised, known fields. */
export function validateBackup(obj) {
  const errors = [];
  if (!isObj(obj)) return { ok: false, errors: ['File is not a JSON object.'], data: null };
  if (obj.format !== BACKUP_FORMAT) errors.push('Not an InterviewOS backup (wrong "format").');
  if (!isNum(obj.version)) errors.push('Missing backup version.');
  else if (obj.version > BACKUP_VERSION) errors.push(`Backup version ${obj.version} is newer than this app supports (${BACKUP_VERSION}).`);
  if (!isObj(obj.data)) errors.push('Missing "data" section.');
  if (errors.length) return { ok: false, errors, data: null };
  const d = obj.data;
  const out = { progress: [], reviews: [], bookmarks: [], sessions: [], goals: [], prefs: {} };
  const bad = (what, i) => errors.push(`${what} #${i + 1} is invalid`);

  if (!Array.isArray(d.progress)) errors.push('"progress" must be a list.');
  else
    d.progress.forEach((c, i) => {
      const ok =
        isObj(c) && isId(c.id) && isNum(c.exposures) && c.exposures >= 0 && isNum(c.reviews) && c.reviews >= 0 && isNum(c.lapses) &&
        isNum(c.stage) && c.stage >= -1 && c.stage < 12 && isNum(c.intervalDays) && isNum(c.firstSeen) && isNum(c.lastSeen) &&
        (c.due === null || isNum(c.due)) && (c.lastRating === null || [1, 2, 3, 4].includes(c.lastRating)) &&
        Array.isArray(c.recent) && c.recent.length <= 5 && c.recent.every((r) => [1, 2, 3, 4].includes(r));
      if (!ok) return bad('Progress record', i);
      out.progress.push({ id: c.id, firstSeen: c.firstSeen, lastSeen: c.lastSeen, exposures: c.exposures, reviews: c.reviews, lapses: c.lapses, stage: c.stage, intervalDays: c.intervalDays, due: c.due, lastRating: c.lastRating, recent: [...c.recent] });
    });

  if (!Array.isArray(d.reviews)) errors.push('"reviews" must be a list.');
  else
    d.reviews.forEach((r, i) => {
      if (!(isObj(r) && isId(r.qid) && isNum(r.ts) && [1, 2, 3, 4].includes(r.rating))) return bad('Review', i);
      out.reviews.push({ qid: r.qid, ts: r.ts, rating: r.rating, mode: typeof r.mode === 'string' ? r.mode.slice(0, 30) : 'unknown', style: typeof r.style === 'string' ? r.style.slice(0, 20) : '' });
    });

  if (!Array.isArray(d.bookmarks)) errors.push('"bookmarks" must be a list.');
  else
    d.bookmarks.forEach((b, i) => {
      if (!(isObj(b) && isId(b.id) && isNum(b.ts))) return bad('Bookmark', i);
      out.bookmarks.push({ id: b.id, ts: b.ts });
    });

  if (d.sessions !== undefined) {
    if (!Array.isArray(d.sessions)) errors.push('"sessions" must be a list.');
    else
      d.sessions.forEach((s, i) => {
        const ok = isObj(s) && typeof s.sid === 'string' && s.sid.length < 80 && typeof s.mode === 'string' && Array.isArray(s.queue) && s.queue.every(isId) && s.queue.length <= 1000 && isNum(s.index) && isNum(s.updatedAt);
        if (!ok) return bad('Session', i);
        out.sessions.push(JSON.parse(JSON.stringify({ sid: s.sid, mode: s.mode.slice(0, 30), queue: s.queue, index: s.index, phase: s.phase || 'ask', ratings: isObj(s.ratings) ? s.ratings : {}, notes: isObj(s.notes) ? s.notes : {}, cfg: isObj(s.cfg) ? s.cfg : {}, startedAt: isNum(s.startedAt) ? s.startedAt : s.updatedAt, updatedAt: s.updatedAt, done: !!s.done })));
      });
  }
  if (d.goals !== undefined) {
    if (!Array.isArray(d.goals)) errors.push('"goals" must be a list.');
    else
      d.goals.forEach((g, i) => {
        if (!(isObj(g) && typeof g.key === 'string' && g.key.length < 40 && isNum(g.value))) return bad('Goal', i);
        out.goals.push({ key: g.key, value: g.value });
      });
  }
  if (d.prefs !== undefined) {
    if (!isObj(d.prefs)) errors.push('"prefs" must be an object.');
    else out.prefs = sanitizePrefs(d.prefs);
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 20), data: errors.length ? null : out };
}

const reviewKey = (r) => `${r.qid}|${r.ts}|${r.rating}`;

/** Merge incoming into local. Newer activity wins per question; histories are unioned. */
export function mergeData(local, incoming) {
  const progress = new Map(local.progress.map((c) => [c.id, c]));
  for (const c of incoming.progress) {
    const cur = progress.get(c.id);
    if (!cur || c.lastSeen > cur.lastSeen || (c.lastSeen === cur.lastSeen && c.reviews > cur.reviews)) progress.set(c.id, c);
  }
  const reviews = new Map(local.reviews.map((r) => [reviewKey(r), r]));
  for (const r of incoming.reviews) reviews.set(reviewKey(r), r);
  const bookmarks = new Map(local.bookmarks.map((b) => [b.id, b]));
  for (const b of incoming.bookmarks) if (!bookmarks.has(b.id)) bookmarks.set(b.id, b);
  const sessions = new Map(local.sessions.map((s) => [s.sid, s]));
  for (const s of incoming.sessions) {
    const cur = sessions.get(s.sid);
    if (!cur || s.updatedAt > cur.updatedAt) sessions.set(s.sid, s);
  }
  const goals = new Map(local.goals.map((g) => [g.key, g]));
  for (const g of incoming.goals) if (!goals.has(g.key)) goals.set(g.key, g);
  return {
    progress: [...progress.values()],
    reviews: [...reviews.values()].sort((a, b) => a.ts - b.ts),
    bookmarks: [...bookmarks.values()],
    sessions: [...sessions.values()],
    goals: [...goals.values()],
    prefs: { ...incoming.prefs, ...local.prefs },
  };
}
