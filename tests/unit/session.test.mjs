import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, createSession, advance, summarizeSession } from '../../src/app/js/session.js';
import { resolveScope, applyFilters } from '../../src/app/js/scope.js';
import { newCard, review, recordExposure, DAY } from '../../src/app/js/srs.js';

const qs = Array.from({ length: 6 }, (_, i) => ({ id: `c/q${i}`, cat: i < 3 ? 'c' : 'd', difficulty: i % 2 ? 'advanced' : 'beginner', type: 'conceptual', sourceType: 'new' }));
qs.forEach((q) => (q.id = `${q.cat}/q${q.id.slice(-1)}`));
const T = 1_700_000_000_000;

test('sequential starts at the first unseen question and wraps without dropping any', () => {
  const cards = new Map([[qs[0].id, review(newCard(qs[0].id, T), 3, T)], [qs[1].id, review(newCard(qs[1].id, T), 3, T)]]);
  const q = buildQueue('sequential', qs, { cards });
  assert.deepEqual(q, [qs[2], qs[3], qs[4], qs[5], qs[0], qs[1]].map((x) => x.id));
});

test('random is a permutation; count truncates', () => {
  const q = buildQueue('random', qs, { rnd: () => 0.3, count: 4 });
  assert.equal(q.length, 4);
  assert.equal(new Set(q).size, 4);
  assert.deepEqual([...buildQueue('random', qs)].sort(), qs.map((x) => x.id).sort());
});

test('resolveScope: category, due ordering, weak, new, ids', () => {
  const cards = new Map();
  cards.set(qs[1].id, review(newCard(qs[1].id, T), 3, T - 5 * DAY)); // due T-4d
  cards.set(qs[0].id, review(newCard(qs[0].id, T), 3, T - 2 * DAY)); // due T-1d
  cards.set(qs[2].id, review(newCard(qs[2].id, T), 1, T - 3600000)); // weak + due
  cards.set(qs[3].id, recordExposure(newCard(qs[3].id, T), T));
  const ctx = { questions: qs, index: { paths: [{ id: 'p', ids: [qs[5].id, qs[0].id] }] }, cards, bookmarkIds: [qs[4].id], now: T };
  assert.deepEqual(resolveScope('cat:d', ctx).map((q) => q.id), qs.slice(3).map((q) => q.id));
  assert.deepEqual(resolveScope('due', ctx).map((q) => q.id), [qs[1].id, qs[0].id, qs[2].id]);
  assert.deepEqual(resolveScope('weak', ctx).map((q) => q.id), [qs[2].id]);
  assert.deepEqual(resolveScope('new', ctx).map((q) => q.id), [qs[4].id, qs[5].id]);
  assert.deepEqual(resolveScope('path:p', ctx).map((q) => q.id), [qs[5].id, qs[0].id]);
  assert.deepEqual(resolveScope('bookmarks', ctx).map((q) => q.id), [qs[4].id]);
  assert.deepEqual(resolveScope(`ids:${qs[2].id},nope/x`, ctx).map((q) => q.id), [qs[2].id]);
  assert.equal(resolveScope('path:missing', ctx).length, 0);
});

test('applyFilters by difficulty and status', () => {
  const cards = new Map([[qs[0].id, recordExposure(newCard(qs[0].id, T), T)]]);
  assert.equal(applyFilters(qs, { difficulty: 'advanced', cards }).length, 3);
  assert.equal(applyFilters(qs, { status: 'seen', cards }).length, 1);
  assert.equal(applyFilters(qs, { status: 'new', cards }).length, 5);
});

test('simulation session goes ask -> review -> done; others go straight to done', () => {
  const s = createSession({ mode: 'simulation', scope: 'all', queue: ['a/1', 'a/2'] }, T);
  assert.equal(s.phase, 'ask');
  advance(s);
  assert.equal(s.index, 1);
  assert.equal(advance(s), 'review');
  assert.equal(s.index, 0);
  advance(s);
  assert.equal(advance(s), 'done');
  assert.equal(s.done, true);
  const t = createSession({ mode: 'random', scope: 'all', queue: ['a/1'] }, T);
  assert.equal(advance(t), 'done');
});

test('summarizeSession counts ratings and skipped', () => {
  const s = createSession({ mode: 'random', scope: 'all', queue: ['a/1', 'a/2', 'a/3'] }, T);
  s.ratings = { 'a/1': 3, 'a/2': 1 };
  s.updatedAt = T + 5000;
  const r = summarizeSession(s);
  assert.deepEqual(r.counts, { 1: 1, 2: 0, 3: 1, 4: 0 });
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.again, ['a/2']);
  assert.equal(r.elapsedMs, 5000);
});
