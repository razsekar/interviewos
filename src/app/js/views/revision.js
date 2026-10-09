import { loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { getPrefs, srsOpts } from '../store.js';
import { forecast } from '../stats.js';
import { isDue, isWeak, formatInterval } from '../srs.js';
import { esc, plural, fmtDate } from '../util.js';
import { pageHead, qRow, emptyState } from '../ui.js';

export async function render({ main }) {
  document.title = 'Revision center | InterviewOS';
  const all = await loadAllQuestions();
  const cards = repo.allCards();
  const now = Date.now();
  const f = forecast(cards, now);
  const due = all.filter((q) => isDue(cards.get(q.id), now)).sort((a, b) => cards.get(a.id).due - cards.get(b.id).due);
  const weak = all.filter((q) => isWeak(cards.get(q.id)));
  const marks = repo.bookmarkIds();
  const ladder = getPrefs().ladder;

  main.innerHTML = `${pageHead('Revision center', 'Spaced repetition: questions come back just before you would forget them. Your own ratings drive the schedule.')}
  <div class="grid-cards">
    <section class="card"><h2>Due now</h2><p class="stat">${due.length}</p><a class="btn ${due.length ? 'btn-primary' : ''}" href="#/study?mode=revision&scope=due">Review due questions</a></section>
    <section class="card"><h2>Weak spots</h2><p class="stat">${weak.length}</p><p class="muted">Last rated Again or Hard, or lapsed twice or more.</p><a class="btn" href="#/study?mode=revision&scope=weak">Practise weak spots</a></section>
    <section class="card"><h2>Bookmarked</h2><p class="stat">${marks.length}</p><a class="btn" href="#/study?mode=bookmarked">Study bookmarks</a></section>
  </div>
  <section class="section" aria-labelledby="h-fc"><h2 id="h-fc">Coming up</h2>
    <table class="tbl"><caption class="sr-only">Number of questions falling due</caption><thead><tr><th scope="col">When</th><th scope="col">Questions</th></tr></thead><tbody>
      <tr><th scope="row">Now (overdue)</th><td>${f.now}</td></tr><tr><th scope="row">Later today</th><td>${f.today}</td></tr><tr><th scope="row">Tomorrow</th><td>${f.tomorrow}</td></tr><tr><th scope="row">Next 7 days</th><td>${f.week}</td></tr><tr><th scope="row">Later</th><td>${f.later}</td></tr>
    </tbody></table></section>
  <section class="section" aria-labelledby="h-due"><h2 id="h-due">Most overdue</h2>
    ${due.length ? `<div class="qlist">${due.slice(0, 15).map((q) => qRow(q, { actions: `<span class="muted">due ${fmtDate(cards.get(q.id).due)}</span>` })).join('')}</div>${due.length > 15 ? `<p class="muted">and ${due.length - 15} more.</p>` : ''}` : emptyState('Nothing due', 'When you rate questions in a study session they will show up here on schedule.', '<a class="btn btn-primary" href="#/study">Start studying</a>')}
  </section>
  <section class="section" aria-labelledby="h-how"><h2 id="h-how">How scheduling works</h2>
    <div class="card" style="max-width:46rem"><ul style="padding-left:1.3rem;list-style:disc;margin:0">
      <li><strong>Again</strong>: back to learning, retry in ${formatInterval(srsOpts().againMinutes ? srsOpts().againMinutes * 60000 : 600000)}.</li>
      <li><strong>Hard</strong>: repeat the current step (a new question retries in half the first step).</li>
      <li><strong>Good</strong>: move up one step. <strong>Easy</strong>: move up two steps.</li>
      <li>Your ladder in days: <strong>${ladder.join(', ')}</strong>. Change it in <a href="#/settings">Settings</a>.</li>
      <li>These are your own judgements of recall. The schedule measures confidence, not knowledge.</li>
    </ul></div></section>`;
}
