// End-to-end tests in a real Chrome (puppeteer-core drives an installed browser; nothing is downloaded).
// Run after `npm run build`:  node --test tests/e2e/app.e2e.mjs      (set CHROME_PATH if Chrome is elsewhere)
// Skipped, not faked, when no Chrome is found.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { createServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean).find((p) => fs.existsSync(p));
const PORT = 4181;
const BASE = `http://localhost:${PORT}/interviewos/`;
const skip = !CHROME || !fs.existsSync(path.resolve('dist/index.html')) ? 'Chrome or dist/ not available' : false;

let server, browser;
const errors = [];

before(async () => {
  if (skip) return;
  server = createServer();
  await new Promise((r) => server.listen(PORT, r));
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
});

async function newPage({ width = 1280, height = 900, scheme = 'light' } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  // Deterministic fake speech engine: CI browsers have no voices, and the tests only need to observe calls.
  await page.evaluateOnNewDocument(() => {
    window.__speech = { speak: [], pause: 0, cancel: 0 };
    class U { constructor(t) { this.text = t; } }
    window.SpeechSynthesisUtterance = U;
    const fake = { speaking: false, paused: false, getVoices: () => [], addEventListener() {}, removeEventListener() {},
      speak(u) { window.__speech.speak.push(u.text); this.speaking = true; }, pause() { window.__speech.pause++; this.paused = true; },
      resume() { this.paused = false; }, cancel() { window.__speech.cancel++; this.speaking = false; } };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  });
  return page;
}
const go = async (page, p) => {
  await page.goto(BASE + p, { waitUntil: 'networkidle0' });
  if (p.startsWith('app/')) await page.waitForSelector('main h1, main #sq', { timeout: 8000 });
};
const hash = async (page, h) => {
  await page.evaluate((x) => (location.hash = x), h);
  await new Promise((r) => setTimeout(r, 400));
  await page.waitForSelector('main h1', { timeout: 8000 });
};
const idbAll = (page, store) =>
  page.evaluate(
    (s) => new Promise((res, rej) => {
      const r = indexedDB.open('interviewos');
      r.onsuccess = () => {
        const q = r.result.transaction(s).objectStore(s).getAll();
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      };
      r.onerror = () => rej(r.error);
    }),
    store,
  );
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());

test('public question page: three styles, default Detailed, preference persists', { skip }, async () => {
  const page = await newPage();
  await go(page, 'questions/mach-architecture/what-is-mach-architecture/');
  assert.equal(await page.$eval('#style-seg [aria-pressed=true]', (e) => e.dataset.style), 'detailed');
  assert.ok(await page.$eval('[data-style=detailed].style-section', (e) => !e.hidden));
  assert.ok(await page.$eval('[data-style=quick].style-section', (e) => e.hidden));
  await page.click('#style-seg [data-style=quick]');
  assert.ok(await page.$eval('[data-style=quick].style-section', (e) => !e.hidden));
  assert.ok(await page.$eval('[data-style=detailed].style-section', (e) => e.hidden));
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#style-seg [aria-pressed=true]', (e) => e.dataset.style), 'quick', 'preference persisted');
  const site = (process.env.SITE_URL || 'https://razsekar.github.io/interviewos/').replace(/\/?$/, '/');
  assert.equal(await page.$eval('link[rel=canonical]', (e) => e.href), site + 'questions/mach-architecture/what-is-mach-architecture/');
  assert.ok(await page.$('svg.dg title'), 'diagram has a title');
  await page.close();
});

test('app: dashboard loads with no errors; first-run state', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  assert.match(await text(page, 'main h1'), /Welcome/);
  assert.ok(await page.$eval('#net-status', (e) => e.hidden), 'offline chip hidden while online');
  await page.close();
});

test('study: reveal with Space, rate with a number key, progress is persisted and the session resumes after reload', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/study?mode=sequential&scope=cat:react');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#sq');
  const first = await text(page, '#sq');
  assert.equal(await page.$('#answer'), null, 'answer hidden before reveal');
  await page.keyboard.press('Space');
  await page.waitForSelector('#answer .md, #answer .answer-quick');
  assert.ok(await page.$('[data-rate="3"]'));
  await page.keyboard.press('3');
  await page.waitForFunction((t) => document.querySelector('#sq')?.textContent.trim() !== t, {}, first);
  const progress = await idbAll(page, 'progress');
  assert.equal(progress.length, 1);
  assert.equal(progress[0].reviews, 1);
  assert.equal(progress[0].lastRating, 3);
  assert.equal(progress[0].intervalDays, 1);
  const reviews = await idbAll(page, 'reviews');
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].mode, 'sequential');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#sq');
  assert.match(await text(page, '#pos'), /Question 2 of 10/);
  assert.notEqual(await text(page, '#sq'), first);
  // keys before reveal must not rate
  await page.keyboard.press('1');
  assert.equal((await idbAll(page, 'reviews')).length, 1, 'rating before reveal is ignored');
  await page.close();
});

test('bookmark with B persists; study bookmarked mode uses it', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/q/rest-api/idempotency-keys');
  if (!(await page.$('[data-bm]'))) await hash(page, '#/bank?q=idempotency');
  await hash(page, '#/bank?q=idempotency');
  const firstLink = await page.$eval('.qrow h3 a', (a) => a.getAttribute('href'));
  await page.goto(BASE + 'app/' + firstLink, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-bm]');
  await page.keyboard.press('b');
  await page.waitForFunction(() => document.querySelector('[data-bm]').getAttribute('aria-pressed') === 'true');
  assert.equal((await idbAll(page, 'bookmarks')).length, 1);
  await hash(page, '#/study?mode=bookmarked');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#sq');
  assert.match(await text(page, '#pos'), /of 1$/);
  await page.close();
});

test('simulation: answers stay hidden while answering, Space does not reveal, review phase shows them', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/study?mode=simulation&scope=cat:cdn-caching');
  await page.select('#s-count', '5');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#finish');
  assert.equal(await page.$('#answer'), null);
  await page.keyboard.press('Space');
  assert.equal(await page.$('#answer'), null, 'Space does not reveal in simulation');
  assert.match(await text(page, '#clock'), /^\d+:\d\d$/);
  await page.type('#notes', 'my outline');
  for (let i = 0; i < 5; i++) {
    await page.click('#finish');
    await new Promise((r) => setTimeout(r, 250));
  }
  await page.waitForSelector('#answer');
  assert.match(await text(page, '#pos'), /Question 1 of 5/);
  assert.ok((await text(page, 'main')).includes('my outline'), 'notes shown in review');
  await page.keyboard.press('4');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await idbAll(page, 'reviews')).length, 1);
  await page.close();
});

test('audio: nothing speaks on load; Play speaks on demand; Pause works', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/study?mode=audio&scope=cat:cdn-caching');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#audio-toggle');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal((await page.evaluate(() => window.__speech.speak.length)), 0, 'no auto-play');
  await page.click('#audio-toggle');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok((await page.evaluate(() => window.__speech.speak.length)) >= 1, 'speaks after Play');
  assert.equal(await text(page, '#audio-toggle'), '⏸ Pause');
  await page.click('#audio-toggle');
  assert.ok((await page.evaluate(() => window.__speech.pause)) >= 1);
  await page.keyboard.press('Escape');
  await page.close();
});

test('bank: search, filters and URL state', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/bank');
  await page.type('#f-q', 'idempotency');
  await page.waitForFunction(() => /^\d+ questions? match/.test(document.querySelector('#summary').textContent) && !/^1734 /.test(document.querySelector('#summary').textContent));
  const titles = await page.$$eval('.qrow h3', (n) => n.map((x) => x.textContent.toLowerCase()));
  assert.ok(titles.some((t) => t.includes('idempotency')));
  await page.select('#f-diff', 'advanced');
  await new Promise((r) => setTimeout(r, 300));
  const chips = await page.$$eval('.qrow .chip-advanced', (n) => n.length);
  const rows = await page.$$eval('.qrow', (n) => n.length);
  assert.equal(chips, rows);
  assert.match(await page.evaluate(() => location.hash), /q=idempotency/);
  await page.close();
});

test('backup: export, wipe, restore (replace) and reject a malformed file', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/study?mode=random&scope=cat:react');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#sq');
  await page.keyboard.press('Space');
  await page.waitForSelector('[data-rate="4"]');
  await page.keyboard.press('4');
  await new Promise((r) => setTimeout(r, 400));
  const backup = await page.evaluate(async () => (await import('./js/repo.js')).exportBackup());
  const parsed = JSON.parse(backup);
  assert.equal(parsed.format, 'interviewos-backup');
  assert.equal(parsed.data.progress.length, 1);
  const f = path.join(os.tmpdir(), 'io-backup.json');
  fs.writeFileSync(f, backup);
  const bad = path.join(os.tmpdir(), 'io-bad.json');
  fs.writeFileSync(bad, JSON.stringify({ format: 'interviewos-backup', version: 1, data: { progress: [{ id: '../x' }], reviews: [], bookmarks: [] } }));
  await hash(page, '#/settings');
  // wipe
  await page.click('#reset');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog [data-x=yes]');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await idbAll(page, 'progress')).length, 0);
  // malformed rejected, nothing changes
  const input = await page.$('#import-file');
  await input.uploadFile(bad);
  await page.waitForSelector('#import-panel [role=alert]');
  assert.equal((await idbAll(page, 'progress')).length, 0);
  // valid restored
  await input.uploadFile(f);
  await page.waitForSelector('#do-replace');
  await page.click('#do-replace');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog [data-x=yes]');
  await page.waitForFunction(() => /Restored/.test(document.querySelector('#import-panel').textContent));
  const progress = await idbAll(page, 'progress');
  assert.equal(progress.length, 1);
  assert.equal(progress[0].lastRating, 4);
  assert.equal((await idbAll(page, 'reviews')).length, 1);
  await page.close();
});

test('offline: after the service worker is active the app and a saved question work without a network', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 8000 });
  await hash(page, '#/q/cdn-caching/what-is-a-cdn');
  await page.setOfflineMode(true);
  await page.evaluate(() => (location.hash = '#/'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main h1', { timeout: 8000 });
  assert.match(await text(page, 'main h1'), /Welcome|Dashboard/);
  assert.ok(await page.evaluate(() => !document.querySelector('#net-status').hidden), 'offline indicator shows');
  await hash(page, '#/bank');
  await page.waitForSelector('.qrow');
  assert.ok((await page.$$('.qrow')).length > 0, 'question list works offline');
  await page.setOfflineMode(false);
  await page.close();
});

test('revision: a due question appears on the dashboard, is reviewed from the due queue and rescheduled', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await page.evaluate(async () => {
    const repo = await import('./js/repo.js');
    await repo.rate('rest-api/idempotency-keys', 3, { mode: 'test' }, Date.now() - 3 * 86400000); // due 2 days ago
  });
  await hash(page, '#/');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#h-due');
  assert.equal(await text(page, '#h-due + .stat'), '1');
  await hash(page, '#/study?mode=revision&scope=due');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#sq');
  assert.match(await text(page, '#sq'), /idempotency/i);
  assert.match(await text(page, '#pos'), /of 1$/);
  await page.keyboard.press('Space');
  await page.waitForSelector('[data-rate="3"]');
  await page.keyboard.press('3');
  await page.waitForSelector('h1');
  await page.waitForFunction(() => /Session complete/.test(document.querySelector('main h1')?.textContent));
  const card = (await idbAll(page, 'progress')).find((c) => c.id === 'rest-api/idempotency-keys');
  assert.equal(card.reviews, 2);
  assert.equal(card.intervalDays, 3, 'second Good moves up the ladder from 1 to 3 days');
  assert.ok(card.due > Date.now() + 2 * 86400000);
  await hash(page, '#/study?mode=revision&scope=due');
  await page.click('#setup button[type=submit]');
  assert.match(await text(page, '#setup-msg'), /Nothing is due/);
  await page.close();
});

test('rapid-fire: answer shows itself after the countdown and uses the Short Revision text', { skip }, async () => {
  const page = await newPage();
  await go(page, 'app/');
  await hash(page, '#/study?mode=rapid&scope=cat:cdn-caching');
  await page.$eval('#s-rapid', (e) => (e.value = '5'));
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('#reveal');
  assert.equal(await page.$('#answer'), null);
  await page.waitForSelector('#answer', { timeout: 9000 });
  assert.ok(await page.$('#answer .answer-revision'), 'revision style is used');
  assert.equal(await page.$('#style-seg'), null, 'no style switch in rapid-fire');
  await page.close();
});

test('theme: public toggle cycles system, light, dark and persists across pages and into the app', { skip }, async () => {
  const page = await newPage();
  await go(page, '');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
  await page.click('#theme-toggle');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  await page.click('#theme-toggle');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  await go(page, 'app/');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(12, 10, 9)');
  await page.close();
});

const AXE_PAGES = [
  ['public home', ''],
  ['public question', 'questions/rest-api/idempotency-keys/'],
  ['topic guide', 'topics/react/'],
  ['methodology', 'methodology/'],
  ['app dashboard', 'app/'],
  ['app bank', 'app/#/bank'],
  ['app study setup', 'app/#/study'],
  ['app progress', 'app/#/progress'],
  ['app settings', 'app/#/settings'],
  ['app revision', 'app/#/revision'],
  ['app paths', 'app/#/paths/frontend-architecture'],
  ['app question', 'app/#/q/react/what-is-react'],
];
for (const scheme of ['light', 'dark']) {
  test(`accessibility (axe, WCAG 2.x A/AA + best practice) in ${scheme} theme`, { skip }, async () => {
    const page = await newPage({ scheme });
    const bad = [];
    for (const [name, p] of AXE_PAGES) {
      await page.goto(BASE + p, { waitUntil: 'networkidle0' });
      if (p.startsWith('app/')) { await page.waitForSelector('main h1'); await new Promise((r) => setTimeout(r, 500)); }
      await page.evaluate(AXE);
      const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
      for (const v of res.violations) bad.push(`${name}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    // a running study session too
    await page.goto(BASE + 'app/#/study?mode=sequential&scope=cat:react', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#setup');
    await page.click('#setup button[type=submit]');
    await page.waitForSelector('#sq');
    await page.keyboard.press('Space');
    await page.waitForSelector('#answer .md, #answer .answer-quick');
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(AXE);
    const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
    for (const v of res.violations) bad.push(`study session: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    assert.deepEqual(bad, []);
    await page.close();
  });
}

test('responsive: no horizontal page scroll at 375px on key pages', { skip }, async () => {
  const page = await newPage({ width: 375, height: 800 });
  const over = [];
  for (const p of ['', 'questions/micro-frontends/what-is-a-micro-frontend/', 'topics/aws-cloud/', 'app/', 'app/#/bank', 'app/#/settings', 'app/#/progress']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 400));
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    if (w[0] > w[1]) over.push(`${p || '/'}: ${w[0]} > ${w[1]}`);
  }
  assert.deepEqual(over, []);
  await page.close();
});

test('no uncaught page errors or console errors during the whole run', { skip }, () => {
  assert.deepEqual(errors, []);
});
