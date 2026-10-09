// Tiny client-side search over the lazily loaded index. Pure, so it is unit-tested.
// Every query token must match somewhere (AND). Score: title > tags > topic > body, word-start bonus.
export const tokenize = (s) => String(s).toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 0);

export function searchDocs(docs, query, limit = 500) {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const hits = [];
  for (const [id, title, topic, tags, body] of docs) {
    const t = title.toLowerCase();
    const tp = topic.toLowerCase();
    const tg = tags.toLowerCase();
    let score = 0;
    let ok = true;
    for (const tok of tokens) {
      let s = 0;
      if (t.includes(tok)) s += t.startsWith(tok) || t.includes(' ' + tok) ? 8 : 5;
      if (tg.includes(tok)) s += 3;
      if (tp.includes(tok)) s += 2;
      if (body.includes(tok)) s += 1;
      if (!s) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) hits.push([id, score]);
  }
  hits.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return hits.slice(0, limit).map((h) => h[0]);
}
