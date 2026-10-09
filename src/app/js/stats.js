// Progress statistics. Pure functions over cards + review history so every number is explainable and testable.
import { isDue, isMastered, isWeak } from './srs.js';

export const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Consecutive days with at least one review, ending today (or yesterday if nothing yet today). */
export function streak(days, now = Date.now()) {
  const set = days instanceof Set ? days : new Set(days);
  let t = now;
  if (!set.has(dayKey(t))) t -= 86400000;
  let n = 0;
  while (set.has(dayKey(t))) {
    n++;
    t -= 86400000;
  }
  return n;
}

export function summarize({ cards, questions, reviews = [], now = Date.now(), opts = {} }) {
  const get = cards instanceof Map ? (id) => cards.get(id) : (id) => cards[id];
  const out = { total: questions.length, seen: 0, practiced: 0, mastered: 0, learning: 0, fresh: 0, due: 0, weak: 0, byCat: {} };
  for (const q of questions) {
    const b = (out.byCat[q.cat] ||= { total: 0, seen: 0, practiced: 0, mastered: 0, due: 0 });
    b.total++;
    const c = get(q.id);
    if (!c || (!c.exposures && !c.reviews)) {
      out.fresh++;
      continue;
    }
    out.seen++;
    b.seen++;
    if (c.reviews > 0) {
      out.practiced++;
      b.practiced++;
      if (isMastered(c, opts)) {
        out.mastered++;
        b.mastered++;
      } else out.learning++;
      if (isDue(c, now)) {
        out.due++;
        b.due++;
      }
      if (isWeak(c)) out.weak++;
    }
  }
  const days = new Set();
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const per = new Map();
  let today = 0;
  const todayKey = dayKey(now);
  const monthAgo = now - 30 * 86400000;
  let recentTotal = 0;
  let recentGood = 0;
  for (const r of reviews) {
    const k = dayKey(r.ts);
    days.add(k);
    per.set(k, (per.get(k) || 0) + 1);
    if (k === todayKey) today++;
    dist[r.rating] = (dist[r.rating] || 0) + 1;
    if (r.ts >= monthAgo) {
      recentTotal++;
      if (r.rating >= 3) recentGood++;
    }
  }
  out.reviewsToday = today;
  out.totalReviews = reviews.length;
  out.ratingDist = dist;
  out.streak = streak(days, now);
  out.recallConfidence30d = recentTotal ? Math.round((recentGood / recentTotal) * 100) : null;
  out.last14 = Array.from({ length: 14 }, (_, i) => {
    const t = now - (13 - i) * 86400000;
    const k = dayKey(t);
    return { day: k, count: per.get(k) || 0 };
  });
  return out;
}

/** Counts of cards falling due: overdue/now, today, tomorrow, within 7 days, later. */
export function forecast(cards, now = Date.now()) {
  const f = { now: 0, today: 0, tomorrow: 0, week: 0, later: 0 };
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const e0 = endToday.getTime();
  for (const c of cards.values ? cards.values() : Object.values(cards)) {
    if (!c || c.reviews === 0 || c.due == null) continue;
    if (c.due <= now) f.now++;
    else if (c.due <= e0) f.today++;
    else if (c.due <= e0 + 86400000) f.tomorrow++;
    else if (c.due <= e0 + 7 * 86400000) f.week++;
    else f.later++;
  }
  return f;
}
