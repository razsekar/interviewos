# Content pipeline

PDFs are **reference material**, not templates and never output. They stay on your machine.

```
sources/*.pdf (git-ignored)
   │  npm run extract   (pdfjs-dist, runs locally, no OCR needed for machine-readable PDFs)
   ▼
extracted/<alias>.txt (git-ignored, "=== PAGE n ===" markers) + extracted/index.json (alias → real file, git-ignored)
   │  authors (people or AI agents) read, restructure, correct and enhance, following docs/AUTHORING_BRIEF.md
   ▼
content/questions/<category>--NN.json   (committed; sources cite aliases only)
   │  npm run validate   (schema, lengths, diagrams, banned terms, cross-file checks)
   ▼
npm run build → dist/   →  npm run check  →  npm run report
```

## Steps

1. Put PDFs in `sources/`. Optional: list private terms (employer, role) one per line in `sources/banned-terms.txt`.
2. `npm run extract` writes text per source and `reports/extraction.json` (alias, pages, characters, machine-readable flag). Real file names never appear in committed output: sources get aliases like `ref-aws-cloud` (`tools/lib/aliases.mjs`).
3. Author questions (see the schema). Each question has `sourceType`:
   - `reference-derived`: structured from the notes, rewritten in original wording.
   - `enhanced`: started from the notes, then corrected, expanded or modernised.
   - `new`: not from the notes; fills a gap.
4. `npm run validate`. Errors fail the build. It enforces: Quick 45–115 words, Short Revision 8–36 words, Detailed ≥ 120 words (warning under 220), diagram integrity (2–14 nodes, valid edges, alt text ≥ 30 characters, placeholders resolve), balanced code fences, enums, tags, sources required unless `new`, banned private terms and personal-positioning phrases, unique slugs and titles per category, and every `related` slug resolving.
5. `npm run report` writes `reports/CONTENT_REPORT.md` (provenance by topic, approximate page coverage per source).

## Rules authors follow

Accuracy over speed; original prose (no copying); generic examples; no invented statistics, citations or credentials; no personal positioning; hedge product-specific claims; diagrams carry real alt text. Where the notes were wrong or thin, the answer is corrected and marked `enhanced`.

## What was done for the 465 shipped questions

Fifteen extracted sources fed 14 topic areas. Authoring was done by AI agents working in parallel against `docs/AUTHORING_BRIEF.md`, each gated by the validator. They reported the source errors they corrected (for example PUT/PATCH idempotency, FID versus INP, `no-cache` versus `max-age=0`, Multi-AZ not being disaster recovery, a statistically non-significant A/B example). The result was **not** reviewed by an independent human expert, and the methodology page says so.

## Adding or changing a question

Edit or add a JSON file under `content/questions/`, keeping `<category>--NN.json` naming (file order inside a category is the learning order). Run `npm run validate && npm run build && npm run check`. To hide a question without deleting it, set `"draft": true`.
