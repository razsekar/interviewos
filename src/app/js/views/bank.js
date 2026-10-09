import { loadIndex, loadAllQuestions, loadSearchIndex } from '../data.js';
import { searchDocs } from '../search.js';
import * as repo from '../repo.js';
import { srsOpts } from '../store.js';
import { applyFilters } from '../scope.js';
import { esc, debounce, cap, announce, plural } from '../util.js';
import { pageHead, qRow, bookmarkBtn, bindBookmarks, emptyState } from '../ui.js';
import { createSession, buildQueue } from '../session.js';
import { MODES } from '../config.js';

const PAGE = 50;

export async function render({ main, signal, query, go }) {
  document.title = 'Question Bank | InterviewOS';
  const [idx, all] = await Promise.all([loadIndex(), loadAllQuestions()]);
  const state = { q: query.get('q') || '', cat: query.get('cat') || '', diff: query.get('diff') || '', type: query.get('type') || '', status: query.get('status') || '', src: query.get('src') || '', topic: query.get('topic') || '', shown: PAGE };
  let searchDocsCache = null;

  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const topicsFor = (cat) => [...new Set(all.filter((q) => !cat || q.cat === cat).map((q) => q.topic))];

  main.innerHTML = `${pageHead('Question Bank', `${all.length} questions. Search, filter, then study exactly what you found.`)}
  <form class="card" id="filters" role="search" aria-label="Search and filter questions" style="margin-bottom:1rem">
    <div class="field"><label for="f-q">Search</label><input type="search" id="f-q" value="${esc(state.q)}" autocomplete="off" placeholder="e.g. cache invalidation, hydration, idempotency"></div>
    <div class="grid-cards" style="gap:0.75rem">
      <div class="field"><label for="f-cat">Topic area</label><select id="f-cat">${opt('', 'All', state.cat)}${idx.categories.map((c) => opt(c.id, c.title, state.cat)).join('')}</select></div>
      <div class="field"><label for="f-topic">Subtopic</label><select id="f-topic"></select></div>
      <div class="field"><label for="f-diff">Difficulty</label><select id="f-diff">${opt('', 'Any', state.diff)}${['beginner', 'intermediate', 'advanced'].map((d) => opt(d, cap(d), state.diff)).join('')}</select></div>
      <div class="field"><label for="f-type">Type</label><select id="f-type">${opt('', 'Any', state.type)}${['conceptual', 'comparison', 'scenario', 'design', 'coding'].map((d) => opt(d, cap(d), state.type)).join('')}</select></div>
      <div class="field"><label for="f-status">Your status</label><select id="f-status">${opt('', 'Any', state.status)}${[['new', 'New'], ['seen', 'Seen'], ['learning', 'Learning'], ['mastered', 'Mastered'], ['due', 'Due for review'], ['bookmarked', 'Bookmarked']].map(([v, l]) => opt(v, l, state.status)).join('')}</select></div>
      <div class="field"><label for="f-src">Content origin</label><select id="f-src">${opt('', 'Any', state.src)}${[['reference-derived', 'Reference-derived'], ['enhanced', 'Enhanced'], ['new', 'New']].map(([v, l]) => opt(v, l, state.src)).join('')}</select></div>
    </div>
    <button type="button" class="btn btn-sm" id="f-clear">Clear filters</button>
  </form>
  <div id="summary" role="status" aria-live="polite" class="muted" style="margin-bottom:0.5rem"></div>
  <div id="study-bar" class="card" style="margin-bottom:1rem;display:flex;gap:0.6rem;flex-wrap:wrap;align-items:end"></div>
  <div id="results"></div>
  <div style="margin-top:1rem"><button type="button" class="btn" id="more" hidden>Show more</button></div>`;

  const $ = (s) => main.querySelector(s);
  const fill = () => {
    $('#f-topic').innerHTML = opt('', 'All', state.topic) + topicsFor(state.cat).map((t) => opt(t, t, state.topic)).join('');
  };
  fill();

  let matches = [];
  async function compute() {
    let list = all;
    if (state.q.trim()) {
      searchDocsCache ||= await loadSearchIndex().catch(() => null);
      if (searchDocsCache) {
        const ids = searchDocs(searchDocsCache, state.q);
        const byId = new Map(all.map((q) => [q.id, q]));
        list = ids.map((id) => byId.get(id)).filter(Boolean);
      } else {
        const t = state.q.toLowerCase();
        list = all.filter((q) => (q.title + ' ' + q.topic + ' ' + q.tags.join(' ') + ' ' + q.quick).toLowerCase().includes(t));
      }
    }
    if (state.cat) list = list.filter((q) => q.cat === state.cat);
    if (state.topic) list = list.filter((q) => q.topic === state.topic);
    matches = applyFilters(list, { difficulty: state.diff, type: state.type, status: state.status, source: state.src, cards: repo.allCards(), opts: srsOpts(), bookmarkSet: new Set(repo.bookmarkIds()) });
  }

  function draw() {
    const slice = matches.slice(0, state.shown);
    $('#summary').textContent = `${plural(matches.length, 'question')} match${matches.length === 1 ? 'es' : ''}.`;
    $('#results').innerHTML = matches.length
      ? `<h2 class="sr-only">Results</h2><div class="qlist">${slice.map((q) => qRow(q, { actions: bookmarkBtn(q.id) })).join('')}</div>`
      : emptyState('No questions match', 'Try fewer filters or a different search term.');
    $('#more').hidden = matches.length <= state.shown;
    $('#more').textContent = `Show more (${matches.length - state.shown} left)`;
    $('#study-bar').innerHTML = matches.length
      ? `<div class="field" style="margin:0"><label for="s-mode">Study these ${matches.length} as</label><select id="s-mode">${['sequential', 'random', 'rapid', 'simulation', 'audio'].map((m) => `<option value="${m}">${MODES[m].label}</option>`).join('')}</select></div><div class="field" style="margin:0"><label for="s-count">How many</label><select id="s-count">${[10, 20, 50, 0].filter((n) => !n || n < matches.length).map((n) => `<option value="${n}">${n || 'All ' + matches.length}</option>`).join('')}${matches.length <= 10 ? `<option value="0">All ${matches.length}</option>` : ''}</select></div><button type="button" class="btn btn-primary" id="s-go">Start session</button>`
      : '';
  }

  function syncUrl() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: state.q, cat: state.cat, topic: state.topic, diff: state.diff, type: state.type, status: state.status, src: state.src })) if (v) p.set(k, v);
    history.replaceState(null, '', '#/bank' + (p.toString() ? '?' + p : ''));
  }

  async function refresh(resetShown = true) {
    if (resetShown) state.shown = PAGE;
    await compute();
    draw();
    syncUrl();
  }

  const onInput = debounce(() => {
    state.q = $('#f-q').value;
    refresh();
  }, 200);
  $('#f-q').addEventListener('input', onInput, { signal });
  $('#filters').addEventListener('submit', (e) => e.preventDefault(), { signal });
  const sel = { 'f-cat': 'cat', 'f-topic': 'topic', 'f-diff': 'diff', 'f-type': 'type', 'f-status': 'status', 'f-src': 'src' };
  $('#filters').addEventListener(
    'change',
    (e) => {
      const k = sel[e.target.id];
      if (!k) return;
      state[k] = e.target.value;
      if (k === 'cat') {
        state.topic = '';
        fill();
      }
      refresh();
    },
    { signal },
  );
  $('#f-clear').addEventListener(
    'click',
    () => {
      Object.assign(state, { q: '', cat: '', diff: '', type: '', status: '', src: '', topic: '' });
      $('#f-q').value = '';
      for (const id of Object.keys(sel)) $('#' + id).value = '';
      fill();
      refresh();
      announce('Filters cleared');
    },
    { signal },
  );
  $('#more').addEventListener('click', () => {
    state.shown += PAGE;
    draw();
  }, { signal });
  main.addEventListener(
    'click',
    async (e) => {
      if (e.target.id !== 's-go') return;
      const mode = $('#s-mode').value;
      const count = Number($('#s-count').value);
      const queue = buildQueue(mode, matches, { cards: repo.allCards(), count, opts: srsOpts() });
      const s = createSession({ mode, scope: 'bank', queue, cfg: { style: mode === 'rapid' ? 'revision' : mode === 'simulation' ? 'quick' : mode === 'audio' ? 'quick' : repoStyle() } });
      await repo.saveSession(s);
      go('#/session');
    },
    { signal },
  );
  bindBookmarks(main, signal, () => {
    if (state.status === 'bookmarked') refresh(false);
  });
  await refresh();
}

import { getPrefs } from '../store.js';
const repoStyle = () => getPrefs().style;
