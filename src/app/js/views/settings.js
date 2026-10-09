import * as repo from '../repo.js';
import { getPrefs, setPrefs, DEFAULT_PREFS } from '../store.js';
import { sanitizeLadder } from '../srs.js';
import { loadIndex, downloadAllForOffline } from '../data.js';
import { canInstall, onInstallAvailable, promptInstall, requestPersistence, storageEstimate } from '../pwa.js';
import { APP_VERSION, STYLES } from '../config.js';
import { esc, toast, announce, download, plural } from '../util.js';
import { pageHead, confirmDialog } from '../ui.js';

const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

export async function render({ main, signal }) {
  document.title = 'Settings | InterviewOS';
  const idx = await loadIndex();
  const p = getPrefs();
  const persistent = repo.isPersistent();
  const goalDaily = repo.getGoal('daily', 10);
  const interview = repo.getGoal('interviewDate', null);
  const dateStr = interview ? new Date(interview).toISOString().slice(0, 10) : '';

  main.innerHTML = `${pageHead('Settings', 'Preferences are stored in LocalStorage; progress, bookmarks and goals in IndexedDB. Both stay on this device.')}
  ${persistent ? '' : '<div class="banner" role="alert" style="margin-bottom:1rem"><span>Persistent storage is unavailable, so progress will be lost when you close this tab. Export a backup below.</span></div>'}
  <div style="display:grid;gap:1.25rem;max-width:46rem;grid-template-columns:minmax(0,1fr)">
  <section class="card" aria-labelledby="h-app"><h2 id="h-app">Appearance and study</h2>
    <div class="field"><label for="p-theme">Theme</label><select id="p-theme">${['system', 'light', 'dark'].map((t) => `<option value="${t}"${p.theme === t ? ' selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
    <div class="field"><label for="p-style">Default answer style</label><select id="p-style">${Object.entries(STYLES).map(([k, l]) => `<option value="${k}"${p.style === k ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="hint">Detailed is the default. The choice is remembered when you switch styles anywhere.</span></div>
    <div class="check"><input type="checkbox" id="p-keys"${p.shortcuts ? ' checked' : ''}><label for="p-keys">Keyboard shortcuts in study and question pages</label></div>
  </section>
  <section class="card" aria-labelledby="h-srs"><h2 id="h-srs">Spaced repetition</h2>
    <div class="field"><label for="p-ladder">Review ladder (days, comma separated)</label><input type="text" id="p-ladder" value="${esc(p.ladder.join(', '))}" aria-describedby="ladder-hint"><span class="hint" id="ladder-hint">2 to 12 increasing values. Good moves up one step, Easy two. Default: ${DEFAULT_PREFS.ladder.join(', ')}. Applies to future reviews.</span><span id="ladder-msg" role="status"></span></div>
    <div class="field"><label for="p-mastery">Mastery threshold (days)</label><input type="number" id="p-mastery" min="1" max="365" value="${p.masteryDays}"><span class="hint">A question counts as mastered when its interval reaches this, with recent Good/Easy ratings.</span></div>
    <div class="field"><label for="p-sim">Simulation seconds per question</label><input type="number" id="p-sim" min="10" max="1800" value="${p.simSeconds}"></div>
    <div class="field"><label for="p-rapid">Rapid-fire seconds before the answer shows</label><input type="number" id="p-rapid" min="5" max="300" value="${p.rapidSeconds}"></div>
    <button type="button" class="btn btn-sm" id="srs-reset">Restore defaults</button>
  </section>
  <section class="card" aria-labelledby="h-goal"><h2 id="h-goal">Goals</h2>
    <div class="field"><label for="g-daily">Daily review goal</label><input type="number" id="g-daily" min="1" max="500" value="${goalDaily}"></div>
    <div class="field"><label for="g-date">Interview date (optional)</label><input type="text" id="g-date" inputmode="numeric" placeholder="YYYY-MM-DD" value="${dateStr}" pattern="\\d{4}-\\d{2}-\\d{2}"><span class="hint">Shows a countdown on the dashboard. Leave empty to remove.</span><span id="date-msg" role="status"></span></div>
  </section>
  <section class="card" aria-labelledby="h-off"><h2 id="h-off">Offline and install</h2>
    <p id="sw-state" class="muted">Checking offline status…</p>
    <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center">
      <button type="button" class="btn" id="dl-all">Download everything for offline use</button>
      <button type="button" class="btn" id="install" hidden>Install app</button>
      <button type="button" class="btn" id="persist">Ask browser to keep my data</button>
    </div>
    <p><progress id="dl-prog" max="1" value="0" hidden aria-label="Download progress" style="width:100%"></progress></p>
    <p id="dl-msg" role="status" class="muted"></p>
    <p id="storage" class="muted"></p>
  </section>
  <section class="card" aria-labelledby="h-bk"><h2 id="h-bk">Backup and restore</h2>
    <p class="muted">A backup is one JSON file with your progress, review history, bookmarks, sessions, goals and preferences. It never includes question text.</p>
    <p><button type="button" class="btn btn-primary" id="export">Export backup</button></p>
    <div class="field"><label for="import-file">Import a backup</label><input type="file" id="import-file" accept="application/json,.json"><span class="hint">The file is validated before anything changes. Merge keeps the newer progress per question and combines histories. Replace overwrites everything on this device.</span></div>
    <div id="import-panel"></div>
  </section>
  <section class="card" aria-labelledby="h-reset"><h2 id="h-reset">Reset</h2><p class="muted">Deletes all progress, bookmarks, sessions and goals on this device. Preferences are kept. Export a backup first if unsure.</p><button type="button" class="btn btn-danger" id="reset">Delete all my progress</button></section>
  <section class="card" aria-labelledby="h-about"><h2 id="h-about">About this build</h2><p class="muted" style="margin:0">InterviewOS ${APP_VERSION} · content build ${esc(idx.buildId)} · ${plural(idx.total, 'question')} · <a href="../methodology/">methodology</a> · <a href="../privacy/">privacy</a> · <a href="../accessibility/">accessibility</a></p></section>
  </div>`;

  const $ = (s) => main.querySelector(s);
  const on = (sel, ev, fn) => $(sel).addEventListener(ev, fn, { signal });

  on('#p-theme', 'change', (e) => setPrefs({ theme: e.target.value }));
  on('#p-style', 'change', (e) => setPrefs({ style: e.target.value }));
  on('#p-keys', 'change', (e) => setPrefs({ shortcuts: e.target.checked }));
  on('#p-ladder', 'change', (e) => {
    const l = sanitizeLadder(e.target.value);
    const raw = e.target.value.split(/[\s,]+/).filter(Boolean);
    const ok = raw.length >= 2 && raw.length <= 12 && JSON.stringify(l) === JSON.stringify([...new Set(raw.map(Number))].sort((a, b) => a - b));
    $('#ladder-msg').textContent = ok ? 'Saved.' : `Not valid: using ${l.join(', ')}.`;
    e.target.value = l.join(', ');
    setPrefs({ ladder: l });
  });
  on('#p-mastery', 'change', (e) => setPrefs({ masteryDays: Number(e.target.value) || 14 }));
  on('#p-sim', 'change', (e) => setPrefs({ simSeconds: Number(e.target.value) || 120 }));
  on('#p-rapid', 'change', (e) => setPrefs({ rapidSeconds: Number(e.target.value) || 20 }));
  on('#srs-reset', 'click', () => {
    setPrefs({ ladder: DEFAULT_PREFS.ladder, masteryDays: 14, simSeconds: 120, rapidSeconds: 20 });
    $('#p-ladder').value = DEFAULT_PREFS.ladder.join(', ');
    $('#p-mastery').value = 14;
    $('#p-sim').value = 120;
    $('#p-rapid').value = 20;
    toast('Defaults restored.');
  });
  on('#g-daily', 'change', async (e) => {
    const n = Math.min(500, Math.max(1, Number(e.target.value) || 10));
    e.target.value = n;
    await repo.setGoal('daily', n);
    toast('Daily goal saved.');
  });
  on('#g-date', 'change', async (e) => {
    const v = e.target.value.trim();
    const msg = $('#date-msg');
    if (!v) {
      await repo.setGoal('interviewDate', null);
      msg.textContent = 'Removed.';
      return;
    }
    const t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(v + 'T09:00:00') : NaN;
    if (Number.isNaN(t)) {
      msg.textContent = 'Use the format YYYY-MM-DD.';
      return;
    }
    await repo.setGoal('interviewDate', t);
    msg.textContent = 'Saved.';
  });

  // offline & install
  const swState = $('#sw-state');
  if (!('serviceWorker' in navigator)) swState.textContent = 'Offline mode is not supported in this browser.';
  else if (!(location.protocol === 'https:' || location.hostname === 'localhost')) swState.textContent = 'Offline mode needs HTTPS (or localhost).';
  else navigator.serviceWorker.ready.then(() => (swState.textContent = 'Offline ready: the app and question lists are saved. Detailed answers you have opened are saved too; use the button below to save all of them.'));
  const syncInstall = () => ($('#install').hidden = !canInstall());
  syncInstall();
  signal.addEventListener('abort', onInstallAvailable(syncInstall));
  on('#install', 'click', async () => {
    const r = await promptInstall();
    if (r) toast(r === 'accepted' ? 'Installing…' : 'Install dismissed.');
  });
  on('#persist', 'click', async () => toast((await requestPersistence()) ? 'Your browser will try to keep this data.' : 'The browser did not grant persistent storage.'));
  const showStorage = async () => {
    const e = await storageEstimate();
    $('#storage').textContent = e ? `Storage used: ${mb(e.usage)} of about ${mb(e.quota)} available to this site.` : '';
  };
  showStorage();
  let dlCtl = null;
  on('#dl-all', 'click', async () => {
    if (dlCtl) return;
    dlCtl = new AbortController();
    const prog = $('#dl-prog');
    prog.hidden = false;
    $('#dl-all').disabled = true;
    try {
      const r = await downloadAllForOffline((done, total, failed) => {
        prog.max = total;
        prog.value = done;
        $('#dl-msg').textContent = `${done} of ${total} answers saved${failed ? `, ${failed} failed` : ''}…`;
      }, dlCtl.signal);
      const msg = r.failed ? `Saved ${r.done - r.failed} of ${r.total}. ${r.failed} failed: check your connection and try again.` : `All ${r.total} detailed answers are saved for offline use.`;
      $('#dl-msg').textContent = msg;
      announce(msg);
    } catch (err) {
      $('#dl-msg').textContent = 'Download failed: ' + err.message;
    } finally {
      $('#dl-all').disabled = false;
      dlCtl = null;
      showStorage();
    }
  });
  signal.addEventListener('abort', () => dlCtl?.abort());

  // backup
  on('#export', 'click', () => {
    download(`interviewos-backup-${new Date().toISOString().slice(0, 10)}.json`, repo.exportBackup());
    toast('Backup downloaded.');
  });
  on('#import-file', 'change', async (e) => {
    const panel = $('#import-panel');
    panel.innerHTML = '';
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return void (panel.innerHTML = '<p role="alert">That file is too large to be a backup.</p>');
    const res = repo.inspectBackup(await f.text());
    if (!res.ok) {
      panel.innerHTML = `<div class="banner" role="alert"><div><strong>This file cannot be imported.</strong><ul style="margin:0.4rem 0 0;padding-left:1.2rem;list-style:disc">${res.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
      return;
    }
    const d = res.data;
    panel.innerHTML = `<div class="card" style="background:var(--surface-2)"><p style="margin-top:0"><strong>Valid backup.</strong> ${plural(d.progress.length, 'question record')}, ${plural(d.reviews.length, 'review')}, ${plural(d.bookmarks.length, 'bookmark')}.</p>
      <div style="display:flex;gap:0.6rem;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="do-merge">Merge into this device</button><button type="button" class="btn btn-danger" id="do-replace">Replace everything</button></div></div>`;
    $('#do-merge').addEventListener('click', async () => {
      const r = await repo.applyBackup(d, 'merge');
      panel.innerHTML = `<p role="status"><strong>Merged.</strong> You now have ${plural(r.progress, 'question record')}, ${plural(r.reviews, 'review')} and ${plural(r.bookmarks, 'bookmark')}.</p>`;
      e.target.value = '';
    });
    $('#do-replace').addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Replace all data?', body: '<p>This overwrites your current progress, bookmarks, sessions, goals and preferences with the backup. It cannot be undone.</p>', confirmLabel: 'Replace', danger: true }))) return;
      const r = await repo.applyBackup(d, 'replace');
      panel.innerHTML = `<p role="status"><strong>Restored.</strong> ${plural(r.progress, 'question record')}, ${plural(r.reviews, 'review')} and ${plural(r.bookmarks, 'bookmark')}.</p>`;
      e.target.value = '';
    });
  });
  on('#reset', 'click', async () => {
    if (!(await confirmDialog({ title: 'Delete all progress?', body: '<p>This removes every progress record, review, bookmark, session and goal from this device. Preferences stay. It cannot be undone.</p>', confirmLabel: 'Delete everything', danger: true }))) return;
    await repo.resetAll();
    toast('All progress deleted.');
    announce('All progress deleted');
  });
}
