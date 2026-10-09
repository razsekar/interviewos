import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, validateBackup, mergeData, BACKUP_FORMAT } from '../../src/app/js/backup-core.js';

const card = (id, over = {}) => ({ id, firstSeen: 1, lastSeen: 10, exposures: 1, reviews: 1, lapses: 0, stage: 0, intervalDays: 1, due: 99, lastRating: 3, recent: [3], ...over });
const sample = () => ({
  progress: [card('react/a')],
  reviews: [{ qid: 'react/a', ts: 5, rating: 3, mode: 'sequential', style: 'quick' }],
  bookmarks: [{ id: 'react/a', ts: 7 }],
  sessions: [],
  goals: [{ key: 'daily', value: 10 }],
  prefs: { theme: 'dark', style: 'quick' },
});

test('round trip: build then validate returns the same data', () => {
  const b = buildBackup(sample(), 1_700_000_000_000);
  assert.equal(b.format, BACKUP_FORMAT);
  const v = validateBackup(JSON.parse(JSON.stringify(b)));
  assert.equal(v.ok, true, v.errors.join(';'));
  assert.deepEqual(v.data.progress, sample().progress);
  assert.deepEqual(v.data.prefs, { theme: 'dark', style: 'quick' });
});

test('rejects wrong format, newer version, and malformed records', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ format: 'x', version: 1, data: {} }).ok, false);
  assert.match(validateBackup({ format: BACKUP_FORMAT, version: 99, data: {} }).errors.join(), /newer/);
  const b = buildBackup(sample());
  b.data.progress[0].id = '../../etc/passwd';
  assert.equal(validateBackup(b).ok, false);
  const c = buildBackup(sample());
  c.data.reviews[0].rating = 9;
  assert.equal(validateBackup(c).ok, false);
  const d = buildBackup(sample());
  d.data.progress = 'nope';
  assert.equal(validateBackup(d).ok, false);
});

test('unknown or invalid preferences are dropped, not trusted', () => {
  const b = buildBackup({ ...sample(), prefs: { theme: 'neon', rate: 99, evil: '<script>', style: 'quick', __proto__: { x: 1 } } });
  const v = validateBackup(b);
  assert.equal(v.ok, true);
  assert.deepEqual(v.data.prefs, { style: 'quick' });
});

test('merge keeps the newer progress per question and unions histories', () => {
  const local = { ...sample(), progress: [card('react/a', { lastSeen: 20, reviews: 2 })], prefs: { theme: 'light' } };
  const incoming = {
    progress: [card('react/a', { lastSeen: 15, reviews: 5 }), card('react/b')],
    reviews: [{ qid: 'react/a', ts: 5, rating: 3, mode: 'x', style: '' }, { qid: 'react/b', ts: 6, rating: 4, mode: 'x', style: '' }],
    bookmarks: [{ id: 'react/b', ts: 8 }],
    sessions: [],
    goals: [{ key: 'daily', value: 50 }, { key: 'weekly', value: 3 }],
    prefs: { theme: 'dark', style: 'quick' },
  };
  const m = mergeData(local, incoming);
  assert.equal(m.progress.find((c) => c.id === 'react/a').reviews, 2);
  assert.equal(m.progress.length, 2);
  assert.equal(m.reviews.length, 2);
  assert.equal(m.bookmarks.length, 2);
  assert.equal(m.goals.find((g) => g.key === 'daily').value, 10);
  assert.equal(m.goals.length, 2);
  assert.deepEqual(m.prefs, { theme: 'light', style: 'quick' });
});
