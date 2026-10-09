# Architecture

```
content/ (JSON)            tools/build/build.mjs               dist/ (static files only)
  categories.json   ──┐      marked → HTML (raw HTML escaped)     index.html, topics/, questions/, about/ ...
  paths.json        ──┼──►   tools/lib/diagram.mjs → inline SVG   app/index.html + app/js/*.js
  questions/*.json  ──┘      page templates + SEO + JSON-LD        data/index.json, data/q/<cat>.json,
                             data/ files, sitemap, robots, icons    data/d/<cat>/<slug>.html, data/search.json
src/styles → tailwindcss CLI → assets/app.css                      sw.js (generated), manifest.webmanifest
src/sw.js  → post-build.mjs  → dist/sw.js (precache list + build id)
```

## Build (Node, local only)

`npm run build` = validate content → `tools/build/build.mjs` → Tailwind CLI → `tools/build/post-build.mjs`.

- **Content in, files out.** The build reads `content/**` and writes only to `dist/`. Draft questions (`"draft": true`) are skipped everywhere.
- **Markdown** is rendered with `marked`, with a custom renderer: raw HTML is escaped, only `http(s)`, `mailto`, hash and relative links survive, images are never emitted, tables and code blocks get focusable scroll containers, headings get stable ids.
- **Diagrams** are JSON (`nodes`, `edges`, `direction`) rendered to inline SVG at build time by a small layered-layout engine (`tools/lib/diagram.mjs`): longest-path layering with cycle breaking, barycentre ordering, Bézier edges. Colours are CSS variables so diagrams follow the theme. Every diagram has a `<title>`, a `<desc>` (the authored alt text) and a visible caption.
- **Pages** use relative URLs computed from each page's depth, so the same output works at a domain root or any sub-path. Only 404 and offline pages use the base path (they are served at arbitrary depths).
- **Thin pages**: question pages with fewer than `indexableMinDetailedWords` (200) words of detailed answer are built (so the app and directory can link to them) but get `noindex` and stay out of the sitemap.

## Routing

- **Public site**: real static paths (`/topics/react/`, `/questions/react/what-is-react/`).
- **App**: one HTML file, hash routes (`#/bank?q=cache`). Hash routing needs no server rewrites, works on any static host and keeps app state out of crawlers' reach. `main.js` lazy-loads one view module per route.

## Data in the browser

| Store | Where | What |
|---|---|---|
| Preferences | LocalStorage `interviewos:prefs` | theme, answer style, speech, scheduling ladder, thresholds |
| progress | IndexedDB | one record per question id: exposures, reviews, lapses, stage, interval, due, recent ratings |
| reviews | IndexedDB | append-only history (qid, ts, rating, mode, style) |
| bookmarks, sessions, goals | IndexedDB | saved after each action so sessions resume |

`repo.js` keeps an in-memory cache and writes through, so views render synchronously. If IndexedDB is unavailable the app falls back to memory and shows a visible warning that progress will not survive a reload.

## Learning logic (all pure modules, unit-tested)

- `srs.js`: ladder scheduler (Again → retry in minutes, Hard → repeat step, Good → +1 step, Easy → +2). Status is derived: new, seen (exposure), learning (practised), mastered (3+ reviews, last two Good/Easy, interval ≥ threshold).
- `stats.js`: summaries, streaks, forecast, recall confidence over 30 days.
- `scope.js`, `session.js`: turning a scope (category, path, due, weak, bookmarks, ids) into a queue for each study mode.
- `search.js`: AND-token search with field weighting over a lazily fetched index.
- `backup-core.js`: build, validate and merge backups.

## Offline and updates

`sw.js` is generated with a build hash. It precaches the shell, CSS, scripts, question lists and search index; caches detailed answers and visited pages at runtime; falls back to `offline.html`. A new service worker waits until the user chooses **Reload to update**, so a study session is never interrupted. Old caches are deleted on activation.

## Security model

- CSP meta tag on every page: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. No third-party origins. (`unsafe-inline` is for style attributes only; there is no inline script.) A meta CSP cannot set `frame-ancestors`; use response headers on a host that supports them.
- Everything dynamic in the app is escaped before insertion; the only HTML inserted as-is is build output.
- Imported backups are untrusted: strict per-field validation, size limit, whitelisted preference keys, all-or-nothing write in one IndexedDB transaction.
- No secrets exist in client code. The build fails on token-like strings in `dist/`.
