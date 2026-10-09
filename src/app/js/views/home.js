import { loadIndex, loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { summarize } from '../stats.js';
import { srsOpts } from '../store.js';
import { esc, plural, fmtDate } from '../util.js';
import { pageHead, meter } from '../ui.js';
import { MODES } from '../config.js';
import { resolveScope } from '../scope.js';

export async function render({ main }) {
  document.title = 'Dashboard | InterviewOS';
  const [idx, all] = await Promise.all([loadIndex(), loadAllQuestions()]);
  const cards = repo.allCards();
  const ctx = { questions: all, index: idx, cards, bookmarkIds: repo.bookmarkIds(), opts: srsOpts() };
  const s = summarize({ cards, questions: all.map((q) => ({ id: q.id, cat: q.cat })), reviews: repo.allReviews(), opts: srsOpts() });
  const goal = repo.getGoal('daily', 10);
  const interview = repo.getGoal('interviewDate', null);
  const active = repo.activeSession();
  const firstRun = s.seen === 0 && s.totalReviews === 0;
  const nextNew = resolveScope('path:architect-sprint', ctx).find((q) => !cards.get(q.id)?.exposures && !cards.get(q.id)?.reviews);
  const daysLeft = interview ? Math.ceil((interview - Date.now()) / 86400000) : null;
  const unmastered = s.total - s.mastered;

  main.innerHTML = `${pageHead(firstRun ? 'Welcome to InterviewOS' : 'Dashboard', firstRun ? `${all.length} questions, three answer styles, spaced repetition. Everything stays in your browser.` : `${plural(s.practiced, 'question')} practised, ${s.mastered} mastered.`)}
  ${
    active
      ? `<div class="banner banner-ok" style="margin-bottom:1rem"><span><strong>Session in progress:</strong> ${esc(MODES[active.mode]?.label || active.mode)}, ${active.index + 1} of ${active.queue.length}.</span><a class="btn btn-sm btn-primary" href="#/session">Resume</a></div>`
      : ''
  }
  <div class="grid-cards">
    <section class="card" aria-labelledby="h-today">
      <h2 id="h-today">Today</h2>
      <p class="stat">${s.reviewsToday}<span class="muted" style="font-size:1rem;font-weight:500"> / ${goal} reviews</span></p>
      <progress max="${goal}" value="${Math.min(s.reviewsToday, goal)}" aria-label="Daily goal progress" style="width:100%"></progress>
      <p class="muted" style="margin-bottom:0">${s.streak ? `${plural(s.streak, 'day')} streak.` : 'No streak yet: one review today starts it.'}</p>
    </section>
    <section class="card" aria-labelledby="h-due">
      <h2 id="h-due">Due for revision</h2>
      <p class="stat">${s.due}</p>
      <p class="muted">${s.due ? 'Scheduled reviews waiting for you.' : 'Nothing due. Learn something new, or come back later.'}</p>
      ${s.due ? `<a class="btn btn-primary" href="#/study?mode=revision&scope=due">Review ${s.due} now</a>` : '<a class="btn" href="#/revision">Open revision center</a>'}
    </section>
    <section class="card" aria-labelledby="h-next">
      <h2 id="h-next">${firstRun ? 'Start here' : 'Keep learning'}</h2>
      ${
        nextNew
          ? `<p style="margin-top:0">Next unseen in the Web Architect Sprint:<br><a href="#/q/${esc(nextNew.id)}"><strong>${esc(nextNew.title)}</strong></a></p><a class="btn btn-primary" href="#/study?mode=sequential&scope=path:architect-sprint">Study the Sprint path</a>`
          : '<p>You have seen every question in the main path. Try simulation mode.</p><a class="btn btn-primary" href="#/study?mode=simulation&scope=all">Start a simulation</a>'
      }
    </section>
    ${
      daysLeft !== null
        ? `<section class="card" aria-labelledby="h-date"><h2 id="h-date">Interview date</h2><p class="stat">${daysLeft > 0 ? plural(daysLeft, 'day') : daysLeft === 0 ? 'Today' : 'Passed'}</p><p class="muted">${fmtDate(interview)}${daysLeft > 0 && unmastered > 0 ? `. About ${Math.ceil(unmastered / daysLeft)} new masteries per day would cover all ${unmastered} remaining.` : ''}</p></section>`
        : ''
    }
  </div>
  <section class="section" aria-labelledby="h-paths">
    <h2 id="h-paths">Learning paths</h2>
    <div class="grid-cards">
    ${idx.paths
      .map((p) => {
        const items = p.ids;
        let seen = 0, practiced = 0, mastered = 0;
        const sm = summarize({ cards, questions: items.map((id) => ({ id, cat: id.split('/')[0] })), opts: srsOpts() });
        seen = sm.seen; practiced = sm.practiced; mastered = sm.mastered;
        return `<a class="card" href="#/paths/${p.id}"><h3>${esc(p.title)}</h3>${meter({ mastered, practiced, seen, total: items.length })}<p class="muted" style="margin:0.5rem 0 0">${mastered} mastered · ${practiced} practised · ${items.length} total</p></a>`;
      })
      .join('')}
    </div>
  </section>
  <section class="section" aria-labelledby="h-modes">
    <h2 id="h-modes">Study modes</h2>
    <div class="grid-cards">
      ${Object.entries(MODES)
        .map(([k, m]) => `<a class="card" href="#/study?mode=${k}"><h3>${esc(m.label)}</h3><p class="muted" style="margin:0">${esc(m.desc)}</p></a>`)
        .join('')}
    </div>
  </section>`;
}
