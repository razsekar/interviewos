// Read-aloud with the browser's built-in speech synthesis. Never starts on its own: only play() starts speech.
export const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

export function getVoices() {
  return supported ? speechSynthesis.getVoices().filter((v) => v.lang) : [];
}
export function onVoicesChanged(fn) {
  if (!supported) return () => {};
  speechSynthesis.addEventListener('voiceschanged', fn);
  return () => speechSynthesis.removeEventListener('voiceschanged', fn);
}

/** Split into short chunks (some browsers cut off long utterances) on sentence boundaries. */
export function chunkText(text, max = 220) {
  const sentences = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [];
  const out = [];
  let cur = '';
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if ((cur + ' ' + s).trim().length <= max) cur = (cur + ' ' + s).trim();
    else {
      if (cur) out.push(cur);
      if (s.length <= max) cur = s;
      else {
        const parts = s.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) || [s];
        out.push(...parts.slice(0, -1).map((p) => p.trim()));
        cur = parts.at(-1).trim();
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Plain speakable text from a pre-rendered detail fragment: skips code, tables and diagrams. */
export function htmlToSpeech(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('pre, figure, .table-wrap, svg').forEach((n) => n.remove());
  const parts = [];
  doc.body.querySelectorAll('h2, h3, p, li').forEach((n) => {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (t) parts.push(/[.!?:]$/.test(t) ? t : t + '.');
  });
  return parts.join(' ');
}

export function createPlayer(onState = () => {}) {
  let chunks = [];
  let i = 0;
  let state = 'idle';
  let opts = { rate: 1, voiceURI: '' };
  let token = 0;
  const set = (s) => {
    state = s;
    onState(s, { index: i, total: chunks.length });
  };
  const speakCurrent = () => {
    if (i >= chunks.length) return set('idle');
    const my = token;
    const u = new SpeechSynthesisUtterance(chunks[i]);
    u.rate = opts.rate;
    const v = getVoices().find((x) => x.voiceURI === opts.voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.onend = () => {
      if (my !== token) return;
      i++;
      speakCurrent();
    };
    u.onerror = (e) => {
      if (my !== token || e.error === 'interrupted' || e.error === 'canceled') return;
      set('idle');
    };
    speechSynthesis.speak(u);
    set('playing');
  };
  return {
    get state() {
      return state;
    },
    play(text, o = {}) {
      if (!supported) return;
      opts = { ...opts, ...o };
      token++;
      speechSynthesis.cancel();
      chunks = chunkText(text);
      i = 0;
      speakCurrent();
    },
    pause() {
      if (state === 'playing') {
        speechSynthesis.pause();
        set('paused');
      }
    },
    resume() {
      if (state === 'paused') {
        speechSynthesis.resume();
        set('playing');
      }
    },
    /** Skip to the next sentence-sized chunk. */
    skip() {
      if (state === 'idle') return;
      token++;
      speechSynthesis.cancel();
      i++;
      if (i >= chunks.length) return set('idle');
      speakCurrent();
    },
    setOptions(o) {
      opts = { ...opts, ...o };
    },
    /** Apply a changed rate/voice by restarting the current chunk. */
    restartChunk() {
      if (state === 'idle') return;
      token++;
      speechSynthesis.cancel();
      speakCurrent();
    },
    stop() {
      token++;
      if (supported) speechSynthesis.cancel();
      chunks = [];
      i = 0;
      set('idle');
    },
  };
}
