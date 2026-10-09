# InterviewOS

A free, static-first interview learning system and public technical education site. No backend, no database, no account, no analytics.

- **465 questions in 13 topics** (React, micro frontends, REST APIs, AWS, MACH, headless CMS and AEM, content APIs, Core Web Vitals, CDN and caching, API management, accessibility, technical SEO, CDP/analytics/experimentation), 165 diagrams.
- **Three answer styles per question**, one id and one progress record: **Detailed** (default), **Quick Read** (about 60 to 100 words), **Short Revision** (one or two lines).
- **Public site**: pre-rendered HTML for the home page, 13 topic guides, 465 question pages, methodology, privacy, terms, accessibility statement, contact, a site directory, 404.
- **Study app** (`/app/`, installable PWA, works offline): dashboard, learning paths, question bank with search and filters, study modes (sequential, random, rapid-fire, interview simulation, revision, audio, bookmarked), revision center, progress, settings, backup and restore.

## Quick start

```bash
npm install
npm run build        # validate content, build dist/, compile CSS, generate the service worker
npm run check        # link, anchor, orphan, SEO, JSON-LD, sitemap and leak checks on dist/
npm test             # unit + integration tests (node:test)
npm run test:e2e     # browser tests in your installed Chrome (puppeteer-core + axe-core)
npm run serve        # http://localhost:4173/interviewos/  (mounted at the production sub-path on purpose)
```

Requires Node 20+. The E2E tests need Google Chrome or Chromium (set `CHROME_PATH` if it is not in a standard location); they are skipped, not faked, when none is found.

## Configuration

| What | Where |
|---|---|
| Site name, description, default URL, repo links | `site.config.json` |
| Production URL (canonicals, sitemap, Open Graph) | env `SITE_URL`, default `defaultSiteUrl` in `site.config.json` |
| Learning paths | `content/paths.json` |
| Categories | `content/categories.json` |
| Private terms that must never be published | env `BANNED_TERMS` or git-ignored `sources/banned-terms.txt` |

## Documents

- [ARCHITECTURE](docs/ARCHITECTURE.md): how the build, data, app and service worker fit together.
- [CONTENT_PIPELINE](docs/CONTENT_PIPELINE.md): local PDF extraction, authoring, provenance, validation. Source PDFs are never published.
- [CONTENT_SCHEMA](docs/CONTENT_SCHEMA.md) and [AUTHORING_BRIEF](docs/AUTHORING_BRIEF.md): the question format and the rules authors follow.
- [SEO](docs/SEO.md): URL design, metadata, structured data, sitemap, Search Console steps, what is and is not claimed.
- [DEPLOYMENT](docs/DEPLOYMENT.md): GitHub Pages (preferred) and Vercel static.
- [DATA_BACKUP](docs/DATA_BACKUP.md): what is stored locally, backup format, merge and replace rules.
- [ACCESSIBILITY_NOTES](docs/ACCESSIBILITY_NOTES.md): contrast ratios, keyboard model, what was and was not tested.
- [reports/VALIDATION_REPORT.md](reports/VALIDATION_REPORT.md): what was actually run and what it found. [reports/CONTENT_REPORT.md](reports/CONTENT_REPORT.md): provenance and coverage.

## Privacy and security in one paragraph

Progress, bookmarks, sessions and goals live in IndexedDB on the learner's device; preferences live in LocalStorage. Nothing is uploaded. Pages ship a strict Content-Security-Policy (`script-src 'self'`, no inline scripts, no third-party hosts). Imported backups are validated field by field before anything is written. Markdown content is rendered with raw HTML escaped and non-http(s) links removed. The build and the site checker fail if a PDF, a source file name, a configured private term or something that looks like a secret reaches `dist/`.

## Honest limitations

- **Content has not been reviewed by an independent expert.** It was drafted with AI assistance from private notes, rewritten in original wording and checked by automated validators for structure, not for technical truth. The site says so on the methodology page. Product facts (AEM, Apigee, MuleSoft, AWS service behaviour) change; verify against official documentation.
- **Search visibility is not verified.** Nothing here claims the site is indexed or ranks. Submit the sitemap in Search Console and check coverage yourself (see [SEO](docs/SEO.md)). On GitHub Pages *project* sites, `robots.txt` is only honoured at the domain root, which a project site does not control; the sitemap must be submitted explicitly.
- **Core Web Vitals are lab-measured only** (one local Chrome run, no throttling). No field data exists yet.
- **Accessibility is tested with axe-core on 13 pages in both themes and by keyboard-driven E2E tests, not with real screen readers** (NVDA, JAWS, VoiceOver) and not by an external auditor.
- **Read-aloud quality depends on the browser and installed voices.** Some browsers use online voices.
- **Spaced repetition is a simple ladder, not FSRS or SM-2.** It is explainable and configurable, but it does not model per-question difficulty.
- **Offline detail answers**: the app shell and question lists are precached; detailed answers are cached as you open them, or all at once with *Download everything for offline use* in Settings. A new app version clears the old runtime cache, so re-download after an update if you want everything offline.
- **Storage can be cleared by the browser** (low disk, "clear site data"). Export backups regularly; Settings can ask the browser to keep the data but cannot guarantee it.
- **No cross-device sync.** Use backup export and import.
- **Code samples inside answers have not been executed.** They are illustrative.
- **Question titles over about 60 characters will be truncated or rewritten in search results.** 70 pages have titles that long.
- **The 404 page cannot use relative links** (it is served at arbitrary depths) so it is built with the base path of `SITE_URL`.
