import test from 'node:test';
import assert from 'node:assert/strict';
import { newCard, review, recordExposure, status, isMastered, isDue, isWeak, sanitizeLadder, previewIntervals, formatInterval, DAY, DEFAULT_LADDER } from '../../src/app/js/srs.js';

const T0 = 1_700_000_000_000;

test('sanitizeLadder cleans, sorts, dedupes and falls back', () => {
  assert.deepEqual(sanitizeLadder('3, 1 ,7,7'), [1, 3, 7]);
  assert.deepEqual(sanitizeLadder([5]), [...DEFAULT_LADDER]);
  assert.deepEqual(sanitizeLadder('abc'), [...DEFAULT_LADDER]);
  assert.deepEqual(sanitizeLadder([-1, 0, 2, 4]), [2, 4]);
});

test('new card has no exposure and status new', () => {
  const c = newCard('react/x', T0);
  assert.equal(status(c), 'new');
  assert.equal(status(undefined), 'new');
});

test('exposure alone makes a card seen but not practised', () => {
  const c = recordExposure(newCard('a/b', T0), T0 + 1);
  assert.equal(status(c), 'seen');
  assert.equal(c.reviews, 0);
  assert.equal(isDue(c, T0 + 10 * DAY), false);
});

test('Good climbs the ladder one step at a time', () => {
  let c = newCard('a/b', T0);
  c = review(c, 3, T0);
  assert.equal(c.intervalDays, 1);
  assert.equal(c.due, T0 + DAY);
  c = review(c, 3, T0 + DAY);
  assert.equal(c.intervalDays, 3);
  c = review(c, 3, T0);
  assert.equal(c.intervalDays, 7);
});

test('Easy climbs two steps and caps at the top of the ladder', () => {
  let c = review(newCard('a/b', T0), 4, T0);
  assert.equal(c.intervalDays, 3);
  for (let i = 0; i < 10; i++) c = review(c, 4, T0);
  assert.equal(c.intervalDays, DEFAULT_LADDER.at(-1));
  assert.equal(c.stage, DEFAULT_LADDER.length - 1);
});

test('Again resets to learning, retries in minutes and counts a lapse only after graduating', () => {
  let c = review(newCard('a/b', T0), 1, T0);
  assert.equal(c.stage, -1);
  assert.equal(c.lapses, 0);
  assert.equal(c.due, T0 + 10 * 60000);
  c = review(review(c, 3, T0), 3, T0);
  c = review(c, 1, T0);
  assert.equal(c.lapses, 1);
  assert.equal(c.intervalDays, 0);
});

test('Hard repeats the current step; on a new card it retries in half the first step', () => {
  let c = review(newCard('a/b', T0), 2, T0);
  assert.equal(c.stage, -1);
  assert.equal(c.due, T0 + DAY / 2);
  c = review(review(newCard('a/b', T0), 3, T0), 3, T0); // stage 1 (3d)
  const h = review(c, 2, T0);
  assert.equal(h.stage, c.stage);
  assert.equal(h.intervalDays, c.intervalDays);
});

test('custom ladder and masteryDays are honoured', () => {
  const c = review(newCard('a/b', T0), 3, T0, { ladder: [2, 5] });
  assert.equal(c.intervalDays, 2);
  const d = review(c, 3, T0, { ladder: [2, 5] });
  assert.equal(d.intervalDays, 5);
});

test('mastery needs 3+ reviews, last two Good/Easy and a long enough interval', () => {
  let c = newCard('a/b', T0);
  c = review(c, 3, T0); // 1d
  c = review(c, 3, T0); // 3d
  assert.equal(isMastered(c), false); // only 2 reviews
  c = review(c, 3, T0); // 7d
  assert.equal(isMastered(c), false); // interval < 14
  c = review(c, 3, T0); // 14d
  assert.equal(isMastered(c), true);
  assert.equal(status(c), 'mastered');
  assert.equal(isMastered(c, { masteryDays: 30 }), false);
  c = review(c, 2, T0); // Hard breaks "last two good"
  assert.equal(isMastered(c), false);
  assert.equal(status(c), 'learning');
});

test('isDue and isWeak', () => {
  const c = review(newCard('a/b', T0), 3, T0);
  assert.equal(isDue(c, T0 + DAY - 1), false);
  assert.equal(isDue(c, T0 + DAY), true);
  assert.equal(isWeak(review(newCard('a/b', T0), 1, T0)), true);
  assert.equal(isWeak(c), false);
});

test('review rejects invalid ratings and never mutates the input', () => {
  const c = newCard('a/b', T0);
  const copy = JSON.stringify(c);
  assert.throws(() => review(c, 5, T0), RangeError);
  review(c, 3, T0);
  assert.equal(JSON.stringify(c), copy);
});

test('previewIntervals labels each rating', () => {
  const p = previewIntervals(newCard('a/b', T0));
  assert.deepEqual(p, { 1: '10 min', 2: '12 h', 3: '1 d', 4: '3 d' });
  assert.equal(formatInterval(120 * DAY), '4 mo');
});
