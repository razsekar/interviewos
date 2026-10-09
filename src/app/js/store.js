// Preferences live in LocalStorage (preferences only). Everything else is in IndexedDB.
import { sanitizePrefs } from './backup-core.js';
import { DEFAULT_LADDER } from './srs.js';

export const PREF_KEY = 'interviewos:prefs';
export const DEFAULT_PREFS = {
  theme: 'system', style: 'detailed', rate: 1, voice: '', ladder: [...DEFAULT_LADDER], masteryDays: 14,
  shortcuts: true, simSeconds: 120, rapidSeconds: 20,
};
let prefs = { ...DEFAULT_PREFS };
const listeners = new Set();

try {
  prefs = { ...DEFAULT_PREFS, ...sanitizePrefs(JSON.parse(localStorage.getItem(PREF_KEY) || '{}')) };
} catch {
  /* storage blocked or corrupt: defaults */
}

export const getPrefs = () => prefs;
export function setPrefs(patch) {
  prefs = { ...prefs, ...sanitizePrefs({ ...prefs, ...patch }) };
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  applyTheme();
  listeners.forEach((f) => f(prefs));
}
export const onPrefs = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export function applyTheme() {
  const r = document.documentElement;
  if (prefs.theme === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', prefs.theme);
}
export const srsOpts = () => ({ ladder: prefs.ladder, masteryDays: prefs.masteryDays });
