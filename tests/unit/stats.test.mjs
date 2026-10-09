import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, streak, dayKey, forecast } from '../../src/app/js/stats.js';
import { newCard, review, recordExposure, DAY } from '../../src/app/js/srs.js';

const NOW = new Date(2025, 5, 15, 12, 0, 0).getTime();

test('streak counts consecutive days, tolerating no review yet today', () => {
  const days = new Set([dayKey(NOW), dayKey(NOW - DAY), dayKey(NOW - 2 * DAY), dayKey(NOW - 4 * DAY)]);
  assert.equal(streak(days, NOW), 3);
  assert.equal(streak(new Set([dayKey(NOW - DAY)]), NOW), 1);
  assert.equal(streak(new Set([dayKey(NOW - 3 * DAY)]), NOW), 0);
});

test('summarize separates seen, practised and mastered, and reports due items', () => {
  const qs = ['a/1', 'a/2', 'a/3', 'b/1'].map((id) => ({ id, cat: id.split('/')[0] }));
  const cards = new Map();
  cards.set('a/1', recordExposure(newCard('a/1', NOW), NOW));
  let c2 = newCard('a/2', NOW);
  for (let i = 0; i < 4; i++) c2 = review(c2, 3, NOW - 10 * DAY);
  cards.set('a/2', c2);
  cards.set('a/3', review(newCard('a/3', NOW), 1, NOW - DAY));
  const reviews = [
    { qid: 'a/3', ts: NOW - 1000, rating: 1 },
    { qid: 'a/2', ts: NOW - DAY, rating: 3 },
  ];
  const s = summarize({ cards, questions: qs, reviews, now: NOW });
  assert.equal(s.total, 4);
  assert.equal(s.fresh, 1);
  assert.equal(s.seen, 3);
  assert.equal(s.practiced, 2);
  assert.equal(s.mastered, 1);
  assert.equal(s.learning, 1);
  assert.equal(s.due, 1); // a/3 retry is overdue
  assert.equal(s.byCat.a.total, 3);
  assert.equal(s.byCat.b.seen, 0);
  assert.equal(s.reviewsToday, 1);
  assert.equal(s.streak, 2);
  assert.equal(s.recallConfidence30d, 50);
  assert.equal(s.last14.length, 14);
});

test('forecast buckets due dates', () => {
  const m = new Map();
  m.set('a/1', { reviews: 1, due: NOW - 1 });
  m.set('a/2', { reviews: 1, due: NOW + 60000 });
  m.set('a/3', { reviews: 1, due: NOW + DAY });
  m.set('a/4', { reviews: 1, due: NOW + 5 * DAY });
  m.set('a/5', { reviews: 1, due: NOW + 40 * DAY });
  m.set('a/6', { reviews: 0, due: null });
  assert.deepEqual(forecast(m, NOW), { now: 1, today: 1, tomorrow: 1, week: 1, later: 1 });
});
