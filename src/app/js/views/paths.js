import { loadIndex, loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { summarize } from '../stats.js';
import { srsOpts } from '../store.js';
import { esc } from '../util.js';
import { pageHead, meter, statusChip, qChips } from '../ui.js';

export async function render({ main, params }) {
  const [idx, all] = await Promise.all([loadIndex(), loadAllQuestions()]);
  const cards = repo.allCards();
  const byId = new Map(all.map((q) => [q.id, q]));
  const sum = (ids) => summarize({ cards, questions: ids.map((id) => ({ id, cat: id.split('/')[0] })), opts: srsOpts() });

  if (!params.id) {
    document.title = 'Learning paths | InterviewOS';
    main.innerHTML = `${pageHead('Learning paths', 'Ordered routes through the question bank. Start anywhere; progress is shared across paths because it is tracked per question.')}
    <div class="grid-cards">${idx.paths
      .map((p) => {
        const s = sum(p.ids);
        return `<a class="card" href="#/paths/${p.id}"><h2>${esc(p.title)}</h2><p class="muted">${esc(p.description)}</p>${meter({ mastered: s.mastered, practiced: s.practiced, seen: s.seen, total: p.ids.length })}<p class="muted" style="margin:0.5rem 0 0">${p.ids.length} questions · ${p.categories.length} topics</p></a>`;
      })
      .join('')}</div>`;
    return;
  }

  const p = idx.paths.find((x) => x.id === params.id);
  if (!p) {
    main.innerHTML = '<h1 tabindex="-1">Path not found</h1><p><a href="#/paths">Back to paths</a></p>';
    return;
  }
  document.title = `${p.title} | InterviewOS`;
  const s = sum(p.ids);
  const groups = p.categories.map((cid) => ({ cat: idx.categories.find((c) => c.id === cid), ids: p.ids.filter((id) => id.startsWith(cid + '/')) })).filter((g) => g.ids.length);
  main.innerHTML = `${pageHead(p.title, esc(p.description))}
  <div class="card" style="margin-bottom:1rem">
    ${meter({ mastered: s.mastered, practiced: s.practiced, seen: s.seen, total: p.ids.length })}
    <p class="muted">${s.mastered} mastered · ${s.practiced - s.mastered} practised · ${s.seen - s.practiced} seen only · ${s.fresh} new · ${s.due} due</p>
    <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
      <a class="btn btn-primary" href="#/study?mode=sequential&scope=path:${p.id}">${s.seen ? 'Continue this path' : 'Start this path'}</a>
      <a class="btn" href="#/study?mode=random&scope=path:${p.id}">Random from path</a>
      <a class="btn" href="#/study?mode=simulation&scope=path:${p.id}">Simulate</a>
      ${s.due ? `<a class="btn" href="#/study?mode=revision&scope=path:${p.id}">Review ${s.due} due</a>` : ''}
    </div>
  </div>
  ${groups
    .map((g, i) => {
      const gs = sum(g.ids);
      return `<details class="card" style="margin-bottom:0.75rem"${i === 0 ? ' open' : ''}><summary style="cursor:pointer;font-weight:700;min-height:2.5rem;display:flex;align-items:center">${i + 1}. ${esc(g.cat.title)} <span class="muted" style="font-weight:400;margin-left:0.5rem">${gs.mastered}/${g.ids.length} mastered</span></summary>
      <ol style="padding-left:1.4rem;margin:0.75rem 0 0;list-style:decimal">${g.ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((q) => `<li style="padding:0.3rem 0"><a href="#/q/${esc(q.id)}">${esc(q.title)}</a> ${statusChip(q.id)} ${qChips(q)}</li>`)
        .join('')}</ol></details>`;
    })
    .join('')}`;
}
