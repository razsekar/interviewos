// Spaced-repetition scheduling. Pure functions, no DOM or storage: easy to test and to explain.
// A card moves along a ladder of review intervals (in days). Self-ratings move it along the ladder.
//   Again -> back to "learning" (retry in minutes)      Hard -> repeat the current step
//   Good  -> one step up the ladder                      Easy -> two steps up the ladder
// These are self-assessments of recall confidence, not measurements of knowledge.

export const RATING = Object.freeze({ again: 1, hard: 2, good: 3, easy: 4 });
export const RATING_LABEL = Object.freeze({ 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' });
export const DAY = 86400000;
export const DEFAULT_LADDER = Object.freeze([1, 3, 7, 14, 30, 60, 120]);
export const DEFAULTS = Object.freeze({ ladder: DEFAULT_LADDER, masteryDays: 14, againMinutes: 10 });

/** Accepts an array or a comma/space separated string; returns a clean ascending ladder or the default. */
export function sanitizeLadder(input) {
  const arr = (Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 3650);
  const uniq = [...new Set(arr)].sort((a, b) => a - b);
  return uniq.length >= 2 && uniq.length <= 12 ? uniq : [...DEFAULT_LADDER];
}

export function newCard(id, now = Date.now()) {
  return { id, firstSeen: now, lastSeen: now, exposures: 0, reviews: 0, lapses: 0, stage: -1, intervalDays: 0, due: null, lastRating: null, recent: [] };
}

export function recordExposure(card, now = Date.now()) {
  return { ...card, exposures: card.exposures + 1, lastSeen: now };
}

export function review(card, rating, now = Date.now(), opts = {}) {
  if (![1, 2, 3, 4].includes(rating)) throw new RangeError('rating must be 1-4');
  const o = { ...DEFAULTS, ...opts };
  const ladder = sanitizeLadder(o.ladder);
  const last = ladder.length - 1;
  const c = { ...card, recent: [...(card.recent || [])], reviews: card.reviews + 1, lastSeen: now, lastRating: rating };
  let stage = card.stage;
  if (rating === RATING.again) {
    if (stage >= 0) c.lapses = card.lapses + 1;
    stage = -1;
    c.intervalDays = 0;
    c.due = now + o.againMinutes * 60000;
  } else {
    if (rating === RATING.hard) {
      if (stage < 0) {
        c.intervalDays = 0;
        c.due = now + (ladder[0] * DAY) / 2; // not yet graduated: retry in half the first step
      } else {
        c.intervalDays = ladder[stage];
        c.due = now + ladder[stage] * DAY;
      }
    } else {
      stage = Math.min(stage + (rating === RATING.easy ? 2 : 1), last);
      c.intervalDays = ladder[stage];
      c.due = now + ladder[stage] * DAY;
    }
  }
  c.stage = Math.min(stage, last);
  c.recent.push(rating);
  if (c.recent.length > 5) c.recent.shift();
  return c;
}

export function isMastered(card, opts = {}) {
  if (!card) return false;
  const need = opts.masteryDays ?? DEFAULTS.masteryDays;
  const r = card.recent || [];
  return card.reviews >= 3 && r.length >= 2 && r.slice(-2).every((x) => x >= RATING.good) && card.intervalDays >= need;
}

/** 'new' | 'seen' | 'learning' | 'mastered' */
export function status(card, opts = {}) {
  if (!card || (!card.exposures && !card.reviews)) return 'new';
  if (card.reviews === 0) return 'seen';
  return isMastered(card, opts) ? 'mastered' : 'learning';
}

export const isPracticed = (card) => !!card && card.reviews > 0;
export const isDue = (card, now = Date.now()) => !!card && card.reviews > 0 && card.due != null && card.due <= now;
export const isWeak = (card) => !!card && card.reviews > 0 && (card.lapses >= 2 || card.lastRating === RATING.again || card.lastRating === RATING.hard);

export function formatInterval(ms) {
  if (ms < 3600000) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < DAY) return `${Math.round(ms / 3600000)} h`;
  const d = Math.round(ms / DAY);
  return d >= 60 ? `${Math.round(d / 30)} mo` : `${d} d`;
}

/** What the interval would be for each rating, to label the rating buttons honestly. */
export function previewIntervals(card, opts = {}) {
  const out = {};
  for (const r of [1, 2, 3, 4]) {
    const next = review(card, r, 0, opts);
    out[r] = formatInterval(next.due);
  }
  return out;
}
