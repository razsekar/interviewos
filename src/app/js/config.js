// Location-independent paths: everything is derived from this module's own URL, so the app works
// at a domain root or any sub-path (e.g. GitHub Pages /repo-name/) without configuration.
export const ROOT = new URL('../../', import.meta.url).href; // .../<site root>/
export const APP_VERSION = '1.0.0';
export const MODES = {
  sequential: { label: 'Sequential', desc: 'Work through a topic or path in learning order, starting at the first question you have not seen.' },
  random: { label: 'Random', desc: 'Shuffled questions from your chosen scope. Good for testing recall without order cues.' },
  rapid: { label: 'Rapid-fire', desc: 'Short Revision answers with a countdown. Fast loops for last-minute refreshes.' },
  simulation: { label: 'Interview simulation', desc: 'Questions are asked with a timer and answers stay hidden. You review them all at the end.' },
  revision: { label: 'Revision', desc: 'Only questions that are due for review, most overdue first.' },
  audio: { label: 'Audio', desc: 'Listen to questions and answers with your browser voice. Nothing plays until you press play.' },
  bookmarked: { label: 'Bookmarked', desc: 'Your bookmarked questions in the order you saved them.' },
};
export const STYLES = { detailed: 'Detailed', quick: 'Quick Read', revision: 'Short Revision' };
