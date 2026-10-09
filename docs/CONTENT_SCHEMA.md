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
