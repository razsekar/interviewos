// InterviewOS static site build: content JSON -> pre-rendered public HTML, app data, SEO files.
// Usage: node tools/build/build.mjs   (env: SITE_URL, DIST_DIR)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createMarkdown, esc, jsonForHtml, metaDescription, plain, relRoot, readingMinutes } from './lib.mjs';
import { iconPng, ogPng, iconSvg, logoInline } from './icons.mjs';
import { wc } from '../lib/words.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE_URL = (process.env.SITE_URL || cfg.defaultSiteUrl).replace(/\/?$/, '/');
const BASE_PATH = new URL(SITE_URL).pathname;
const md = createMarkdown();

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const write = (rel, data) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};

// ---------- load content ----------
const categories = readJson('content/categories.json').sort((a, b) => a.order - b.order);
const pathsDef = readJson('content/paths.json').paths;
const catById = new Map(categories.map((c) => [c.id, c]));
const questions = [];
const qFiles = fs.readdirSync(path.join(ROOT, 'content/questions')).filter((f) => f.endsWith('.json')).sort();
const orderInCat = new Map();
for (const f of qFiles) {
  const doc = readJson('content/questions/' + f);
  if (!catById.has(doc.category)) throw new Error(`Unknown category ${doc.category} in ${f}`);
  for (const q of doc.questions) {
    if (q.draft) continue; // drafts never reach the build output
    const order = orderInCat.get(doc.category) || 0;
    orderInCat.set(doc.category, order + 1);
    const { html, headings } = md.render(q.detailed, q.diagrams || [], 'dg');
    const words = wc(q.detailed);
    questions.push({
      id: `${doc.category}/${q.slug}`,
      cat: doc.category,
      order,
      ...q,
      html,
      headings,
      words,
      indexable: words >= cfg.indexableMinDetailedWords,
    });
  }
}
const qById = new Map(questions.map((q) => [q.id, q]));
const byCat = new Map(categories.map((c) => [c.id, questions.filter((q) => q.cat === c.id)]));

// cross-category suggestions by shared tags (internal linking)
const tagIndex = new Map();
for (const q of questions) for (const t of q.tags || []) (tagIndex.get(t) || tagIndex.set(t, []).get(t)).push(q);
for (const q of questions) {
  const score = new Map();
  for (const t of q.tags || []) {
    const bucket = tagIndex.get(t);
    if (bucket.length > 40) continue; // overly generic tag
    for (const o of bucket) if (o.cat !== q.cat) score.set(o.id, (score.get(o.id) || 0) + 1);
  }
  q.also = [...score.entries()]
    .filter(([, s]) => s >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => id);
}

const stats = {
  questions: questions.length,
  categories: categories.length,
  diagrams: questions.reduce((n, q) => n + (q.diagrams?.length || 0), 0),
  bySource: Object.fromEntries(['reference-derived', 'enhanced', 'new'].map((s) => [s, questions.filter((q) => q.sourceType === s).length])),
  byDifficulty: Object.fromEntries(['beginner', 'intermediate', 'advanced'].map((s) => [s, questions.filter((q) => q.difficulty === s).length])),
  detailedWords: questions.reduce((n, q) => n + q.words, 0),
  indexable: questions.filter((q) => q.indexable).length,
};

// ---------- shared template pieces ----------
const PROV = {
  'reference-derived': { label: 'Reference-derived', text: 'Structured from private study notes and rewritten in original wording.' },
  enhanced: { label: 'Enhanced', text: 'Started from study notes, then corrected, expanded or modernised with additional explanation, examples and diagrams.' },
  new: { label: 'New', text: 'Written from scratch to fill a gap; not derived from the study notes.' },
};
const TYPE_LABEL = { conceptual: 'Conceptual', comparison: 'Comparison', scenario: 'Scenario', design: 'Design', coding: 'Coding' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const pages = []; // for sitemap + checks
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">`;
const OG_IMAGE = SITE_URL + 'assets/og-image.png';

function layout(page) {
  const { path: p, title, description, body, noindex = false, jsonld = [], ogType = 'website', abs = false, nav = null } = page;
  const R = abs ? BASE_PATH : relRoot(p);
  const u = (to) => R + to;
  const fullTitle = title.includes(cfg.name) ? title : title.length + cfg.name.length + 3 <= 66 ? `${title} | ${cfg.name}` : title;
  const canonical = SITE_URL + p;
  const navItems = [
    ['', 'Home'],
    ['categories/', 'Topics'],
    ['methodology/', 'Methodology'],
    ['about/', 'About'],
  ];
  const navHtml = navItems
    .map(([to, label]) => `<a href="${u(to)}"${nav === to ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    CSP,
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',
    noindex ? '' : `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta name="theme-color" content="${cfg.themeColor}">`,
    `<link rel="manifest" href="${u('manifest.webmanifest')}">`,
    `<link rel="icon" href="${u('icons/icon.svg')}" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="${u('icons/apple-touch-icon.png')}">`,
    noindex
      ? ''
      : [
          `<meta property="og:site_name" content="${cfg.name}">`,
          `<meta property="og:type" content="${ogType}">`,
          `<meta property="og:title" content="${esc(fullTitle)}">`,
          `<meta property="og:description" content="${esc(description)}">`,
          `<meta property="og:url" content="${esc(canonical)}">`,
          `<meta property="og:image" content="${OG_IMAGE}">`,
          '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
          `<meta property="og:image:alt" content="${cfg.name} logo: three descending bars">`,
          '<meta name="twitter:card" content="summary_large_image">',
          `<meta name="twitter:title" content="${esc(fullTitle)}">`,
          `<meta name="twitter:description" content="${esc(description)}">`,
          `<meta name="twitter:image" content="${OG_IMAGE}">`,
        ].join('\n'),
    `<link rel="stylesheet" href="${u('assets/app.css')}">`,
    `<script src="${u('assets/theme.js')}"></script>`,
    ...jsonld.map((j) => `<script type="application/ld+json">${jsonForHtml(j)}</script>`),
  ]
    .filter(Boolean)
    .join('\n');
  const foot = [
    ['about/', 'About'],
    ['methodology/', 'Methodology'],
    ['directory/', 'Site directory'],
    ['accessibility/', 'Accessibility'],
    ['privacy/', 'Privacy'],
    ['terms/', 'Terms'],
    ['contact/', 'Contact'],
  ]
    .map(([to, l]) => `<li><a href="${u(to)}">${l}</a></li>`)
    .join('');
  return `<!doctype html>
<html lang="${cfg.language}">
<head>
${head}
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand-link" href="${u('')}">${logoInline}<span>${cfg.name}</span></a>
    <nav class="nav" aria-label="Main">
      ${navHtml}
      <a class="btn btn-primary btn-sm" href="${u('app/')}">Open the app</a>
      <button type="button" id="theme-toggle" class="js-only" aria-label="Colour theme">Theme</button>
    </nav>
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <nav aria-label="Footer"><ul>${foot}</ul></nav>
    <p>${cfg.name} is a free, static study site. Your progress stays in your browser and is never uploaded. No analytics, no cookies.</p>
  </div>
</footer>
<script src="${u('assets/site.js')}" defer></script>
</body>
</html>
`;
}

function emit(page, file) {
  const html = layout(page);
  write(file || path.posix.join(page.path, 'index.html'), html);
  pages.push({ path: page.path, title: page.title, indexable: !page.noindex, kind: page.kind || 'page', file: file || page.path + 'index.html' });
}

const crumbs = (p, items) => {
  const R = relRoot(p);
  const li = items
    .map((it, i) => (i === items.length - 1 ? `<li aria-current="page">${esc(it.name)}</li>` : `<li><a href="${R + it.to}">${esc(it.name)}</a></li>`))
    .join('');
  return `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${li}</ol></nav>`;
};
const crumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE_URL + it.to })),
});
const webPageLd = (p, name, description) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name,
  description,
  url: SITE_URL + p,
  inLanguage: cfg.language,
  isPartOf: { '@type': 'WebSite', name: cfg.name, url: SITE_URL },
});

// ---------- question pages ----------
const qUrl = (q) => `questions/${q.cat}/${q.slug}/`;
const chip = (cls, t) => `<span class="chip ${cls}">${esc(t)}</span>`;

function questionPage(q) {
  const p = qUrl(q);
  const R = relRoot(p);
  const cat = catById.get(q.cat);
  const siblings = byCat.get(q.cat);
  const idx = siblings.findIndex((s) => s.id === q.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const items = [
    { name: 'Home', to: '' },
    { name: 'Topics', to: 'categories/' },
    { name: cat.title, to: `topics/${q.cat}/` },
    { name: q.title, to: p },
  ];
  const related = (q.related || []).map((s) => qById.get(`${q.cat}/${s}`)).filter(Boolean);
  const also = (q.also || []).map((id) => qById.get(id)).filter(Boolean);
  const toc =
    q.headings.length >= 3
      ? `<nav class="toc card" aria-label="On this page"><strong>In this answer</strong><ul>${q.headings.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></nav>`
      : '';
  const prov = PROV[q.sourceType];
  const quickHtml = `<p class="answer-quick">${md.inline(q.quick)}</p>`;
  const revHtml = `<p class="answer-revision">${md.inline(q.revision)}</p>`;
  const description = metaDescription(q.quick);
  const body = `
${crumbs(p, items)}
<article class="wrap prose-col section" aria-labelledby="q-title">
  <p class="eyebrow">${esc(cat.title)} · ${esc(q.topic)}</p>
  <h1 id="q-title" style="font-size:clamp(1.7rem,4vw,2.4rem);margin:0.25rem 0 0.75rem">${esc(q.title)}</h1>
  <div class="chips" aria-label="Question details">
    ${chip('chip-' + q.difficulty, cap(q.difficulty))}${chip('', TYPE_LABEL[q.type] || q.type)}${chip('chip-brand', prov.label)}${chip('', '~' + readingMinutes(q.words) + ' min read')}
  </div>
  <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;margin:1.25rem 0">
    <div class="seg js-only" id="style-seg" role="group" aria-label="Answer style">
      <button type="button" data-style="detailed" aria-pressed="true">Detailed</button>
      <button type="button" data-style="quick" aria-pressed="false">Quick Read</button>
      <button type="button" data-style="revision" aria-pressed="false">Short Revision</button>
    </div>
    <a class="btn btn-sm" href="${R}app/#/q/${q.cat}/${q.slug}">Practise this in the app</a>
  </div>
  <section class="style-section" data-style="detailed" aria-labelledby="h-detailed">
    <h2 id="h-detailed">Detailed answer</h2>
    ${toc}
    <div class="md">${q.html}</div>
  </section>
  <section class="style-section" data-style="quick" aria-labelledby="h-quick">
    <h2 id="h-quick">Quick read</h2>
    <p class="muted">About 60–100 words: what you would say in a short spoken answer.</p>
    ${quickHtml}
  </section>
  <section class="style-section" data-style="revision" aria-labelledby="h-rev">
    <h2 id="h-rev">Short revision</h2>
    <p class="muted">One or two lines to refresh the idea right before an interview.</p>
    <div class="callout">${revHtml}</div>
  </section>
  ${
    q.followUps?.length
      ? `<section class="section" aria-labelledby="h-fu"><h2 id="h-fu">Likely follow-up questions</h2><ul>${q.followUps.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></section>`
      : ''
  }
  ${
    related.length
      ? `<section class="section" aria-labelledby="h-rel"><h2 id="h-rel">Related questions</h2><ul>${related.map((r) => `<li><a href="${R + qUrl(r)}">${esc(r.title)}</a></li>`).join('')}</ul></section>`
      : ''
  }
  ${
    also.length
      ? `<section class="section" aria-labelledby="h-also"><h2 id="h-also">Also see in other topics</h2><ul>${also.map((r) => `<li><a href="${R + qUrl(r)}">${esc(r.title)}</a> <span class="muted">(${esc(catById.get(r.cat).short)})</span></li>`).join('')}</ul></section>`
      : ''
  }
  <aside class="card section" aria-labelledby="h-about" style="margin-top:1.5rem">
    <h2 id="h-about" style="font-size:1.05rem">About this answer</h2>
    <p><strong>${prov.label}.</strong> ${prov.text} Technical details change; check official documentation before relying on a specific product limit, price or version. See the <a href="${R}methodology/">methodology</a>.</p>
  </aside>
  <nav class="wrap" aria-label="Previous and next question" style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;padding:0;margin-top:1rem">
    ${prev ? `<a class="btn" href="${R + qUrl(prev)}" rel="prev">← ${esc(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a class="btn" href="${R + qUrl(next)}" rel="next">${esc(next.title)} →</a>` : ''}
  </nav>
</article>`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: q.title.slice(0, 110),
      description,
      url: SITE_URL + p,
      inLanguage: cfg.language,
      articleSection: cat.title,
      keywords: (q.tags || []).join(', '),
      proficiencyLevel: cap(q.difficulty),
      isPartOf: { '@type': 'WebSite', name: cfg.name, url: SITE_URL },
      publisher: { '@type': 'Organization', name: cfg.name, url: SITE_URL },
      mainEntityOfPage: SITE_URL + p,
    },
    crumbLd(items),
  ];
  emit({ path: p, title: q.title, description, body, jsonld: ld, ogType: 'article', noindex: !q.indexable, nav: 'categories/', kind: 'question' });
}

// ---------- topic guide + category index ----------
function topicGuide(cat) {
  const p = `topics/${cat.id}/`;
  const R = relRoot(p);
  const qs = byCat.get(cat.id);
  const groups = [];
  for (const q of qs) {
    let g = groups.find((x) => x.topic === q.topic);
    if (!g) groups.push((g = { topic: q.topic, items: [] }));
    g.items.push(q);
  }
  const words = qs.reduce((n, q) => n + q.words, 0);
  const diff = ['beginner', 'intermediate', 'advanced'].map((d) => `${qs.filter((q) => q.difficulty === d).length} ${d}`).join(', ');
  const inPaths = pathsDef.filter((pp) => pp.categories.includes(cat.id));
  const items = [
    { name: 'Home', to: '' },
    { name: 'Topics', to: 'categories/' },
    { name: cat.title, to: p },
  ];
  const description = metaDescription(`${cat.title} interview guide: ${qs.length} questions with detailed, quick and short-revision answers. ${cat.description}`, 160);
  const toc = groups.map((g, i) => `<li><a href="#t-${i}">${esc(g.topic)}</a> <span class="muted">(${g.items.length})</span></li>`).join('');
  const body = `
${crumbs(p, items)}
<div class="wrap prose-col section">
  <p class="eyebrow">Topic guide</p>
  <h1 style="font-size:clamp(1.8rem,4vw,2.5rem);margin:0.25rem 0 0.75rem">${esc(cat.title)} interview questions</h1>
  <p class="lead" style="font-size:1.15rem">${esc(cat.description)}</p>
  <p class="muted">${qs.length} questions · ${diff} · about ${readingMinutes(words)} minutes of detailed reading. Each question has a detailed answer, a quick read and a short revision.</p>
  <p><a class="btn btn-primary" href="${R}app/#/study?cat=${cat.id}">Study this topic in the app</a></p>
  <nav class="card" aria-label="Sections in this guide"><strong>Sections</strong><ul style="margin:0.5rem 0 0;padding-left:1.2rem;list-style:disc">${toc}</ul></nav>
  ${groups
    .map(
      (g, i) => `<section class="section" aria-labelledby="t-${i}">
    <h2 id="t-${i}">${esc(g.topic)}</h2>
    ${g.items
      .map(
        (q) => `<article class="card" style="margin-bottom:0.9rem">
      <h3><a href="${R + qUrl(q)}">${esc(q.title)}</a></h3>
      <div class="chips" style="margin-bottom:0.5rem">${chip('chip-' + q.difficulty, cap(q.difficulty))}${chip('', TYPE_LABEL[q.type] || q.type)}</div>
      <p style="margin:0">${md.inline(q.quick)}</p>
    </article>`,
      )
      .join('')}
  </section>`,
    )
    .join('')}
  ${
    inPaths.length
      ? `<section class="section"><h2>Learning paths that include this topic</h2><p>Inside the <a href="${R}app/#/paths">app</a>: ${inPaths.map((x) => esc(x.title)).join(', ')}.</p></section>`
      : ''
  }
</div>`;
  emit({ path: p, title: `${cat.title} Interview Questions and Answers`, description, body, jsonld: [webPageLd(p, `${cat.title} interview guide`, description), crumbLd(items)], nav: 'categories/', kind: 'guide' });
}

function categoriesIndex() {
  const p = 'categories/';
  const R = relRoot(p);
  const items = [
    { name: 'Home', to: '' },
    { name: 'Topics', to: p },
  ];
  const description = `All ${categories.length} topic guides (${questions.length} questions): React, micro frontends, REST APIs, AWS, MACH, AEM, Core Web Vitals, CDN, API management, accessibility, SEO and analytics.`;
  const body = `
${crumbs(p, items)}
<div class="wrap section">
  <h1 style="font-size:clamp(1.8rem,4vw,2.5rem);margin:0.25rem 0 0.75rem">Topic guides</h1>
  <p class="lead muted" style="max-width:44rem">Each guide groups related questions by topic. Every question has three answer styles: Detailed, Quick Read and Short Revision.</p>
  <div class="grid-cards" style="margin-top:1.5rem">
  ${categories
    .map((c) => {
      const qs = byCat.get(c.id);
      const topics = [...new Set(qs.map((q) => q.topic))];
      return `<a class="card" href="${R}topics/${c.id}/"><h2>${esc(c.title)}</h2><p class="muted" style="margin:0 0 0.5rem">${esc(c.short)}</p><p style="margin:0"><strong>${qs.length}</strong> questions · ${topics.length} topics</p></a>`;
    })
    .join('')}
  </div>
</div>`;
  emit({ path: p, title: 'Interview Topic Guides', description, body, jsonld: [webPageLd(p, 'Interview topic guides', description), crumbLd(items)], nav: 'categories/', kind: 'index' });
}

// ---------- home ----------
function home() {
  const p = '';
  const R = './';
  const demo = qById.get('mach-architecture/what-is-mach-architecture') || questions[0];
  const description = cfg.description;
  const body = `
<section class="hero wrap">
  <p class="eyebrow">Free · offline-capable · no sign-up</p>
  <h1>Prepare for architecture interviews the way you will be asked.</h1>
  <p class="lead">${questions.length} questions across ${categories.length} topics, each answered three ways: a detailed explanation with diagrams, a quick spoken answer and a one-line revision. Practise with spaced repetition that never leaves your browser.</p>
  <p style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1.5rem">
    <a class="btn btn-primary" href="${R}app/">Open the study app</a>
    <a class="btn" href="${R}categories/">Browse topic guides</a>
  </p>
</section>

<section class="wrap section" aria-labelledby="h-styles">
  <h2 id="h-styles">One question, three ways to learn it</h2>
  <p class="muted" style="max-width:46rem">Pick the depth you need today. All three share one progress record, so revising a one-liner counts toward the same question.</p>
  <div class="grid-cards" style="margin-top:1rem">
    <article class="card"><h3>Detailed</h3><p class="muted" style="margin:0">Deep explanation with tables, code and diagrams, for understanding.</p></article>
    <article class="card"><h3>Quick Read</h3><p style="margin:0">${md.inline(demo.quick)}</p></article>
    <article class="card"><h3>Short Revision</h3><p style="margin:0;font-weight:600">${md.inline(demo.revision)}</p></article>
  </div>
  <p style="margin-top:0.75rem" class="muted">Example: <a href="${R}${qUrl(demo)}">${esc(demo.title)}</a>.</p>
</section>

<section class="wrap section" aria-labelledby="h-topics">
  <h2 id="h-topics">Topics</h2>
  <div class="grid-cards">
  ${categories
    .map((c) => `<a class="card" href="${R}topics/${c.id}/"><h3>${esc(c.title)}</h3><p class="muted" style="margin:0 0 0.4rem">${esc(c.short)}</p><p style="margin:0"><strong>${byCat.get(c.id).length}</strong> questions</p></a>`)
    .join('')}
  </div>
</section>

<section class="wrap section" aria-labelledby="h-how">
  <h2 id="h-how">How it works</h2>
  <div class="grid-cards">
    <div class="card"><h3>1. Learn</h3><p style="margin:0">Follow a learning path or pick a topic. Read the detailed answer, then the quick read.</p></div>
    <div class="card"><h3>2. Practise</h3><p style="margin:0">Study one question at a time: reveal, rate yourself Again, Hard, Good or Easy, use keyboard shortcuts.</p></div>
    <div class="card"><h3>3. Revise</h3><p style="margin:0">Spaced repetition schedules what is due. Progress separates seen, practised and mastered.</p></div>
    <div class="card"><h3>4. Simulate</h3><p style="margin:0">Interview simulation hides answers until you have tried, then asks you to review honestly.</p></div>
  </div>
</section>

<section class="wrap section" aria-labelledby="h-priv">
  <h2 id="h-priv">Private by design</h2>
  <p style="max-width:46rem">Everything runs in your browser. Progress, bookmarks and settings are stored on your device with IndexedDB and LocalStorage. There is no account, no server and no analytics. Export a JSON backup whenever you like. Read the <a href="${R}privacy/">privacy page</a> and the <a href="${R}methodology/">methodology</a> to see how the content is made and what its limits are.</p>
</section>`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, url: SITE_URL, description, inLanguage: cfg.language },
    webPageLd(p, cfg.name + ': ' + cfg.tagline, description),
  ];
  emit({ path: p, title: `${cfg.name}: ${cfg.tagline}`, description, body, jsonld: ld, nav: '', kind: 'home' }, 'index.html');
}

// ---------- static informational pages ----------
function infoPage(p, title, description, inner, extra = {}) {
  const items = [
    { name: 'Home', to: '' },
    { name: title, to: p },
  ];
  const body = `${crumbs(p, items)}<div class="wrap prose-col section"><h1 style="font-size:clamp(1.8rem,4vw,2.4rem);margin:0.25rem 0 1rem">${esc(title)}</h1><div class="md">${inner}</div></div>`;
  emit({ path: p, title, description, body, jsonld: [webPageLd(p, title, description), crumbLd(items)], nav: p, ...extra });
}

function infoPages() {
  const R1 = '../';
  infoPage(
    'about/',
    'About InterviewOS',
    'What InterviewOS is, who it is for, and how it is built: a free static site with a private, offline-capable study app.',
    `<p>${cfg.name} is a personal interview learning system that is also published as a free technical education site. It covers architecture topics that come up in web and solution architect interviews: React, micro frontends, REST APIs, AWS, MACH and composable architecture, headless CMS and AEM, Core Web Vitals, CDN and caching, API management, accessibility, technical SEO, and customer-data and experimentation concepts.</p>
<h2>What you get</h2>
<ul><li>${questions.length} questions in ${categories.length} topic guides, each with Detailed, Quick Read and Short Revision answers.</li><li>${stats.diagrams} diagrams, drawn as accessible inline SVG with text descriptions.</li><li>A study app with spaced repetition, simulation, audio and progress tracking that works offline.</li></ul>
<h2>How it is built</h2>
<p>It is a static site: pre-rendered HTML pages for reading and searching, plus a small client-side app written with vanilla JavaScript modules. There is no backend, no database and no account. See the <a href="${R1}methodology/">methodology</a> for how the content is produced and checked, and the <a href="${R1}privacy/">privacy page</a> for what is and is not stored.</p>
<h2>Honest limits</h2>
<p>This is a study aid, not an authority. Content was drafted with AI assistance from private reference notes, rewritten in original wording and checked by automated validators for structure. It has not been audited by named independent experts. Verify specific facts, limits and prices against official documentation.</p>
<p>The source repository is at <a href="${cfg.repoUrl}">${esc(cfg.repoUrl)}</a>.</p>`,
  );

  infoPage(
    'methodology/',
    'Methodology',
    'How InterviewOS content is created, labelled and validated, how the three answer styles work, and how progress and mastery are calculated.',
    `<h2>Where the content comes from</h2>
<p>Questions were structured from private study notes (PDF documents kept on the author's machine and never published). The build pipeline extracts the text locally, and every question is rewritten in original wording. The notes were specific to one interview, so the public content is generalised: no employer names, no personal positioning.</p>
<h2>Provenance labels</h2>
<table><thead><tr><th>Label</th><th>Meaning</th><th>Questions</th></tr></thead><tbody>
${Object.entries(PROV)
  .map(([k, v]) => `<tr><td>${v.label}</td><td>${v.text}</td><td>${stats.bySource[k]}</td></tr>`)
  .join('')}
</tbody></table>
<h2>Three answer styles</h2>
<ul><li><strong>Detailed</strong>: a full explanation with tables, code and diagrams. This is the default.</li><li><strong>Quick Read</strong>: roughly 60 to 100 words you could say aloud.</li><li><strong>Short Revision</strong>: one or two lines, 15 to 30 words.</li></ul>
<p>The three styles share one question id and one progress record. The build fails if a style is missing or outside its length range.</p>
<h2>Validation</h2>
<p>Every build runs validators for schema, duplicate slugs, answer length, diagram integrity (node and edge references, alt text), code-fence balance, and banned personal-positioning phrases. A separate site check verifies internal links, anchors, titles, descriptions, canonical URLs, sitemap coverage, orphan pages and image alt text. Automated checks cannot prove technical accuracy.</p>
<h2>Review status</h2>
<p>No independent subject-matter expert has reviewed this content. It was written with AI assistance. Treat it as a structured starting point and confirm important details with official documentation. Corrections are welcome through the <a href="${cfg.issuesUrl}">issue tracker</a>.</p>
<h2>How progress is calculated</h2>
<ul><li><strong>Seen</strong>: you revealed or read the answer at least once.</li><li><strong>Practised</strong>: you rated yourself at least once (Again, Hard, Good or Easy).</li><li><strong>Mastered</strong>: at least three reviews, your last two ratings were Good or Easy, and the scheduled interval has reached the mastery threshold (14 days by default).</li></ul>
<p>Ratings schedule the next review on a configurable ladder of intervals (default 1, 3, 7, 14, 30, 60, 120 days). Again resets the question to a same-day retry, Hard repeats the current step, Good advances one step and Easy advances two. These are self-assessments: the app measures recall confidence, not knowledge, and says so.</p>
<h2>Current numbers</h2>
<p>${stats.questions} questions, ${stats.diagrams} diagrams, ${stats.indexable} question pages offered to search engines (the rest are kept out of the index until they are expanded).</p>`,
  );

  infoPage(
    'privacy/',
    'Privacy',
    'InterviewOS has no accounts, analytics, cookies or server-side storage. Progress stays in your browser; here is exactly what is stored.',
    `<p>${cfg.name} collects no personal data. There is no account, no analytics, no advertising, no cookies and no third-party scripts, fonts or embeds.</p>
<h2>What is stored on your device</h2>
<ul><li><strong>IndexedDB</strong>: progress per question, review history, bookmarks, study sessions and goals.</li><li><strong>LocalStorage</strong>: preferences only (theme, answer style, speech settings, scheduling intervals).</li><li><strong>Cache Storage</strong>: copies of the site so it works offline.</li></ul>
<p>None of this is sent anywhere. Clearing site data in your browser removes it. Use the backup export in Settings to keep a copy.</p>
<h2>Hosting logs</h2>
<p>The site is served by a static host (GitHub Pages by default). The host may keep ordinary access logs such as IP addresses under its own privacy policy. ${cfg.name} does not receive or process them.</p>
<h2>Audio</h2>
<p>Read-aloud uses your browser's built-in speech synthesis. Depending on the browser and voice, some browsers may use an online voice service; choose a local voice if that matters to you.</p>
<h2>Contact</h2>
<p>Questions about privacy can be raised through the <a href="${cfg.issuesUrl}">issue tracker</a>.</p>`,
  );

  infoPage(
    'terms/',
    'Terms of use',
    'Terms for using the free InterviewOS study site: educational use, no warranty, and how content may be used.',
    `<p>By using ${cfg.name} you agree to these terms.</p>
<h2>Educational use</h2>
<p>The content is general educational material for interview preparation. It is not professional, legal or security advice and is provided as is, without warranty of any kind. Technical products and standards change; verify details with official sources.</p>
<h2>No guarantees</h2>
<p>Using this site does not guarantee any interview or job outcome. Progress statistics are self-assessments.</p>
<h2>Your data</h2>
<p>Your progress is yours and stays on your device. You are responsible for backing it up.</p>
<h2>Content and code</h2>
<p>Unless the repository states otherwise, all rights are reserved by the author. Please link to pages rather than copying them wholesale. Trademarks mentioned (for example AWS, Adobe Experience Manager, Apigee, MuleSoft, React) belong to their owners; their use here is descriptive and does not imply endorsement.</p>
<h2>Changes</h2>
<p>These terms may change; the current version is always on this page.</p>`,
  );

  infoPage(
    'accessibility/',
    'Accessibility statement',
    'InterviewOS targets WCAG 2.2 level AA. This statement lists what has been done, what has been checked, and known limitations.',
    `<p>${cfg.name} is designed to meet <a href="https://www.w3.org/TR/WCAG22/">WCAG 2.2</a> level AA. This is a goal and a design practice, not a certification: the site has not had an independent accessibility audit.</p>
<h2>What is in place</h2>
<ul><li>Semantic HTML landmarks, a skip link, and a logical heading order.</li><li>Full keyboard operation, visible focus indicators, and focus that is not hidden behind sticky content. Interactive targets are at least 40 by 40 CSS pixels.</li><li>Colour pairs chosen for at least 4.5:1 contrast for text and 3:1 for interface components, in both light and dark themes.</li><li>Dark and light themes that follow your system setting and can be overridden.</li><li>Reduced-motion support: animations are removed when your system asks.</li><li>Diagrams are inline SVG with a title and long description, and are never the only way the information is given.</li><li>Tables and code blocks scroll inside focusable regions so content reflows at narrow widths and 400% zoom.</li><li>Study-session changes (reveal, rating, timers, errors) are announced through live regions.</li></ul>
<h2>What has been checked</h2>
<p>Automated build checks cover document language, titles, landmarks, heading order, link text, form labels, button names, image alt text and SVG titles. Interactive behaviour was exercised in a real browser (see the validation report in the repository). Screen reader testing across NVDA, JAWS and VoiceOver has not been performed.</p>
<h2>Known limitations</h2>
<ul><li>Read-aloud depends on voices installed in your browser and operating system.</li><li>Large inline diagrams may need horizontal scrolling on narrow screens; they are focusable and scrollable by keyboard.</li><li>Some answers contain code samples that use technical terms and abbreviations without expansion.</li></ul>
<h2>Feedback</h2>
<p>If you hit a barrier, please open an issue at <a href="${cfg.issuesUrl}">${esc(cfg.issuesUrl)}</a> and describe the page, browser and assistive technology.</p>`,
  );

  infoPage(
    'contact/',
    'Contact',
    'How to report errors, accessibility barriers or content suggestions for InterviewOS. There is no form or email: use the public issue tracker.',
    `<p>${cfg.name} is a static site with no backend, so there is no contact form or mailbox. The way to reach the author is the public issue tracker:</p>
<p><a class="btn btn-primary" href="${cfg.issuesUrl}">Open the issue tracker</a></p>
<h2>Useful reports</h2>
<ul><li><strong>Content errors</strong>: link the question page and say what is wrong and what a correct source says.</li><li><strong>Accessibility barriers</strong>: describe the page, browser and assistive technology.</li><li><strong>Bugs in the app</strong>: include your browser, whether you installed the app, and the steps to reproduce.</li></ul>
<p>Please do not post personal data or exported progress backups in public issues.</p>`,
  );
}

function directoryPage() {
  const p = 'directory/';
  const R = relRoot(p);
  const items = [
    { name: 'Home', to: '' },
    { name: 'Site directory', to: p },
  ];
  const description = `A plain HTML directory of every page on ${cfg.name}: guides, ${questions.length} question pages and information pages.`;
  const body = `${crumbs(p, items)}<div class="wrap section"><h1 style="font-size:clamp(1.8rem,4vw,2.4rem);margin:0.25rem 0 1rem">Site directory</h1>
<h2>Main pages</h2>
<ul style="padding-left:1.2rem;list-style:disc"><li><a href="${R}">Home</a></li><li><a href="${R}categories/">Topic guides</a></li><li><a href="${R}app/">Study app</a></li>${['about', 'methodology', 'privacy', 'terms', 'accessibility', 'contact'].map((x) => `<li><a href="${R}${x}/">${cap(x)}</a></li>`).join('')}</ul>
${categories
  .map(
    (c) => `<h2><a href="${R}topics/${c.id}/">${esc(c.title)}</a></h2><ul style="padding-left:1.2rem;list-style:disc">${byCat
      .get(c.id)
      .map((q) => `<li><a href="${R + qUrl(q)}">${esc(q.title)}</a></li>`)
      .join('')}</ul>`,
  )
  .join('')}
</div>`;
  emit({ path: p, title: 'Site directory', description, body, jsonld: [webPageLd(p, 'Site directory', description), crumbLd(items)], nav: '', kind: 'directory' });
}

function utilityPages() {
  const notFound = `<div class="wrap prose-col section"><h1>Page not found</h1><p>That page does not exist or has moved. Try the <a href="${BASE_PATH}directory/">site directory</a> or <a href="${BASE_PATH}categories/">browse topic guides</a>.</p></div>`;
  const h = (p, title, body, file) => {
    const html = layout({ path: p, title, description: title, body, noindex: true, abs: true });
    write(file, html);
  };
  h('404.html', 'Page not found', notFound, '404.html');
  h(
    'offline.html',
    'You are offline',
    `<div class="wrap prose-col section"><h1>You are offline</h1><p>This page was not saved for offline use. Pages you have already visited and the study app are available offline.</p><p><a class="btn btn-primary" href="${BASE_PATH}app/">Open the study app</a></p></div>`,
    'offline.html',
  );
}

// ---------- app shell page ----------
function appShell() {
  const R = '../';
  const nav = [
    ['#/', 'Home'],
    ['#/paths', 'Paths'],
    ['#/bank', 'Question Bank'],
    ['#/study', 'Study'],
    ['#/revision', 'Revision'],
    ['#/progress', 'Progress'],
    ['#/settings', 'Settings'],
  ]
    .map(([h, l]) => `<a href="${h}" data-route="${h}">${l}</a>`)
    .join('');
  const html = `<!doctype html>
<html lang="${cfg.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${CSP}
<title>${cfg.name} study app</title>
<meta name="description" content="Private study app: spaced repetition, simulation and progress. Runs entirely in your browser.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${cfg.themeColor}">
<link rel="manifest" href="${R}manifest.webmanifest">
<link rel="icon" href="${R}icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${R}icons/apple-touch-icon.png">
<link rel="stylesheet" href="${R}assets/app.css">
<script src="${R}assets/theme.js"></script>
</head>
<body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand-link" href="#/">${logoInline}<span>${cfg.name}</span></a>
    <nav class="app-nav" aria-label="App" id="app-nav">${nav}</nav>
    <div class="nav" style="margin-left:auto">
      <span id="net-status" class="chip" hidden>Offline</span>
      <a href="${R}">Public site</a>
    </div>
  </div>
</header>
<div id="update-banner" class="wrap" hidden></div>
<main id="main" tabindex="-1" class="wrap section">
  <noscript><p>The study app needs JavaScript. The <a href="${R}categories/">topic guides</a> work without it.</p></noscript>
  <p id="app-loading" class="muted">Loading…</p>
</main>
<div class="toast-region" id="toasts" role="status" aria-live="polite"></div>
<div class="sr-only" id="announcer" aria-live="polite" aria-atomic="true"></div>
<script type="module" src="js/main.js"></script>
</body>
</html>
`;
  write('app/index.html', html);
  pages.push({ path: 'app/', title: 'App', indexable: false, kind: 'app', file: 'app/index.html' });
}

// ---------- data for the app ----------
function emitData() {
  const buildId = crypto
    .createHash('sha1')
    .update(JSON.stringify(questions.map((q) => [q.id, q.quick, q.revision, q.detailed, q.title])))
    .digest('hex')
    .slice(0, 10);
  const manifestData = {
    format: 'interviewos-content',
    buildId,
    siteUrl: SITE_URL,
    categories: categories.map((c) => ({
      id: c.id,
      title: c.title,
      short: c.short,
      description: c.description,
      count: byCat.get(c.id).length,
      topics: [...new Set(byCat.get(c.id).map((q) => q.topic))],
    })),
    paths: pathsDef.map((pp) => ({
      ...pp,
      ids: pp.categories.flatMap((cid) => byCat.get(cid).filter((q) => !pp.types || pp.types.includes(q.type)).map((q) => q.id)),
    })),
    total: questions.length,
  };
  write('data/index.json', JSON.stringify(manifestData));
  for (const c of categories) {
    const list = byCat.get(c.id).map((q) => ({
      id: q.id,
      slug: q.slug,
      cat: q.cat,
      order: q.order,
      title: q.title,
      topic: q.topic,
      difficulty: q.difficulty,
      type: q.type,
      tags: q.tags || [],
      sourceType: q.sourceType,
      quick: q.quick,
      revision: q.revision,
      words: q.words,
      diagrams: q.diagrams?.length || 0,
      related: q.related || [],
      followUps: q.followUps || [],
      page: q.indexable ? qUrl(q) : null,
    }));
    write(`data/q/${c.id}.json`, JSON.stringify(list));
  }
  for (const q of questions) write(`data/d/${q.cat}/${q.slug}.html`, q.html);
  const search = questions.map((q) => [
    q.id,
    q.title,
    q.topic,
    (q.tags || []).join(' '),
    plain(q.quick + ' ' + q.revision + ' ' + q.headings.map((h) => h.text).join(' ')).toLowerCase(),
  ]);
  write('data/search.json', JSON.stringify({ buildId, docs: search }));
  return buildId;
}

// ---------- robots / sitemap / manifest / assets ----------
function seoFiles() {
  const urls = pages.filter((p) => p.indexable && p.kind !== 'app').map((p) => p.path);
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(SITE_URL + u)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  write('sitemap.xml', sm);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  return urls.length;
}

function assets() {
  fs.cpSync(path.join(ROOT, 'src/public'), path.join(DIST, 'assets'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'src/app/js'), path.join(DIST, 'app/js'), { recursive: true });
  write('icons/icon.svg', iconSvg);
  write('icons/icon-192.png', iconPng(192));
  write('icons/icon-512.png', iconPng(512));
  write('icons/maskable-512.png', iconPng(512, { maskable: true }));
  write('icons/apple-touch-icon.png', iconPng(180, { maskable: true }));
  write('assets/og-image.png', ogPng());
  write(
    'manifest.webmanifest',
    JSON.stringify(
      {
        name: cfg.name,
        short_name: cfg.name,
        description: cfg.description,
        id: './app/',
        start_url: 'app/',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fafaf9',
        theme_color: cfg.themeColor,
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Revision', short_name: 'Revision', url: 'app/#/revision' },
          { name: 'Question Bank', short_name: 'Bank', url: 'app/#/bank' },
        ],
      },
      null,
      2,
    ),
  );
}

// ---------- run ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
assets();
home();
categoriesIndex();
for (const c of categories) topicGuide(c);
for (const q of questions) questionPage(q);
infoPages();
directoryPage();
utilityPages();
appShell();
const buildId = emitData();
const sitemapUrls = seoFiles();

const report = {
  siteUrl: SITE_URL,
  buildId,
  pages: pages.length,
  sitemapUrls,
  noindexQuestionPages: questions.filter((q) => !q.indexable).map((q) => q.id),
  ...stats,
};
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/build.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(ROOT, 'reports/pages.json'), JSON.stringify(pages, null, 1));
console.log(`built ${pages.length} pages, ${questions.length} questions, ${stats.diagrams} diagrams -> ${path.relative(ROOT, DIST)} (buildId ${buildId}, siteUrl ${SITE_URL})`);
