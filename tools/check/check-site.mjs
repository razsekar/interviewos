// Post-build site validation: links, anchors, orphans, SEO metadata, JSON-LD, sitemap/robots, accessibility basics,
// and a leak scan (PDFs, source filenames, employer name, secrets). Exit code 1 on any error.
// Usage: node tools/check/check-site.mjs [distDir]
import fs from 'node:fs';
import path from 'node:path';

import { bannedRegex, sourceNameLeaks } from '../lib/banned.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BANNED = bannedRegex();
const NAME_LEAKS = sourceNameLeaks();
const DIST = path.resolve(process.argv[2] || process.env.DIST_DIR || path.join(ROOT, 'dist'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE_URL = (process.env.SITE_URL || cfg.defaultSiteUrl).replace(/\/?$/, '/');
const BASE = new URL(SITE_URL).pathname;

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const all = walk(DIST);
const rel = (f) => path.relative(DIST, f).split(path.sep).join('/');
const htmlFiles = all.filter((f) => f.endsWith('.html') && !rel(f).startsWith('data/'));
const exists = (p) => fs.existsSync(path.join(DIST, p));

// ---------- leak scan ----------
for (const f of all) {
  const r = rel(f);
  if (/\.pdf$/i.test(r) || /^(sources|extracted|content|docs)\//.test(r)) err(r, 'must not be published');
  if (/\.(html|json|js|css|xml|txt|webmanifest)$/.test(r)) {
    const t = fs.readFileSync(f, 'utf8');
    if (BANNED && BANNED.test(t)) err(r, 'contains a banned private term (see tools/lib/banned.mjs)');
    if (/ghp_[A-Za-z0-9]{20,}|github_pat_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(t)) err(r, 'looks like it contains a secret');
    if (/\/Users\/|C:\\Users\\/.test(t)) warn(r, 'contains a local filesystem path');
    if (/\.pdf\b/i.test(t) && !/^sw\.js$/.test(r)) warn(r, 'mentions a .pdf filename');
    if (NAME_LEAKS.some((n) => n && t.includes(n))) err(r, 'leaks a source file name');
  }
}

// ---------- parse pages ----------
const pages = new Map(); // rel path -> info
const idMap = new Map();
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, 'i')) || [])[2] ?? (tag.match(new RegExp(`\\s${name}=('([^']*)')`, 'i')) || [])[2];
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

for (const f of htmlFiles) {
  const r = rel(f);
  const html = fs.readFileSync(f, 'utf8');
  const info = { r, html };
  info.title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const metas = [...html.matchAll(/<meta\s[^>]*>/gi)].map((m) => m[0]);
  info.description = decode(attr(metas.find((m) => /name="description"/.test(m)) || '', 'content') || '');
  info.robots = attr(metas.find((m) => /name="robots"/.test(m)) || '', 'content') || '';
  info.noindex = /noindex/.test(info.robots);
  info.canonical = attr((html.match(/<link\s[^>]*rel="canonical"[^>]*>/) || [''])[0], 'href');
  info.ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  info.links = [...html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>/g)].map((m) => decode(m[1]));
  info.abs = r === '404.html' || r === 'offline.html';
  pages.set(r, info);
  idMap.set(r, new Set(info.ids));
}

const pagePath = (r) => (r === 'index.html' ? '' : r === '404.html' || r === 'offline.html' ? r : r.replace(/index\.html$/, ''));
const pagesMeta = fs.existsSync(path.join(ROOT, 'reports/pages.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'reports/pages.json'), 'utf8')) : null;

const titles = new Map();
const descs = new Map();
const inbound = new Map();

for (const [r, p] of pages) {
  const html = p.html;
  const indexable = !p.noindex;
  if (!/<html lang="[a-z-]+"/.test(html)) err(r, 'missing <html lang>');
  if (!/name="viewport"/.test(html)) err(r, 'missing viewport meta');
  if (!p.title) err(r, 'missing <title>');
  else if (p.title.length > 110) warn(r, `title is ${p.title.length} chars (will likely be truncated in results)`);
  if (!p.description) err(r, 'missing meta description');
  else if (indexable && (p.description.length < 40 || p.description.length > 175)) warn(r, `description is ${p.description.length} chars`);
  if (indexable) {
    const exp = SITE_URL + pagePath(r);
    if (p.canonical !== exp) err(r, `canonical ${p.canonical} != ${exp}`);
    if (titles.has(p.title)) err(r, `duplicate title with ${titles.get(p.title)}`);
    titles.set(p.title, r);
    if (descs.has(p.description)) err(r, `duplicate description with ${descs.get(p.description)}`);
    descs.set(p.description, r);
    for (const prop of ['og:title', 'og:description', 'og:url', 'og:image']) if (!html.includes(`property="${prop}"`)) err(r, `missing ${prop}`);
  } else if (p.canonical) err(r, 'noindex page should not declare a canonical');

  // headings
  const main = (html.match(/<main[\s\S]*<\/main>/) || [html])[0];
  const hs = [...main.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  const shell = r === 'app/index.html'; // the app shell's <h1> is rendered per route by JavaScript (checked in E2E/axe)
  if (!shell && hs.filter((h) => h === 1).length !== 1) err(r, `expected exactly one <h1>, found ${hs.filter((h) => h === 1).length}`);
  for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) err(r, `heading level jumps h${hs[i - 1]} -> h${hs[i]}`);
  // duplicate ids
  const seen = new Set();
  for (const id of p.ids) {
    if (seen.has(id)) err(r, `duplicate id "${id}"`);
    seen.add(id);
  }
  // images & svg
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (attr(m[0], 'alt') === undefined) err(r, 'img without alt');
  for (const m of html.matchAll(/<svg\b[^>]*role="img"[^>]*>([\s\S]*?)<\/svg>/g)) if (!/<title/.test(m[1])) err(r, 'svg role=img without <title>');
  // buttons / links need names
  for (const m of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) if (!m[1].replace(/<[^>]+>/g, '').trim() && !/aria-label=/.test(m[0])) err(r, 'button without accessible name');
  for (const m of html.matchAll(/<a\b[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) if (!m[1].replace(/<svg[\s\S]*?<\/svg>/g, 'x').replace(/<[^>]+>/g, '').trim() && !/aria-label=/.test(m[0])) err(r, 'link without text');
  // root-absolute URLs (break on sub-path hosting) except on pages designed for arbitrary depth
  if (!p.abs) for (const m of html.matchAll(/(?:href|src)="(\/[^"/][^"]*)"/g)) err(r, `root-absolute URL ${m[1]}`);
  else for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) if (!m[1].startsWith(BASE)) err(r, `absolute URL ${m[1]} outside base ${BASE}`);
  // JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch (e) { err(r, 'invalid JSON-LD: ' + e.message); continue; }
    if (!j['@context'] || !j['@type']) err(r, 'JSON-LD missing @context/@type');
    if (j['@type'] === 'TechArticle' && (!j.headline || j.headline.length > 110)) err(r, 'TechArticle headline missing or >110 chars');
    if (j['@type'] === 'BreadcrumbList') j.itemListElement.forEach((it, i) => it.position !== i + 1 && err(r, 'breadcrumb positions out of order'));
    const keys = [];
    (function walkKeys(o) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.push(k); walkKeys(v); } })(j);
    const bad = keys.filter((k) => ['dateModified', 'datePublished', 'author', 'aggregateRating', 'review', 'reviewedBy', 'contributor'].includes(k));
    if (bad.length) err(r, `JSON-LD asserts unsupported data: ${bad.join(', ')}`);
  }
  // CSP present
  if (!/Content-Security-Policy/.test(html)) err(r, 'missing CSP meta');
}

// ---------- links ----------
let linkCount = 0;
for (const [r, p] of pages) {
  const baseDir = path.posix.dirname(r);
  for (const href of p.links) {
    if (!href || href.startsWith('mailto:') || /^https?:\/\//.test(href) || href.startsWith('javascript:')) continue;
    linkCount++;
    let [pth, frag] = href.split('#');
    let target;
    if (href.startsWith('#')) target = r;
    else {
      let resolved = p.abs && pth.startsWith('/') ? pth.slice(BASE.length) : path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, pth));
      if (resolved === '.' || resolved === '') resolved = '';
      if (resolved === '' || resolved.endsWith('/')) resolved += 'index.html';
      else if (!path.posix.extname(resolved) && exists(resolved + '/index.html')) resolved += '/index.html';
      target = resolved;
    }
    if (!exists(target)) {
      err(r, `broken link ${href} -> ${target}`);
      continue;
    }
    if (target !== r) (inbound.get(target) || inbound.set(target, new Set()).get(target)).add(r);
    if (frag && target.endsWith('.html') && !target.startsWith('app/') && !(idMap.get(target) || new Set()).has(frag)) err(r, `broken anchor ${href}`);
  }
}

// ---------- orphans ----------
for (const [r, p] of pages) {
  if (p.noindex || r === 'index.html') continue;
  if (!inbound.get(r)?.size) err(r, 'orphan page: no internal links point to it');
}

// ---------- sitemap & robots ----------
const sm = exists('sitemap.xml') ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8') : '';
if (!sm) err('sitemap.xml', 'missing');
const smUrls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
const indexable = [...pages.entries()].filter(([, p]) => !p.noindex).map(([r]) => SITE_URL + pagePath(r));
for (const u of indexable) if (!smUrls.includes(u)) err('sitemap.xml', `missing indexable page ${u}`);
for (const u of smUrls) {
  if (!u.startsWith(SITE_URL)) err('sitemap.xml', `URL outside site: ${u}`);
  if (!indexable.includes(u)) err('sitemap.xml', `lists a non-indexable or unknown page: ${u}`);
}
if (new Set(smUrls).size !== smUrls.length) err('sitemap.xml', 'duplicate URLs');
if (smUrls.length > 50000) err('sitemap.xml', 'over 50,000 URLs');
const robots = exists('robots.txt') ? fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`Sitemap: ${SITE_URL}sitemap.xml`)) err('robots.txt', 'does not reference the sitemap');
if (/Disallow:\s*\/\s*$/m.test(robots)) err('robots.txt', 'blocks the whole site');

// ---------- data integrity ----------
const idx = JSON.parse(fs.readFileSync(path.join(DIST, 'data/index.json'), 'utf8'));
let qCount = 0;
const allIds = new Set();
for (const c of idx.categories) {
  const list = JSON.parse(fs.readFileSync(path.join(DIST, `data/q/${c.id}.json`), 'utf8'));
  if (list.length !== c.count) err(`data/q/${c.id}.json`, 'count mismatch');
  for (const q of list) {
    qCount++;
    if (allIds.has(q.id)) err(q.id, 'duplicate question id');
    allIds.add(q.id);
    if (!exists(`data/d/${q.cat}/${q.slug}.html`)) err(q.id, 'missing detail fragment');
    if (q.page && !exists(q.page + 'index.html')) err(q.id, `missing public page ${q.page}`);
    if (!q.quick || !q.revision) err(q.id, 'missing answer style');
    for (const rel of q.related) if (!list.some((x) => x.slug === rel)) err(q.id, `related slug ${rel} not found`);
  }
}
for (const p of idx.paths) for (const id of p.ids) if (!allIds.has(id)) err(`path ${p.id}`, `unknown question ${id}`);
for (const [r, p] of pages) for (const href of p.links) {
  const m = href.match(/app\/#\/q\/([a-z0-9-]+\/[a-z0-9-]+)$/);
  if (m && !allIds.has(m[1])) err(r, `app deep link to unknown question ${m[1]}`);
}
// manifest & icons
const mf = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8'));
for (const i of mf.icons) if (!exists(i.src)) err('manifest', `missing icon ${i.src}`);
if (mf.start_url.startsWith('/')) err('manifest', 'start_url must be relative');
if (!exists('sw.js')) err('sw.js', 'missing (run npm run build)');
else {
  const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  for (const f of list) if (!exists(f)) err('sw.js', `precache entry missing: ${f}`);
  if (sw.includes('__BUILD__') || sw.includes('__PRECACHE__')) err('sw.js', 'unfilled placeholders');
}

const report = {
  checkedAt: new Date().toISOString(),
  siteUrl: SITE_URL,
  htmlPages: pages.size,
  indexablePages: indexable.length,
  noindexPages: pages.size - indexable.length,
  internalLinksChecked: linkCount,
  questionsChecked: qCount,
  sitemapUrls: smUrls.length,
  errors: errors.length,
  warnings: warnings.length,
};
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/site-check.json'), JSON.stringify({ ...report, errorList: errors.slice(0, 200), warningList: warnings.slice(0, 200) }, null, 2));
errors.slice(0, 60).forEach((e) => console.log('ERROR', e));
warnings.slice(0, 40).forEach((w) => console.log('warn ', w));
console.log(JSON.stringify(report));
process.exit(errors.length ? 1 : 0);
