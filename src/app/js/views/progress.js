import { loadIndex, loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { srsOpts, getPrefs } from '../store.js';
import { summarize } from '../stats.js';
import { isWeak, RATING_LABEL } from '../srs.js';
import { esc, plural } from '../util.js';
import { pageHead, meter, qRow } from '../ui.js';

function barChart(days) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const W = 560, H = 120, bw = W / days.length;
  const bars = days.map((d, i) => {
    const h = Math.round((d.count / max) * (H - 24));
    return `<rect x="${(i * bw + 4).toFixed(1)}" y="${H - 16 - h}" width="${(bw - 8).toFixed(1)}" height="${Math.max(h, d.count ? 2 : 0)}" rx="3" fill="var(--brand)"><title>${esc(d.day)}: ${d.count}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="bc-t" style="width:100%;max-width:36rem;height:auto"><title id="bc-t">Reviews per day over the last 14 days</title>${bars}<line x1="0" x2="${W}" y1="${H - 15}" y2="${H - 15}" stroke="var(--line)"/></svg>`;
}

export async function render({ main }) {
  document.title = 'Progress | InterviewOS';
  const [idx, all] = await Promise.all([loadIndex(), loadAllQuestions()]);
  const cards = repo.allCards();
  const s = summarize({ cards, questions: all.map((q) => ({ id: q.id, cat: q.cat })), reviews: repo.allReviews(), opts: srsOpts() });
  const weak = all.filter((q) => isWeak(cards.get(q.id))).slice(0, 8);
  const catRows = idx.categories.map((c) => ({ c, b: s.byCat[c.id] || { total: 0, seen: 0, practiced: 0, mastered: 0, due: 0 } }));
  const dist = s.ratingDist;
  const totalR = s.totalReviews;

  main.innerHTML = `${pageHead('Progress', 'Three different things are tracked on purpose: what you have seen, what you have practised, and what you have mastered.')}
  <div class="grid-cards">
    <div class="card"><h2>Seen</h2><p class="stat">${s.seen}<span class="muted" style="font-size:1rem;font-weight:500"> / ${s.total}</span></p><p class="muted" style="margin:0">You opened the answer at least once. Exposure only.</p></div>
    <div class="card"><h2>Practised</h2><p class="stat">${s.practiced}</p><p class="muted" style="margin:0">You rated yourself at least once.</p></div>
    <div class="card"><h2>Mastered</h2><p class="stat">${s.mastered}</p><p class="muted" style="margin:0">3+ reviews, last two Good or Easy, interval of ${getPrefs().masteryDays}+ days.</p></div>
    <div class="card"><h2>Streak</h2><p class="stat">${plural(s.streak, 'day')}</p><p class="muted" style="margin:0">${s.recallConfidence30d === null ? 'No reviews in the last 30 days.' : `Recall confidence, last 30 days: ${s.recallConfidence30d}% rated Good or Easy.`}</p></div>
  </div>
  <section class="section" aria-labelledby="h-all"><h2 id="h-all">Overall</h2>${meter({ mastered: s.mastered, practiced: s.practiced, seen: s.seen, total: s.total })}
    <p class="muted" style="margin-top:0.5rem"><span class="chip" style="background:var(--ok);color:var(--bg)">Mastered</span> <span class="chip" style="background:var(--brand);color:var(--brand-ink)">Practised</span> <span class="chip" style="background:var(--accent);color:var(--bg)">Seen only</span> · ${s.fresh} not started · ${s.due} due · ${s.weak} weak</p></section>
  <section class="section" aria-labelledby="h-cat"><h2 id="h-cat">By topic</h2>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th scope="col">Topic</th><th scope="col">Progress</th><th scope="col">Seen</th><th scope="col">Practised</th><th scope="col">Mastered</th><th scope="col">Due</th></tr></thead><tbody>
    ${catRows.map(({ c, b }) => `<tr><th scope="row" style="font-weight:600"><a href="#/bank?cat=${esc(c.id)}">${esc(c.short)}</a></th><td style="min-width:8rem">${meter({ ...b })}</td><td>${b.seen}/${b.total}</td><td>${b.practiced}</td><td>${b.mastered}</td><td>${b.due}</td></tr>`).join('')}
    </tbody></table></div></section>
  <section class="section" aria-labelledby="h-act"><h2 id="h-act">Activity, last 14 days</h2>${barChart(s.last14)}
    <details><summary style="cursor:pointer;min-height:2.5rem;display:flex;align-items:center">View as a table</summary><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Reviews</th></tr></thead><tbody>${s.last14.map((d) => `<tr><td>${esc(d.day)}</td><td>${d.count}</td></tr>`).join('')}</tbody></table></details>
    <p class="muted">${plural(s.totalReviews, 'review')} in total. ${totalR ? [1, 2, 3, 4].map((r) => `${RATING_LABEL[r]} ${Math.round((dist[r] / totalR) * 100)}%`).join(' · ') : ''}</p></section>
  <section class="section" aria-labelledby="h-weak"><h2 id="h-weak">Weak spots</h2>
    ${weak.length ? `<div class="qlist">${weak.map((q) => qRow(q)).join('')}</div><p><a class="btn" href="#/study?mode=revision&scope=weak">Practise weak spots</a></p>` : '<p class="muted">None yet. Rate some questions to see where you struggle.</p>'}</section>
  <section class="section"><details class="card"><summary style="cursor:pointer;font-weight:700;min-height:2.5rem;display:flex;align-items:center">How these numbers are calculated</summary>
    <ul style="padding-left:1.3rem;list-style:disc">
      <li><strong>Seen</strong>: the answer was revealed, read or listened to. It says nothing about recall.</li>
      <li><strong>Practised</strong>: at least one self-rating. Based on your honesty.</li>
      <li><strong>Mastered</strong>: at least 3 reviews, the last two rated Good or Easy, and a scheduled interval of ${getPrefs().masteryDays}+ days. A later Again or Hard removes the mastered status until you recover it.</li>
      <li><strong>Due</strong>: practised questions whose scheduled review time has passed.</li>
      <li><strong>Weak</strong>: last rated Again or Hard, or lapsed twice or more.</li>
      <li>Everything is computed on this device from your review history. Nothing is sent anywhere.</li>
    </ul></details></section>`;
}
