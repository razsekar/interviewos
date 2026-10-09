// Shared view helpers. All dynamic text is escaped; only build-generated fragments are inserted as HTML.
import { esc, fmtInline, cap } from './util.js';
import { status as srsStatus, previewIntervals, RATING_LABEL } from './srs.js';
import { srsOpts } from './store.js';
import * as repo from './repo.js';
import { loadDetail } from './data.js';
import { STYLES } from './config.js';

export const STATUS_LABEL = { new: 'New', seen: 'Seen', learning: 'Learning', mastered: 'Mastered' };
export const qStatus = (id) => srsStatus(repo.getCard(id), srsOpts());
export const statusChip = (id) => {
  const s = qStatus(id);
  return `<span class="chip ${s === 'mastered' ? 'chip-beginner' : s === 'learning' ? 'chip-intermediate' : ''}">${STATUS_LABEL[s]}</span>`;
};
export const qChips = (q) =>
  `<span class="chip chip-${q.difficulty}">${cap(q.difficulty)}</span><span class="chip">${cap(q.type)}</span>`;

export const bookmarkBtn = (id, extra = '') => {
  const on = repo.isBookmarked(id);
  return `<button type="button" class="btn btn-sm ${extra}" data-bm="${esc(id)}" aria-pressed="${on}">${on ? '★ Bookmarked' : '☆ Bookmark'}</button>`;
};

export function bindBookmarks(root, signal, onToggle) {
  root.addEventListener(
    'click',
    async (e) => {
      const b = e.target.closest('[data-bm]');
      if (!b) return;
      const on = await repo.toggleBookmark(b.dataset.bm);
      root.querySelectorAll(`[data-bm="${CSS.escape(b.dataset.bm)}"]`).forEach((x) => {
        x.setAttribute('aria-pressed', String(on));
        x.textContent = on ? '★ Bookmarked' : '☆ Bookmark';
      });
      onToggle?.(b.dataset.bm, on);
    },
    { signal },
  );
}

export const styleSeg = (current, id = 'style-seg') =>
  `<div class="seg" id="${id}" role="group" aria-label="Answer style">${Object.entries(STYLES)
    .map(([k, label]) => `<button type="button" data-style="${k}" aria-pressed="${k === current}">${label}</button>`)
    .join('')}</div>`;

/** HTML for the chosen answer style. Detailed is fetched lazily; failures render a retry message. */
export async function answerBody(q, style) {
  if (style === 'quick') return `<p class="answer-quick">${fmtInline(q.quick)}</p>`;
  if (style === 'revision') return `<div class="callout"><p class="answer-revision">${fmtInline(q.revision)}</p></div>`;
  try {
    return `<div class="md">${await loadDetail(q.id)}</div>`;
  } catch (err) {
    return `<div class="banner" role="alert"><span>${esc(err.message)} Showing the quick read instead.</span></div><p class="answer-quick">${fmtInline(q.quick)}</p>`;
  }
}

export function ratingRow(id, { disabled = false } = {}) {
  const prev = previewIntervals(repo.getCard(id) || { stage: -1, lapses: 0, reviews: 0, recent: [] }, srsOpts());
  const cls = { 1: 'rate-again', 2: 'rate-hard', 3: 'rate-good', 4: 'rate-easy' };
  return `<div class="rate-row" role="group" aria-label="How well did you recall this?">${[1, 2, 3, 4]
    .map(
      (r) =>
        `<button type="button" class="btn ${cls[r]}" data-rate="${r}"${disabled ? ' disabled' : ''} style="flex-direction:column;gap:0.1rem"><span>${RATING_LABEL[r]}</span><small class="muted">next: ${prev[r]}</small><span class="kbd" aria-hidden="true">${r}</span></button>`,
    )
    .join('')}</div>`;
}

export function meter({ mastered = 0, practiced = 0, seen = 0, total = 1 }) {
  const t = Math.max(total, 1);
  const learning = Math.max(practiced - mastered, 0);
  const seenOnly = Math.max(seen - practiced, 0);
  const pct = (n) => ((n / t) * 100).toFixed(1);
  return `<div class="meter" role="img" aria-label="${mastered} mastered, ${learning} practised, ${seenOnly} seen only, of ${total}"><span class="m-mastered" style="width:${pct(mastered)}%"></span><span class="m-practiced" style="width:${pct(learning)}%"></span><span class="m-seen" style="width:${pct(seenOnly)}%"></span></div>`;
}

export const qRow = (q, { actions = '' } = {}) => `<div class="qrow">
  <div><h3><a href="#/q/${esc(q.id)}">${esc(q.title)}</a></h3><div class="chips">${qChips(q)}${statusChip(q.id)}<span class="chip">${esc(q.topic)}</span></div></div>
  <div>${actions}</div></div>`;

export const emptyState = (title, body, actions = '') =>
  `<div class="card" style="text-align:center;padding:2rem"><h2>${esc(title)}</h2><p class="muted">${body}</p>${actions}</div>`;

export const pageHead = (title, sub = '') =>
  `<header style="margin-bottom:1.25rem"><h1 tabindex="-1" style="font-size:clamp(1.6rem,3.5vw,2.2rem);margin:0">${esc(title)}</h1>${sub ? `<p class="muted" style="margin:0.4rem 0 0">${sub}</p>` : ''}</header>`;

export const errorBlock = (msg) => `<div class="banner" role="alert"><span>${esc(msg)}</span></div>`;

/** Native <dialog> confirmation (focus is trapped and restored by the browser). Resolves true/false. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.setAttribute('aria-labelledby', 'dlg-title');
    d.innerHTML = `<h2 id="dlg-title" style="margin-top:0;font-size:1.2rem">${esc(title)}</h2><div>${body}</div><div style="display:flex;gap:0.6rem;justify-content:flex-end;margin-top:1.25rem"><button type="button" class="btn" data-x="no">Cancel</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-x="yes">${esc(confirmLabel)}</button></div>`;
    const done = (v) => {
      d.close();
      d.remove();
      resolve(v);
    };
    d.addEventListener('click', (e) => e.target.dataset?.x && done(e.target.dataset.x === 'yes'));
    d.addEventListener('cancel', (e) => (e.preventDefault(), done(false)));
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('[data-x="no"]').focus();
  });
}
