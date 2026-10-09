# Validation report

What was actually run against this build, on the author's machine (macOS, Node 22, Google Chrome), and what it found. Nothing here was run in CI yet: `.github/workflows/pages.yml` is written but has not executed.

## Summary

| Check | Command | Result |
|---|---|---|
| Content validation | `npm run validate` | 47 files, 465 questions, **0 errors, 9 warnings** |
| Build | `npm run build` | 488 pages generated, 165 diagrams, service worker with 54 precached files (1.25 MB) |
| Site check | `npm run check` | 490 HTML files, 14,929 internal links, **0 errors, 0 warnings** |
| Unit + integration tests | `npm test` | **67 passed, 0 failed** |
| End-to-end tests (real Chrome) | `npm run test:e2e` | **16 passed, 0 failed** |
| Lighthouse (mobile profile, one question page) | Chrome DevTools audit | Accessibility 100, Best Practices 100, SEO 92 (see note) |
| Lab performance trace (one question page, local, no throttling) | Chrome DevTools trace | LCP 220 ms, CLS 0.00 |

## Content validation (47 files)

Enforced as errors: schema and enums, unique slugs and titles per category, every `related` slug resolving, Quick Read 45–115 words, Short Revision 8–36 words, Detailed at least 120 words, diagram integrity (node/edge references, 2–14 nodes, alt text of 30+ characters, placeholders matched), balanced code fences, sources required unless `new`, banned private terms, personal-positioning phrases.

The 9 warnings are Detailed answers of 202–218 words (guideline: 220+): eight in `mach-architecture` and one in `apigee-api-management`. They are above the 200-word indexing threshold, so their pages are indexable.

Provenance (`reports/CONTENT_REPORT.md`): 108 reference-derived, 341 enhanced, 16 new. These labels are the authors' own self-report, recorded in the data; they were not independently audited.

## Site check (`tools/check/check-site.mjs`)

Covers: leak scan (PDFs, source/content folders, configured private terms, source file names, secret-like strings), `<html lang>`, viewport, unique title and description, canonical equals the expected absolute URL, noindex pages have no canonical, Open Graph tags, exactly one `<h1>`, no skipped heading levels, duplicate ids, image alt, `svg role="img"` titles, button and link names, no root-absolute URLs (sub-path safety), JSON-LD validity and no unsupported claims (dates, author, ratings), CSP present, every internal link and fragment anchor resolving, orphan pages, sitemap equals the set of indexable pages (and robots references it), data files (per-question detail fragment, public page, related slugs, path ids), manifest icons, service-worker precache entries.

**The checker was itself tested.** `tests/integration/build.test.mjs` builds the site at a sub-path URL and at a domain-root URL (both pass), then injects 19 faults (broken link, broken anchor, root-absolute path, missing description, wrong canonical, duplicate title, image without alt, second `<h1>`, skipped heading, orphan page, published PDF, leaked private term, leaked token, invalid JSON-LD, JSON-LD with a date, sitemap missing a page, noindex page in the sitemap, missing detail fragment, dangling related slug, missing precache file) and confirms each one is detected.

## Unit and integration tests (67)

Spaced repetition (ladder, Again/Hard/Good/Easy, lapses, mastery rule, due and weak, custom ladder, immutability, interval previews), statistics (streaks, summaries, forecast), backup (round trip, rejection of malformed input, preference sanitising, merge rules), session building (sequential wrap-around, random, scope resolution, filters, simulation phases), search ranking, audio chunking, content validator, banned terms and aliases, cross-file checks, diagram renderer (accessibility, cycles, escaping, direction), markdown safety (raw HTML escaped, unsafe links dropped, tables wrapped, diagrams placed), build outputs, SEO files, service worker manifest, and the 19 fault injections above.

## End-to-end tests (16, Chrome driven by puppeteer-core)

1. Public question page: three styles, Detailed default, choice persists across reload, canonical correct, diagram titled.
2. App dashboard: loads cleanly, offline chip hidden while online.
3. Study: Space reveals, number key rates, IndexedDB progress and review rows verified, session resumes at question 2 after reload, keys before reveal do not rate.
4. Bookmark with `B` persists; "Bookmarked" mode uses it.
5. Interview simulation: answers hidden while answering, Space does not reveal, notes kept, review phase shows answers, rating recorded.
6. Audio: no speech on load, Play speaks on demand, Pause works.
7. Revision: a due card appears on the dashboard, is reviewed from the due queue, moves from 1 to 3 days, and the queue is empty afterwards.
8. Rapid-fire: answer appears after the countdown using Short Revision; no style switch.
9. Question bank: search, difficulty filter, URL state.
10. Backup: export, wipe, malformed file rejected with nothing changed, valid file restored with Replace after confirmation.
11. Offline: with the service worker active and network disabled, the app and the question list work and the offline indicator shows.
12. Theme: toggle cycles system, light, dark; persists across pages and into the app.
13–14. **axe-core** (WCAG 2 A/AA, 2.1 AA, 2.2 AA, best practice) on 12 pages plus a live study session, in **light and dark**: 0 violations.
15. No horizontal page scroll at 375 px on 7 key pages.
16. No uncaught page errors or console errors during the whole run.

Axe found real issues during development (link underlines removed by the CSS reset, nav link colour overriding button text, a skipped heading level in the bank); they were fixed and re-tested.

## Notes and caveats

- **Lighthouse SEO 92:** the two failed audits were an artefact of mounting the site under `/interviewos/` on the local server (Lighthouse requests `/robots.txt` at the server root) and an optional `llms.txt` that is not part of this project. Lighthouse "agentic browsing" scored 67 for the same optional reasons and is not a goal.
- **Core Web Vitals:** only the single lab trace above exists. No field data. INP was not measured. Do not read these as production numbers.
- **Not tested:** real screen readers, forced-colours mode, 320 px and 400 % zoom by hand, the PWA update prompt (new version while one is running), the install prompt, behaviour in Safari and Firefox, behaviour on a phone, IndexedDB failure paths beyond the in-memory fallback code, and the GitHub Actions workflow itself.
- **Not verified:** that any page is indexed or ranks. Nothing in this repository can establish that.
- **Content accuracy** was not independently reviewed. Authors reported source errors they corrected; those corrections are theirs, not verified here. Code samples inside answers were not executed.
- **Two computed statistics** inside the A/B-testing answers (a sample-size figure and a chi-square example) were worked by hand by the author agent, not run.
