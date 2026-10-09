// Resolve a scope string to a list of questions. Pure given its inputs, so it is unit-tested.
// Scopes: all | cat:<id> | path:<id> | bookmarks | due | weak | new | ids:<a,b,...>
import { isDue, isWeak, status } from './srs.js';

export function resolveScope(scope, { questions, index, cards, bookmarkIds = [], now = Date.now(), opts = {} }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const [kind, arg] = String(scope || 'all').split(/:(.*)/s);
  switch (kind) {
    case 'cat':
      return questions.filter((q) => q.cat === arg);
    case 'path': {
      const p = index?.paths?.find((x) => x.id === arg);
      return p ? p.ids.map((id) => byId.get(id)).filter(Boolean) : [];
    }
    case 'bookmarks':
      return bookmarkIds.map((id) => byId.get(id)).filter(Boolean);
    case 'due':
      return questions
        .filter((q) => isDue(cards.get(q.id), now))
        .sort((a, b) => cards.get(a.id).due - cards.get(b.id).due);
    case 'weak':
      return questions.filter((q) => isWeak(cards.get(q.id)));
    case 'new':
      return questions.filter((q) => status(cards.get(q.id), opts) === 'new');
    case 'ids':
      return String(arg || '').split(',').map((id) => byId.get(id)).filter(Boolean);
    default:
      return questions;
  }
}

export function applyFilters(list, { difficulty = '', type = '', status: st = '', source = '', cards, opts = {}, bookmarkSet } = {}) {
  return list.filter(
    (q) =>
      (!difficulty || q.difficulty === difficulty) &&
      (!type || q.type === type) &&
      (!source || q.sourceType === source) &&
      (!st || (st === 'due' ? isDue(cards.get(q.id)) : st === 'bookmarked' ? bookmarkSet?.has(q.id) : status(cards.get(q.id), opts) === st)) ,
  );
}
