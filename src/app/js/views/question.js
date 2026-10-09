import { getQuestion, loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { getPrefs, setPrefs } from '../store.js';
import { esc, announce, toast, isTyping } from '../util.js';
import { qChips, statusChip, bookmarkBtn, bindBookmarks, styleSeg, answerBody, ratingRow, errorBlock } from '../ui.js';
import { RATING_LABEL, formatInterval } from '../srs.js';
import { ROOT } from '../config.js';
import { audioControlsHtml, bindAudioControls, answerText } from '../audio-ui.js';

export async function render({ main, signal, params }) {
  const id = `${params.cat}/${params.slug}`;
  const q = await getQuestion(id);
  if (!q) {
    document.title = 'Question not found | InterviewOS';
    main.innerHTML = '<h1 tabindex="-1">Question not found</h1><p><a href="#/bank">Browse the question bank</a></p>';
    return;
  }
  document.title = `${q.title} | InterviewOS`;
  let style = getPrefs().style;
  let exposed = false;
  const all = await loadAllQuestions();
  const idx = all.findIndex((x) => x.id === id);
  const prev = all[idx - 1];
  const next = all[idx + 1];
  const related = (q.related || []).map((s) => all.find((x) => x.id === `${q.cat}/${s}`)).filter(Boolean);

  main.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb" style="padding-top:0"><ol><li><a href="#/bank">Question Bank</a></li><li><a href="#/bank?cat=${esc(q.cat)}">${esc(q.cat)}</a></li><li aria-current="page">${esc(q.topic)}</li></ol></nav>
  <h1 tabindex="-1" style="font-size:clamp(1.6rem,3.5vw,2.3rem);margin:0.25rem 0 0.75rem">${esc(q.title)}</h1>
  <div class="chips" id="q-chips">${qChips(q)}<span id="q-status">${statusChip(id)}</span></div>
  <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;margin:1rem 0">${styleSeg(style)}${bookmarkBtn(id)}${q.page ? `<a class="btn btn-sm" href="${ROOT}${esc(q.page)}">Public page</a>` : ''}</div>
  <section aria-label="Answer" id="answer" tabindex="-1" style="max-width:46rem"></section>
  ${audioControlsHtml()}
  <section class="section" aria-labelledby="h-rate" style="max-width:46rem"><h2 id="h-rate" style="font-size:1.15rem">Self-assess</h2><p class="muted">After reading, rate how well you could answer this unaided. This schedules your next review. <span id="rated-note" aria-live="polite"></span></p><div id="rate-slot">${ratingRow(id)}</div></section>
  ${q.followUps?.length ? `<section class="section" style="max-width:46rem"><h2 style="font-size:1.15rem">Likely follow-ups</h2><ul style="padding-left:1.3rem;list-style:disc">${q.followUps.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></section>` : ''}
  ${related.length ? `<section class="section" style="max-width:46rem"><h2 style="font-size:1.15rem">Related</h2><ul style="padding-left:1.3rem;list-style:disc">${related.map((r) => `<li><a href="#/q/${esc(r.id)}">${esc(r.title)}</a></li>`).join('')}</ul></section>` : ''}
  <nav aria-label="Previous and next" style="display:flex;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;margin-top:1.5rem">${prev ? `<a class="btn" href="#/q/${esc(prev.id)}">← ${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="btn" href="#/q/${esc(next.id)}">${esc(next.title)} →</a>` : ''}</nav>`;

  const answerEl = main.querySelector('#answer');
  async function showAnswer() {
    answerEl.setAttribute('aria-busy', 'true');
    answerEl.innerHTML = await answerBody(q, style);
    answerEl.removeAttribute('aria-busy');
    if (!exposed) {
      exposed = true;
      await repo.markExposure(id);
      main.querySelector('#q-status').innerHTML = statusChip(id);
    }
  }
  await showAnswer();

  main.querySelector('#style-seg').addEventListener(
    'click',
    async (e) => {
      const b = e.target.closest('button[data-style]');
      if (!b) return;
      style = b.dataset.style;
      setPrefs({ style });
      main.querySelectorAll('#style-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      await showAnswer();
      announce(`${b.textContent} answer shown`);
    },
    { signal },
  );
  bindBookmarks(main, signal);
  main.querySelector('#rate-slot').addEventListener(
    'click',
    async (e) => {
      const b = e.target.closest('[data-rate]');
      if (!b) return;
      const r = Number(b.dataset.rate);
      const card = await repo.rate(id, r, { mode: 'question-page', style });
      const msg = `Rated ${RATING_LABEL[r]}. Next review in ${formatInterval(card.due - Date.now())}.`;
      main.querySelector('#rated-note').textContent = msg;
      main.querySelector('#q-status').innerHTML = statusChip(id);
      main.querySelector('#rate-slot').innerHTML = ratingRow(id);
      toast(msg);
    },
    { signal },
  );
  const stopAudio = bindAudioControls(main, signal, () => answerText(q, style));
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || !getPrefs().shortcuts) return;
      if (e.key === 'b' || e.key === 'B') main.querySelector('[data-bm]')?.click();
      else if (e.key === 'r' || e.key === 'R') main.querySelector('#audio-toggle')?.click();
      else if (e.key === 'ArrowRight' && next) location.hash = `#/q/${next.id}`;
      else if (e.key === 'ArrowLeft' && prev) location.hash = `#/q/${prev.id}`;
      else if (e.key === 'Escape') stopAudio();
    },
    { signal },
  );
  return stopAudio;
}
