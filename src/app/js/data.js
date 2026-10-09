// Content loading. Everything is a static file under data/. Small per-category JSON is loaded on demand,
// long detailed answers are lazy HTML fragments, and the search index loads only when searching.
import { ROOT } from './config.js';

let index = null;
let searchIndex = null;
const catCache = new Map();
const qMap = new Map();
const detailCache = new Map();

async function fetchOk(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('You appear to be offline and this content has not been saved yet.');
  }
  if (!res.ok) throw new Error(`Could not load content (${res.status}).`);
  return res;
}

export async function loadIndex() {
  if (!index) index = await (await fetchOk(ROOT + 'data/index.json')).json();
  return index;
}

export async function loadCategory(id) {
  if (!catCache.has(id)) {
    const list = await (await fetchOk(`${ROOT}data/q/${id}.json`)).json();
    list.forEach((q) => qMap.set(q.id, q));
    catCache.set(id, list);
  }
  return catCache.get(id);
}

/** All questions in category order (the global learning order). */
export async function loadAllQuestions() {
  const idx = await loadIndex();
  const lists = await Promise.all(idx.categories.map((c) => loadCategory(c.id)));
  return lists.flat();
}

export const getQuestionSync = (id) => qMap.get(id);
export async function getQuestion(id) {
  if (!qMap.has(id)) await loadCategory(id.split('/')[0]);
  return qMap.get(id) || null;
}

export async function loadDetail(id) {
  if (!detailCache.has(id)) {
    const [cat, slug] = id.split('/');
    detailCache.set(id, await (await fetchOk(`${ROOT}data/d/${cat}/${slug}.html`)).text());
  }
  return detailCache.get(id);
}

export async function loadSearchIndex() {
  if (!searchIndex) searchIndex = (await (await fetchOk(ROOT + 'data/search.json')).json()).docs;
  return searchIndex;
}

/** Fetch every detailed answer so the service worker caches it for offline reading. */
export async function downloadAllForOffline(onProgress, signal) {
  const all = await loadAllQuestions();
  let done = 0;
  let failed = 0;
  const queue = [...all];
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const q = queue.shift();
      try {
        await loadDetail(q.id);
      } catch {
        failed++;
      }
      onProgress?.(++done, all.length, failed);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await loadSearchIndex().catch(() => {});
  return { done, total: all.length, failed };
}
