// Integration: real builds into temp directories, then the real site checker, including fault injection.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'io-build-'));

function build(dir, siteUrl) {
  const env = { ...process.env, DIST_DIR: dir, SITE_URL: siteUrl };
  const run = (args) => {
    const r = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
    return r.stdout;
  };
  run(['tools/build/build.mjs']);
  const css = spawnSync(path.join(ROOT, 'node_modules/.bin/tailwindcss'), ['-c', 'tailwind.config.cjs', '-i', 'src/styles/input.css', '-o', path.join(dir, 'assets/app.css'), '--minify'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(css.status, 0, css.stderr);
  run(['tools/build/post-build.mjs']);
}
const check = (dir, siteUrl) => spawnSync(process.execPath, ['tools/check/check-site.mjs', dir], { cwd: ROOT, env: { ...process.env, SITE_URL: siteUrl, BANNED_TERMS: 'Acme Motors' }, encoding: 'utf8' });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const SITES = { sub: 'https://example.github.io/some-repo/', root: 'https://learn.example.org/' };
const dirs = { sub: path.join(tmp, 'sub'), root: path.join(tmp, 'root') };

before(() => {
  for (const k of Object.keys(SITES)) build(dirs[k], SITES[k]);
});

for (const k of Object.keys(SITES)) {
  test(`site passes every check when hosted at ${SITES[k]} (${k === 'sub' ? 'sub-path' : 'domain root'})`, () => {
    const r = check(dirs[k], SITES[k]);
    assert.equal(r.status, 0, r.stdout.slice(-2000));
    const rep = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(rep.errors, 0);
    assert.equal(rep.questionsChecked, 1734);
    assert.ok(rep.internalLinksChecked > 10000);
  });
}

test('output structure: pages, data files, SEO files, no sources', () => {
  const d = dirs.sub;
  for (const f of ['index.html', 'categories/index.html', 'about/index.html', 'methodology/index.html', 'privacy/index.html', 'terms/index.html', 'accessibility/index.html', 'contact/index.html', 'directory/index.html', '404.html', 'offline.html', 'app/index.html', 'sitemap.xml', 'robots.txt', 'manifest.webmanifest', 'sw.js', 'data/index.json', 'data/search.json']) assert.ok(fs.existsSync(path.join(d, f)), f);
  assert.equal(fs.readdirSync(path.join(d, 'topics')).length, 55);
  assert.equal(fs.readdirSync(path.join(d, 'data/q')).length, 55);
  assert.equal(walk(path.join(d, 'questions')).length, 1734);
  assert.equal(walk(d).filter((f) => /\.pdf$/i.test(f)).length, 0);
  for (const dir of ['sources', 'extracted', 'content', 'docs']) assert.ok(!fs.existsSync(path.join(d, dir)), dir + ' must not be published');
});

test('canonicals, sitemap and robots use the configured site URL', () => {
  const d = dirs.sub;
  const home = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
  assert.match(home, /<link rel="canonical" href="https:\/\/example\.github\.io\/some-repo\/">/);
  assert.match(fs.readFileSync(path.join(d, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/example\.github\.io\/some-repo\/topics\/react\/<\/loc>/);
  assert.match(fs.readFileSync(path.join(d, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/example\.github\.io\/some-repo\/sitemap\.xml/);
  const notFound = fs.readFileSync(path.join(d, '404.html'), 'utf8');
  assert.match(notFound, /href="\/some-repo\/directory\/"/, '404 uses the base path of the configured URL');
});

test('private/app/utility pages are noindex and excluded from the sitemap', () => {
  const d = dirs.sub;
  const sm = fs.readFileSync(path.join(d, 'sitemap.xml'), 'utf8');
  for (const f of ['app/index.html', '404.html', 'offline.html']) {
    const h = fs.readFileSync(path.join(d, f), 'utf8');
    assert.match(h, /name="robots" content="noindex/);
    assert.doesNotMatch(h, /rel="canonical"/);
  }
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const u of ['app/', '404.html', 'offline.html']) assert.ok(!locs.includes('https://example.github.io/some-repo/' + u), u);
});

test('each question page has three answer styles, unique canonical and valid JSON-LD', () => {
  const d = dirs.sub;
  const html = fs.readFileSync(path.join(d, 'questions/react/what-is-react/index.html'), 'utf8');
  for (const s of ['detailed', 'quick', 'revision']) assert.match(html, new RegExp(`data-style="${s}"`));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(ld.map((x) => x['@type']).sort(), ['BreadcrumbList', 'TechArticle']);
});

test('service worker precache list is complete and built (no placeholders)', () => {
  const sw = fs.readFileSync(path.join(dirs.sub, 'sw.js'), 'utf8');
  assert.doesNotMatch(sw, /__BUILD__|__PRECACHE__/);
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert.ok(list.includes('app/index.html') && list.includes('offline.html') && list.includes('assets/app.css'));
  for (const f of list) assert.ok(fs.existsSync(path.join(dirs.sub, f)), f);
});

// ---- fault injection: prove the checker actually fails when it should ----
function faulty(mutate) {
  const dir = path.join(tmp, 'fault-' + Math.random().toString(36).slice(2));
  fs.cpSync(dirs.sub, dir, { recursive: true });
  mutate(dir);
  const r = check(dir, SITES.sub);
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}
const edit = (dir, f, fn) => fs.writeFileSync(path.join(dir, f), fn(fs.readFileSync(path.join(dir, f), 'utf8')));
const Q = 'questions/react/what-is-react/index.html';

const FAULTS = [
  ['broken internal link', (d) => edit(d, 'about/index.html', (h) => h.replace('</main>', '<a href="../nope/">x</a></main>')), /broken link/],
  ['broken anchor', (d) => edit(d, 'about/index.html', (h) => h.replace('</main>', '<a href="../methodology/#nope">x</a></main>')), /broken anchor/],
  ['root-absolute asset path', (d) => edit(d, Q, (h) => h.replace('../../../assets/app.css', '/assets/app.css')), /root-absolute/],
  ['missing meta description', (d) => edit(d, Q, (h) => h.replace(/<meta name="description"[^>]*>/, '')), /missing meta description/],
  ['wrong canonical', (d) => edit(d, Q, (h) => h.replace(/rel="canonical" href="[^"]*"/, 'rel="canonical" href="https://evil.example/"')), /canonical/],
  ['duplicate title', (d) => edit(d, Q, (h) => h.replace(/<title>[^<]*<\/title>/, '<title>Same</title>')) || edit(d, 'questions/react/why-use-react/index.html', (h) => h.replace(/<title>[^<]*<\/title>/, '<title>Same</title>')), /duplicate title/],
  ['img without alt', (d) => edit(d, Q, (h) => h.replace('</main>', '<img src="../../../icons/icon-192.png"></main>')), /img without alt/],
  ['second h1', (d) => edit(d, Q, (h) => h.replace('</main>', '<h1>Again</h1></main>')), /exactly one <h1>/],
  ['skipped heading level', (d) => edit(d, 'about/index.html', (h) => h.replace('</main>', '<h4>Deep</h4></main>')), /heading level jumps/],
  ['orphan page', (d) => fs.mkdirSync(path.join(d, 'lonely')) || fs.writeFileSync(path.join(d, 'lonely/index.html'), fs.readFileSync(path.join(d, 'about/index.html'), 'utf8').replace(/<title>[^<]*<\/title>/, '<title>Lonely</title>').replace(/<meta name="description" content="[^"]*"/, '<meta name="description" content="A lonely page nobody links to, with a unique description for the test."').replace(/rel="canonical" href="[^"]*"/, 'rel="canonical" href="https://example.github.io/some-repo/lonely/"')), /orphan|sitemap/],
  ['PDF published', (d) => fs.writeFileSync(path.join(d, 'secret.pdf'), '%PDF'), /must not be published/],
  ['banned private term leaked', (d) => edit(d, 'data/index.json', (t) => t.replace('"total"', '"note":"Acme Motors","total"')), /banned private term/],
  ['secret leaked', (d) => edit(d, 'about/index.html', (h) => h.replace('</main>', '<p>ghp_abcdefghijklmnopqrstuvwxyz0123456789</p></main>')), /secret/],
  ['invalid JSON-LD', (d) => edit(d, Q, (h) => h.replace('{"@context"', '{"@context" BROKEN')), /invalid JSON-LD/],
  ['JSON-LD asserts a date', (d) => edit(d, Q, (h) => h.replace('"inLanguage"', '"datePublished":"2020-01-01","inLanguage"')), /unsupported data/],
  ['sitemap missing a page', (d) => edit(d, 'sitemap.xml', (x) => x.replace(/<url><loc>[^<]*topics\/react\/<\/loc><\/url>\n?/, '')), /missing indexable page/],
  ['noindex page listed in sitemap', (d) => edit(d, 'sitemap.xml', (x) => x.replace('</urlset>', '<url><loc>https://example.github.io/some-repo/app/</loc></url></urlset>')), /sitemap/],
  ['missing detail fragment', (d) => fs.rmSync(path.join(d, 'data/d/react/what-is-react.html')), /missing detail fragment/],
  ['bad related slug', (d) => edit(d, 'data/q/react.json', (t) => t.replace('"related":["why-use-react"', '"related":["does-not-exist"')), /related slug/],
  ['service worker precache entry missing', (d) => fs.rmSync(path.join(d, 'assets/site.js')), /precache entry missing/],
];
for (const [name, mutate, re] of FAULTS) {
  test(`checker catches: ${name}`, () => {
    const r = faulty(mutate);
    assert.equal(r.status, 1, `expected failure for "${name}"`);
    assert.match(r.stdout, re);
  });
}
