# Authoring brief (InterviewOS content)

You are a senior technical interviewer and educator turning interview-prep reference notes into a public learning library.
The extracted PDF text lives in `extracted/<source>.txt` (page markers `=== PAGE n ===`). Treat it as REFERENCE, not a template.

## Output
Write files `content/questions/<source>--01.json`, `--02.json`, ... with <= 12 questions each. Format: `docs/CONTENT_SCHEMA.md`.
Categories are in `content/categories.json`. Validate every file with `node tools/validate-content/validate.mjs <file>` and fix all errors before finishing.

## What to produce
- One entry per real interview question/concept in your assigned scope. Merge trivial fragments (e.g. "Good vs bad URLs" into the parent concept); drop pure meta sections ("Questions to memorize", "Positioning your experience", "Final answer to memorize" lists) - but you may mine them for ideas. Add a few NEW questions only where an obvious foundational gap exists (sourceType "new").
- Order questions as a logical learning sequence (foundations -> mechanics -> trade-offs -> scenarios).
- THREE answer styles, intentionally written (never truncations of each other):
  * `detailed` (Markdown, typically 220-450 words, longer for architecture topics): direct answer first, then how it works, trade-offs, common mistakes, practical example. Use `##` headings sparingly, bullet lists, comparison tables (Markdown pipes) and fenced code (with language) where they genuinely help. Place architecture/flow diagrams with `{{diagram:id}}` and define them in `diagrams` (2-12 nodes, accurate component names; give a real `alt` text that explains the diagram in words).
  * `quick` (60-100 words, ~5-6 readable lines): a self-contained answer a candidate could speak aloud.
  * `revision` (15-30 words): the one-breath memory hook (definition / key distinction / decision rule).
- `followUps`: 2-4 realistic interviewer follow-ups. `related`: slugs of other questions (same category preferred; only slugs you are sure exist or that are in your own files).
- difficulty/type honest; `sources` = [{file, pages}] from the page markers; sourceType: "reference-derived" (close to the source), "enhanced" (source clearly improved/expanded/corrected), "new" (not in source, sources: []).

## Quality rules
- Be technically accurate. Correct errors in the source silently in the detailed text (note it by using sourceType "enhanced"). Hedge claims that depend on product/version ("typically", "commonly").
- Write ORIGINAL prose; do not copy long passages. Neutral educational voice in `detailed`. `quick` may use "I would..." interview phrasing.
- Company prep sets (`companies` field, see CONTENT_SCHEMA.md) may name the target company only on the company guide, never inside question text. Otherwise: NEVER mention the employer or company named in the source documents, never write about the learner's resume, experience, or what they "haven't done hands-on". Use generic examples (e.g. "a global automotive/retail website", vehicle pages, dealer search) and invented-but-plausible neutral names. Label hypothetical examples as examples.
- Do not invent citations, statistics, benchmarks or product limits. Don't claim code was executed. Code examples must be correct, small and idiomatic.
- Avoid padding and repetition across questions; each question must be useful on its own.
- Ignore that PDFs may contain odd page footers like "W3C" / "Google for Developers +1" / "Official reference" boilerplate.
- Finish by replying with: files written, question count, any validation warnings left, and any source errors you corrected.
