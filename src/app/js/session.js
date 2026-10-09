// Study session construction (pure). A session is persisted after every action so it can be resumed.
import { shuffle, uid } from './util.js';
import { status } from './srs.js';

export const MODE_LIST = ['sequential', 'random', 'rapid', 'simulation', 'revision', 'audio', 'bookmarked'];

/** Order the questions for a mode and cut to `count` (0 = all). `rnd` is injectable for tests. */
export function buildQueue(mode, list, { cards = new Map(), count = 0, opts = {}, rnd = Math.random } = {}) {
  let q = [...list];
  if (mode === 'random' || mode === 'rapid' || mode === 'simulation') q = shuffle(q, rnd);
  else if (mode === 'sequential' || mode === 'audio') {
    // start at the first question you have not seen, wrapping around so nothing is dropped
    const first = q.findIndex((x) => ['new', 'seen'].includes(status(cards.get(x.id), opts)));
    if (first > 0) q = [...q.slice(first), ...q.slice(0, first)];
  }
  if (count > 0) q = q.slice(0, count);
  return q.map((x) => x.id);
}

export function createSession({ mode, scope, queue, cfg = {} }, now = Date.now()) {
  return {
    sid: uid(),
    mode,
    scope,
    queue,
    index: 0,
    phase: mode === 'simulation' ? 'ask' : 'study',
    ratings: {},
    notes: {},
    seen: {},
    times: {},
    cfg,
    startedAt: now,
    updatedAt: now,
    done: false,
  };
}

/** Advance the session pointer; returns the new phase. Simulation moves ask -> review -> done. */
export function advance(s) {
  if (s.index < s.queue.length - 1) {
    s.index++;
    return s.phase;
  }
  if (s.mode === 'simulation' && s.phase === 'ask') {
    s.phase = 'review';
    s.index = 0;
    return s.phase;
  }
  s.phase = 'done';
  s.done = true;
  return s.phase;
}

export function summarizeSession(s) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of Object.values(s.ratings)) counts[r]++;
  const rated = Object.keys(s.ratings).length;
  return { counts, rated, total: s.queue.length, skipped: s.queue.length - rated, elapsedMs: Math.max(0, s.updatedAt - s.startedAt), again: s.queue.filter((id) => s.ratings[id] <= 2) };
}
