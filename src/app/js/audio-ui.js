// Audio controls shared by the question page and study sessions. Speech only starts from a user click or key press.
import { supported, createPlayer, getVoices, onVoicesChanged, htmlToSpeech } from './audio.js';
import { getPrefs, setPrefs } from './store.js';
import { loadDetail } from './data.js';
import { esc, announce } from './util.js';

const strip = (s) => String(s).replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');

export async function answerText(q, style, withTitle = true) {
  let body;
  if (style === 'quick') body = strip(q.quick);
  else if (style === 'revision') body = strip(q.revision);
  else {
    try {
      body = htmlToSpeech(await loadDetail(q.id));
    } catch {
      body = strip(q.quick);
    }
  }
  return withTitle ? `${q.title} ${body}` : body;
}

export function audioControlsHtml() {
  if (!supported) {
    return `<section class="card section" aria-labelledby="h-audio" style="max-width:46rem"><h2 id="h-audio" style="font-size:1.15rem">Listen</h2><p class="muted" style="margin:0">Read-aloud is not available in this browser. The text answer above is always available.</p></section>`;
  }
  const p = getPrefs();
  return `<section class="card section" aria-labelledby="h-audio" style="max-width:46rem">
    <h2 id="h-audio" style="font-size:1.15rem">Listen</h2>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
      <button type="button" class="btn btn-primary" id="audio-toggle" aria-describedby="audio-state">▶ Play</button>
      <button type="button" class="btn" id="audio-skip" disabled>Skip sentence</button>
      <button type="button" class="btn" id="audio-stop" disabled>Stop</button>
      <span class="kbd" aria-hidden="true">R</span>
    </div>
    <div class="grid-cards" style="gap:0.75rem;margin-top:0.75rem">
      <div class="field" style="margin:0"><label for="audio-rate">Speed</label><select id="audio-rate">${[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => `<option value="${r}"${r === p.rate ? ' selected' : ''}>${r}×</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="audio-voice">Voice</label><select id="audio-voice"><option value="">Browser default</option></select></div>
    </div>
    <p class="muted" id="audio-state" role="status" style="margin:0.5rem 0 0">Stopped. Nothing plays until you press Play.</p>
  </section>`;
}

/** Wire controls inside `root`. `getText` may return a string or a promise. Returns a stop() cleanup. */
export function bindAudioControls(root, signal, getText, { onStart } = {}) {
  if (!supported) return () => {};
  const $ = (s) => root.querySelector(s);
  const toggle = $('#audio-toggle');
  if (!toggle) return () => {};
  const stateEl = $('#audio-state');
  const player = createPlayer((state) => {
    toggle.textContent = state === 'playing' ? '⏸ Pause' : state === 'paused' ? '▶ Resume' : '▶ Play';
    $('#audio-skip').disabled = state === 'idle';
    $('#audio-stop').disabled = state === 'idle';
    stateEl.textContent = state === 'playing' ? 'Playing.' : state === 'paused' ? 'Paused.' : 'Stopped. Nothing plays until you press Play.';
  });
  const fillVoices = () => {
    const sel = $('#audio-voice');
    if (!sel) return;
    const cur = getPrefs().voice;
    sel.innerHTML = '<option value="">Browser default</option>' + getVoices().map((v) => `<option value="${esc(v.voiceURI)}"${v.voiceURI === cur ? ' selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('');
  };
  fillVoices();
  const off = onVoicesChanged(fillVoices);
  toggle.addEventListener(
    'click',
    async () => {
      if (player.state === 'playing') return player.pause();
      if (player.state === 'paused') return player.resume();
      const text = await getText();
      onStart?.();
      player.play(text, { rate: getPrefs().rate, voiceURI: getPrefs().voice });
    },
    { signal },
  );
  $('#audio-skip').addEventListener('click', () => player.skip(), { signal });
  $('#audio-stop').addEventListener('click', () => (player.stop(), announce('Audio stopped')), { signal });
  $('#audio-rate').addEventListener('change', (e) => {
    setPrefs({ rate: Number(e.target.value) });
    player.setOptions({ rate: getPrefs().rate });
    player.restartChunk();
  }, { signal });
  $('#audio-voice').addEventListener('change', (e) => {
    setPrefs({ voice: e.target.value });
    player.setOptions({ voiceURI: e.target.value });
    player.restartChunk();
  }, { signal });
  signal.addEventListener('abort', () => {
    off();
    player.stop();
  });
  return () => player.stop();
}
