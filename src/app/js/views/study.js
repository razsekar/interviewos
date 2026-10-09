import { loadIndex, loadAllQuestions } from '../data.js';
import * as repo from '../repo.js';
import { getPrefs, srsOpts } from '../store.js';
import { resolveScope, applyFilters } from '../scope.js';
import { buildQueue, createSession } from '../session.js';
import { MODES, STYLES } from '../config.js';
import { esc, cap } from '../util.js';
import { pageHead } from '../ui.js';

export async function render({ main, signal, query, go }) {
  document.title = 'Study | InterviewOS';
  const [idx, all] = await Promise.all([loadIndex(), loadAllQuestions()]);
  const prefs = getPrefs();
  const mode0 = MODES[query.get('mode')] ? query.get('mode') : 'sequential';
  const scope0 = query.get('scope') || (mode0 === 'revision' ? 'due' : mode0 === 'bookmarked' ? 'bookmarks' : query.get('cat') ? 'cat:' + query.get('cat') : 'path:architect-sprint');
  const active = repo.activeSession();

  const scopeOpts = [
    ['all', 'Everything'],
    ['due', 'Due for review'],
    ['weak', 'Weak spots (Again/Hard or repeated lapses)'],
    ['new', 'New: not seen yet'],
    ['bookmarks', 'Bookmarked'],
    ...idx.paths.map((p) => ['path:' + p.id, 'Path: ' + p.title]),
    ...idx.categories.map((c) => ['cat:' + c.id, 'Topic: ' + c.title]),
  ];
  main.innerHTML = `${pageHead('Study', 'Pick a mode and what to study. Sessions save after every answer, so you can leave and resume.')}
  ${active ? `<div class="banner banner-ok" style="margin-bottom:1rem"><span><strong>Session in progress:</strong> ${esc(MODES[active.mode]?.label || active.mode)}, question ${Math.min(active.index + 1, active.queue.length)} of ${active.queue.length}. Starting a new session replaces it.</span><a class="btn btn-sm btn-primary" href="#/session">Resume</a><button type="button" class="btn btn-sm btn-danger" id="discard">Discard</button></div>` : ''}
  <form id="setup" class="card" style="max-width:52rem">
    <fieldset class="field" style="border:0;padding:0;margin:0 0 1rem"><legend>Mode</legend>
      <div class="grid-cards" style="gap:0.6rem">${Object.entries(MODES)
        .map(([k, m]) => `<label class="card" style="cursor:pointer;display:block"><span class="check"><input type="radio" name="mode" value="${k}"${k === mode0 ? ' checked' : ''}><strong>${esc(m.label)}</strong></span><span class="muted" style="display:block;font-size:0.9rem">${esc(m.desc)}</span></label>`)
        .join('')}</div></fieldset>
    <div class="grid-cards" style="gap:0.75rem">
      <div class="field"><label for="s-scope">What to study</label><select id="s-scope">${scopeOpts.map(([v, l]) => `<option value="${esc(v)}"${v === scope0 ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="s-diff">Difficulty</label><select id="s-diff"><option value="">Any</option>${['beginner', 'intermediate', 'advanced'].map((d) => `<option value="${d}">${cap(d)}</option>`).join('')}</select></div>
      <div class="field"><label for="s-type">Type</label><select id="s-type"><option value="">Any</option>${['conceptual', 'comparison', 'scenario', 'design', 'coding'].map((d) => `<option value="${d}">${cap(d)}</option>`).join('')}</select></div>
      <div class="field"><label for="s-count">Number of questions</label><select id="s-count">${[5, 10, 20, 50, 0].map((n) => `<option value="${n}"${n === 10 ? ' selected' : ''}>${n || 'All in scope'}</option>`).join('')}</select></div>
      <div class="field" id="style-field"><label for="s-style">Answer style when revealed</label><select id="s-style">${Object.entries(STYLES).map(([k, l]) => `<option value="${k}"${k === prefs.style ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field" id="sim-field" hidden><label for="s-sim">Seconds per question</label><input type="number" id="s-sim" min="10" max="1800" value="${prefs.simSeconds}"><span class="hint">Simulation hides answers until you have answered every question.</span></div>
      <div class="field" id="rapid-field" hidden><label for="s-rapid">Seconds before the answer shows</label><input type="number" id="s-rapid" min="5" max="300" value="${prefs.rapidSeconds}"></div>
    </div>
    <div id="setup-msg" role="alert" class="muted"></div>
    <button type="submit" class="btn btn-primary">Start session</button>
  </form>`;

  const $ = (s) => main.querySelector(s);
  const modeNow = () => main.querySelector('input[name=mode]:checked').value;
  const syncFields = () => {
    const m = modeNow();
    $('#sim-field').hidden = m !== 'simulation';
    $('#rapid-field').hidden = m !== 'rapid';
    $('#style-field').hidden = m === 'rapid';
    if (m === 'revision' && !['due', 'weak'].includes($('#s-scope').value) && !$('#s-scope').dataset.touched) $('#s-scope').value = 'due';
    if (m === 'bookmarked') $('#s-scope').value = 'bookmarks';
  };
  syncFields();
  $('#s-scope').addEventListener('change', (e) => (e.target.dataset.touched = '1'), { signal });
  main.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', syncFields, { signal }));
  $('#discard')?.addEventListener('click', async () => {
    await repo.deleteSession(active.sid);
    go('#/study');
    location.reload();
  }, { signal });

  $('#setup').addEventListener(
    'submit',
    async (e) => {
      e.preventDefault();
      const mode = modeNow();
      const scope = $('#s-scope').value;
      const cards = repo.allCards();
      let list = resolveScope(scope, { questions: all, index: idx, cards, bookmarkIds: repo.bookmarkIds(), opts: srsOpts() });
      list = applyFilters(list, { difficulty: $('#s-diff').value, type: $('#s-type').value, cards, opts: srsOpts() });
      const msg = $('#setup-msg');
      if (!list.length) {
        msg.textContent = scope === 'due' ? 'Nothing is due for review right now. Pick another scope, or learn something new first.' : 'No questions match those choices. Try a wider scope or fewer filters.';
        return;
      }
      const count = Number($('#s-count').value);
      const queue = buildQueue(mode, list, { cards, count, opts: srsOpts() });
      const cfg = { style: mode === 'rapid' ? 'revision' : mode === 'simulation' && $('#s-style').value === 'detailed' ? 'quick' : $('#s-style').value, seconds: mode === 'simulation' ? Number($('#s-sim').value) : Number($('#s-rapid').value) };
      if (active) await repo.deleteSession(active.sid);
      await repo.saveSession(createSession({ mode, scope, queue, cfg }));
      go('#/session');
    },
    { signal },
  );
}
