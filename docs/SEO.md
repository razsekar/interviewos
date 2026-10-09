# SEO

Public pages are static HTML, so crawlers see full content without running JavaScript. The app (`/app/`) is `noindex, nofollow` and is not in the sitemap.

## URL design

| Page | URL | Indexed |
|---|---|---|
| Home | `/` | yes |
| Topic index | `/categories/` | yes |
| Topic guide (one per category) | `/topics/<category>/` | yes |
| Question | `/questions/<category>/<slug>/` | yes if the detailed answer has ≥ 200 words (all 465 currently) |
| About, Methodology, Privacy, Terms, Accessibility, Contact, Directory | `/about/` etc. | yes |
| App, 404, offline | `/app/`, `404.html`, `offline.html` | no (`noindex`) |

Slugs are stable and come from the content files. Trailing-slash directory URLs work on GitHub Pages and Vercel.

## What every indexable page has

Unique `<title>` and meta description (duplicates fail the check), a self-referencing absolute canonical built from `SITE_URL`, Open Graph and Twitter tags with a 1200×630 image, one `<h1>`, a breadcrumb trail and matching `BreadcrumbList` JSON-LD, `lang`, viewport, and at least one internal link in (orphans fail the check).

## Structured data (only what is true)

`WebSite` and `WebPage` on the home page, `WebPage` + `BreadcrumbList` on guides and info pages, `TechArticle` + `BreadcrumbList` on questions. The checker rejects JSON-LD that asserts `author`, `datePublished`, `dateModified`, ratings or reviews, because none of that exists. Valid markup does not guarantee rich results.

## Internal linking

Topic guides link every question in them; each question links previous/next in its topic, related questions in the same topic, and up to three questions from other topics that share at least two tags; the site directory lists every page.

## Sitemap and robots

`sitemap.xml` lists exactly the indexable pages (no `lastmod`, because there is no truthful per-page modification date). `robots.txt` allows everything and points to the sitemap.

**Project-site caveat:** crawlers only read `robots.txt` at the *domain root*. For `https://user.github.io/repo/` that file belongs to `user.github.io`, not to this repo. Submit the sitemap in Search Console directly. A custom domain removes this limitation.

## Core Web Vitals approach

Targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile of real users. Design choices that support them: pre-rendered HTML, one small render-blocking stylesheet (about 18 KB), a tiny blocking theme script, deferred site script, system fonts (no font loading), no third-party requests, no images in content (diagrams are inline SVG with fixed `width`/`height`), no layout-shifting injection. **Measured so far:** one local Chrome lab run on a question page, no throttling: LCP 220 ms, CLS 0.00. That is not field data and says nothing about real users. INP has not been measured.

## Search Console (manual steps, not automated)

1. Deploy and confirm `https://<site>/sitemap.xml` loads.
2. In Google Search Console add the property (URL-prefix for a project site), verify ownership (HTML tag or DNS).
3. Submit `sitemap.xml`. Use URL Inspection on the home page, a topic guide and a question page.
4. Watch Indexing → Pages and Experience → Core Web Vitals over the following weeks. Indexing and ranking are decided by the search engine; nothing in this repository can promise them.
5. Do the same in Bing Webmaster Tools if wanted.

## Known SEO limits

About 70 question titles exceed 60 characters and may be truncated or rewritten in results. Titles are the learner-facing questions, so they were not shortened. If rankings matter, add a short `seoTitle` field per question and use it in the build.
