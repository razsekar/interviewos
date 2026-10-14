# Content schema

Each file `content/questions/<source>--NN.json` (max ~12 questions per file):

```json
{
  "category": "react",
  "questions": [
    {
      "slug": "what-is-react",
      "title": "What is React?",
      "topic": "React Fundamentals",
      "difficulty": "beginner | intermediate | advanced",
      "type": "conceptual | comparison | scenario | design | coding",
      "tags": ["react", "components"],
      "companies": ["meil"],
      "sourceType": "reference-derived | enhanced | new",
      "sources": [{ "file": "react-js-interview-questions-answers", "pages": [1] }],
      "quick": "60-100 words, 5-6 readable lines",
      "revision": "15-30 words, 1-2 lines",
      "detailed": "Markdown. May contain {{diagram:flow}} placeholders, fenced code with language, tables.",
      "diagrams": [
        { "id": "flow", "title": "...", "alt": "text description of what the diagram shows",
          "direction": "LR | TB",
          "nodes": [{ "id": "a", "label": "Browser" }],
          "edges": [{ "from": "a", "to": "b", "label": "optional" }] }
      ],
      "followUps": ["Likely follow-up question?"],
      "related": ["slug-of-another-question"]
    }
  ]
}
```

Array order = recommended learning order inside the category. `slug` is unique per category; the stable global id is `<category>/<slug>`.

## Company prep

`companies` is optional: a non-empty list of ids from `content/companies.json`. A question stays in its normal technical category and can belong to several companies.

```json
{ "companies": [{ "id": "meil", "name": "...", "role": "...", "description": "...", "disclaimer": "...", "categories": ["ordered", "category", "ids"] }] }
```

The build turns each company into: a learning path `company-<id>` (tagged questions, in the order of `categories`), a static guide at `companies/<id>/`, and a Company filter in the Question Bank. Company questions are predicted, never confirmed, so `disclaimer` is shown on the guide and on each question page. Never include a person's full name or contact details in content.
