import { loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { getPrefs, setPrefs } from '../store.js';
import { advance, summarizeSession, createSession } from '../session.js';
import { MODES, STYLES } from '../config.js';
import { RATING_LABEL, formatInterval } from '../srs.js';
import { esc, announce, isTyping, fmtDuration, debounce, fmtInline } from '../util.js';
import { qChips, statusChip, bookmarkBtn, bindBookmarks, styleSeg, answerBody, ratingRow, qStatus } from '../ui.js';
import { audioControlsHtml, bindAudioControls, answerText } from '../audio-ui.js';

export async function render({ main, signal, go }) {
  const sess = repo.activeSession();
  if (!sess) {
    go('#/study');
    return;
  }
  document.title = `${MODES[sess.mode]?.label || 'Study'} session | InterviewOS`;
  const all = await loadAllQuestions();
  const byId = new Map(all.map((q) => [q.id, q]));
  sess.queue = sess.queue.filter((id) => byId.has(id)); // content may have changed since the session was saved
  if (sess.index >= sess.queue.length && sess.phase !== 'done') {
    sess.index = Math.max(0, sess.queue.length - 1);
  }

  let revealed = false;
  let timer = null;
  let shownAt = Date.now();
  let stopAudio = () => {};
  let drawing = 0;
  let style = sess.cfg?.style || getPrefs().style;
  const sim = sess.mode === 'simulation';

  const clearTimer = () => timer && (clearInterval(timer), (timer = null));
  signal.addEventListener('abort', () => {
    clearTimer();
    stopAudio();
  });
  const save = () => repo.saveSession(sess);
  const cur = () => byId.get(sess.queue[sess.index]);
  const hasAnswer = () => (sim && sess.phase === 'ask' ? false : true);
  const readOnly = (id) => sess.ratings[id] != null;

  function header() {
    const n = sess.queue.length;
    const label = sim ? (sess.phase === 'ask' ? 'Answering' : 'Reviewing answers') : MODES[sess.mode]?.label;
    return `<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
      <span class="chip chip-brand">${esc(label)}</span>
      <span id="pos" class="muted">Question ${Math.min(sess.index + 1, n)} of ${n}</span>
      <progress max="${n}" value="${Math.min(sess.index, n)}" aria-label="Session progress" style="flex:1;min-width:8rem"></progress>
      <button type="button" class="btn btn-sm" id="exit">Pause and exit</button>
    </div>`;
  }

  const shortcuts = `<details class="muted" style="margin-top:1.5rem"><summary style="cursor:pointer;min-height:2.5rem;display:flex;align-items:center">Keyboard shortcuts</summary><p style="margin:0.4rem 0">${
    sim && sess.phase === 'ask' ? '<span class="kbd">→</span> next · <span class="kbd">←</span> previous · <span class="kbd">B</span> bookmark · <span class="kbd">Esc</span> pause' : '<span class="kbd">Space</span> show answer · <span class="kbd">1</span>–<span class="kbd">4</span> Again/Hard/Good/Easy · <span class="kbd">←</span><span class="kbd">→</span> previous/next · <span class="kbd">B</span> bookmark · <span class="kbd">R</span> read aloud · <span class="kbd">Esc</span> stop audio or pause'
  }</p></details>`;

  async function draw() {
    const my = ++drawing;
    clearTimer();
    stopAudio();
    stopAudio = () => {};
    if (sess.phase === 'done' || !sess.queue.length) return drawDone();
    const q = cur();
    const id = q.id;
    shownAt = Date.now();
    const rated = readOnly(id);
    const reviewing = sim && sess.phase === 'review';
    if (reviewing && !sess.seen[id]) {
      sess.seen[id] = true;
      repo.markExposure(id);
    }
    const showA = hasAnswer() && (revealed || rated || reviewing || sess.mode === 'audio');
    let body = `${header()}<article aria-labelledby="sq">
      <p class="eyebrow">${esc(q.cat)} · ${esc(q.topic)}</p>
      <h1 id="sq" class="study-q" tabindex="-1" style="margin:0.25rem 0 0.75rem">${esc(q.title)}</h1>
      <div class="chips" style="margin-bottom:1rem">${qChips(q)}<span>${statusChip(id)}</span>${bookmarkBtn(id)}</div>`;

    if (sim && sess.phase === 'ask') {
      const secs = sess.cfg.seconds || 120;
      body += `<div class="card" style="max-width:46rem"><p style="margin-top:0"><strong>Answer out loud or in notes.</strong> The reference answer stays hidden until you have been through every question.</p>
        <p>Time left: <strong id="clock" role="timer" aria-live="off">${fmtClock(secs)}</strong> <span id="clock-note" class="muted"></span></p>
        <div class="field"><label for="notes">Your notes (optional, saved on this device only)</label><textarea id="notes">${esc(sess.notes[id] || '')}</textarea></div>
        <button type="button" class="btn btn-primary" id="finish">${sess.index === sess.queue.length - 1 ? 'Finish and review answers' : 'Finish answer and continue'}</button></div>`;
    } else {
      if (sim && sess.notes[id]) body += `<section class="card" style="max-width:46rem;margin-bottom:1rem"><h2 style="font-size:1rem;margin:0 0 0.4rem">Your notes</h2><p style="white-space:pre-wrap;margin:0">${esc(sess.notes[id])}</p></section>`;
      if (sess.mode === 'audio') body += audioControlsHtml();
      if (!showA) {
        body += `<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="reveal">Show answer <span class="kbd" aria-hidden="true">Space</span></button>${sess.mode === 'rapid' ? `<span class="muted">Answer shows in <strong id="clock">${sess.cfg.seconds || 20}</strong>s</span>` : ''}</div>`;
      } else {
        body += `<div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;margin:0.5rem 0 1rem">${sess.mode === 'rapid' ? '' : styleSeg(style)}</div><section id="answer" aria-label="Answer" style="max-width:46rem"><p class="muted">Loading answer…</p></section>`;
        if (sess.mode !== 'audio') {
          body += rated
            ? `<p class="callout" style="max-width:46rem;margin-top:1rem">You rated this <strong>${RATING_LABEL[sess.ratings[id]]}</strong> in this session.</p>`
            : `<div style="max-width:46rem;margin-top:1.25rem"><h2 style="font-size:1.05rem">How well did you recall it?</h2>${ratingRow(id)}</div>`;
        }
        if (q.followUps?.length) body += `<details style="max-width:46rem;margin-top:1rem"><summary style="cursor:pointer;min-height:2.5rem;display:flex;align-items:center;font-weight:600">Likely follow-ups</summary><ul style="padding-left:1.3rem;list-style:disc">${q.followUps.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>`;
      }
    }
    body += `<nav aria-label="Move between questions" style="display:flex;justify-content:space-between;gap:0.75rem;margin-top:1.5rem;flex-wrap:wrap"><button type="button" class="btn" id="prev"${sess.index === 0 ? ' disabled' : ''}>← Previous</button><button type="button" class="btn" id="next">${sess.index === sess.queue.length - 1 ? (sim && sess.phase === 'ask' ? 'Finish' : 'Finish session') : 'Skip →'}</button></nav></article>${shortcuts}`;
    if (my !== drawing) return;
    main.innerHTML = body;
    main.querySelector('#sq')?.focus({ preventScroll: true });

    if (showA && my === drawing) {
      const slot = main.querySelector('#answer');
      const html = await answerBody(q, style);
      if (my !== drawing) return;
      slot.innerHTML = html;
    }
    if (sess.mode === 'audio') {
      stopAudio = bindAudioControls(main, signal, () => answerText(q, style), { onStart: () => repo.markExposure(id) });
    }
    // timers
    if (sim && sess.phase === 'ask') startCountdown(sess.cfg.seconds || 120, () => {
      const n = main.querySelector('#clock-note');
      if (n) n.textContent = 'Time is up: wrap up your answer.';
      announce('Time is up for this question.');
    });
    if (sess.mode === 'rapid' && !showA) startCountdown(sess.cfg.seconds || 20, () => reveal(true), true);
  }

  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  function startCountdown(seconds, onZero, plain = false) {
    let left = seconds;
    timer = setInterval(() => {
      left--;
      const el = main.querySelector('#clock');
      if (el) el.textContent = plain ? String(Math.max(left, 0)) : fmtClock(Math.max(left, 0));
      if (left <= 0) {
        clearTimer();
        onZero();
      }
    }, 1000);
  }

  async function reveal(auto = false) {
    if (!hasAnswer() || revealed) return;
    revealed = true;
    const id = cur().id;
    sess.seen[id] = true;
    await repo.markExposure(id);
    await save();
    await draw();
    if (auto) announce('Time is up. Answer shown.');
  }

  async function next() {
    const phaseBefore = sess.phase;
    advance(sess);
    revealed = false;
    if (sess.done) await repo.pruneSessions();
    await save();
    if (phaseBefore === 'ask' && sess.phase === 'review') announce('All questions asked. Now review the answers.');
    await draw();
  }
  async function prev() {
    if (sess.index === 0) return;
    sess.index--;
    revealed = !!sess.seen[cur().id];
    await save();
    await draw();
  }

  async function rate(r) {
    const q = cur();
    const canRate = hasAnswer() && sess.mode !== 'audio' && (revealed || (sim && sess.phase === 'review'));
    if (readOnly(q.id) || !canRate) return;
    const card = await repo.rate(q.id, r, { mode: sess.mode, style });
    sess.ratings[q.id] = r;
    sess.times[q.id] = Date.now() - shownAt;
    announce(`Rated ${RATING_LABEL[r]}. Next review in ${formatInterval(card.due - Date.now())}.`);
    await next();
  }

  function drawDone() {
    clearTimer();
    const s = summarizeSession(sess);
    document.title = 'Session complete | InterviewOS';
    const rows = sess.queue.map((id) => byId.get(id)).filter(Boolean);
    main.innerHTML = `<h1 tabindex="-1" style="font-size:clamp(1.6rem,3.5vw,2.2rem)">Session complete</h1>
    <p class="muted">${esc(MODES[sess.mode]?.label || sess.mode)} · ${fmtDuration(s.elapsedMs)} since start</p>
    <div class="grid-cards" style="margin:1rem 0">
      <div class="card"><p class="stat">${s.rated}<span class="muted" style="font-size:1rem;font-weight:500"> / ${s.total}</span></p><p class="muted" style="margin:0">rated${s.skipped ? `, ${s.skipped} skipped` : ''}</p></div>
      ${[1, 2, 3, 4].map((r) => `<div class="card"><p class="stat">${s.counts[r]}</p><p class="muted" style="margin:0">${RATING_LABEL[r]}</p></div>`).join('')}
    </div>
    ${sess.mode === 'audio' ? '<p class="muted">Listening counts as exposure only. Rate questions in a study mode to schedule reviews.</p>' : ''}
    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:1.5rem">
      ${s.again.length ? `<button type="button" class="btn btn-primary" id="redo">Practise the ${s.again.length} you found hard</button>` : ''}
      <a class="btn" href="#/study">New session</a><a class="btn" href="#/">Dashboard</a><a class="btn" href="#/progress">Progress</a>
    </div>
    <h2 style="font-size:1.15rem">Questions in this session</h2>
    <div class="qlist">${rows.map((q) => `<div class="qrow"><div><h3><a href="#/q/${esc(q.id)}">${esc(q.title)}</a></h3></div><div>${sess.ratings[q.id] ? `<span class="chip">${RATING_LABEL[sess.ratings[q.id]]}</span>` : '<span class="chip">Skipped</span>'}</div></div>`).join('')}</div>`;
    main.querySelector('h1').focus();
    announce('Session complete');
  }

  // ----- events (delegated; the DOM inside main is re-rendered on every step) -----
  main.addEventListener(
    'click',
    async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'reveal') await reveal();
      else if (t.id === 'next') await next();
      else if (t.id === 'prev') await prev();
      else if (t.id === 'finish') await finishAnswer();
      else if (t.id === 'exit') go('#/study');
      else if (t.id === 'redo') {
        const ns = createSession({ mode: 'random', scope: 'again', queue: summarizeSession(sess).again, cfg: { style } });
        await repo.saveSession(ns);
        location.reload();
      } else if (t.dataset.rate) await rate(Number(t.dataset.rate));
      else if (t.dataset.style) {
        style = t.dataset.style;
        sess.cfg.style = style;
        setPrefs({ style });
        await save();
        main.querySelectorAll('#style-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
        const slot = main.querySelector('#answer');
        if (slot) slot.innerHTML = await answerBody(cur(), style);
      }
    },
    { signal },
  );
  async function finishAnswer() {
    const q = cur();
    sess.times[q.id] = Date.now() - shownAt;
    await next();
  }
  const saveNotes = debounce(() => save(), 400);
  main.addEventListener(
    'input',
    (e) => {
      if (e.target.id === 'notes') {
        sess.notes[cur().id] = e.target.value.slice(0, 5000);
        saveNotes();
      }
    },
    { signal },
  );
  bindBookmarks(main, signal);

  document.addEventListener(
    'keydown',
    async (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target) && e.key !== 'Escape') return;
      if (!getPrefs().shortcuts && e.key !== 'Escape') return;
      if (sess.phase === 'done') return;
      const k = e.key;
      if (k === ' ' && !e.target.closest('button, a, summary')) {
        if (hasAnswer() && !revealed && !readOnly(cur().id) && sess.mode !== 'audio') {
          e.preventDefault();
          await reveal();
        }
      } else if (k === 'ArrowRight') await next();
      else if (k === 'ArrowLeft') await prev();
      else if (['1', '2', '3', '4'].includes(k)) await rate(Number(k));
      else if (k === 'b' || k === 'B') main.querySelector('[data-bm]')?.click();
      else if (k === 'r' || k === 'R') main.querySelector('#audio-toggle')?.click();
      else if (k === 'Escape') {
        const stop = main.querySelector('#audio-stop');
        if (stop && !stop.disabled) stop.click();
        else go('#/study');
      }
    },
    { signal },
  );

  await draw();
}
