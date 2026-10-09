// App entry: hash router + boot. Views are lazy-loaded ES modules.
import { applyTheme } from './store.js';
import * as repo from './repo.js';
import { initPwa } from './pwa.js';
import { announce, esc } from './util.js';

applyTheme();

const routes = [
  [/^\/?$/, () => import('./views/home.js')],
  [/^\/paths$/, () => import('./views/paths.js')],
  [/^\/paths\/([a-z0-9-]+)$/, () => import('./views/paths.js'), ['id']],
  [/^\/bank$/, () => import('./views/bank.js')],
  [/^\/q\/([a-z0-9-]+)\/([a-z0-9-]+)$/, () => import('./views/question.js'), ['cat', 'slug']],
  [/^\/study$/, () => import('./views/study.js')],
  [/^\/session$/, () => import('./views/session.js')],
  [/^\/revision$/, () => import('./views/revision.js')],
  [/^\/progress$/, () => import('./views/progress.js')],
  [/^\/settings$/, () => import('./views/settings.js')],
];

const main = document.getElementById('main');
let cleanup = null;
let ctrl = null;
let first = true;
let renderToken = 0;

export function go(hash) {
  location.hash = hash;
}

function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(qs) };
}

async function route() {
  const token = ++renderToken;
  cleanup?.();
  ctrl?.abort();
  cleanup = null;
  ctrl = new AbortController();
  const { path, query } = parse();
  let loader = null;
  let params = {};
  for (const [re, load, names = []] of routes) {
    const m = path.match(re);
    if (m) {
      loader = load;
      names.forEach((n, i) => (params[n] = m[i + 1]));
      break;
    }
  }
  document.querySelectorAll('#app-nav a').forEach((a) => {
    const h = a.getAttribute('data-route').replace('#', '');
    const on = h === '/' ? path === '/' : path === h || path.startsWith(h + '/') || (h === '/bank' && path.startsWith('/q/'));
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });
  main.innerHTML = '<p class="muted" role="status">Loading…</p>';
  if (!loader) {
    main.innerHTML = '<h1 tabindex="-1">Page not found</h1><p>That app page does not exist. <a href="#/">Go to the dashboard</a>.</p>';
    document.title = 'Not found | InterviewOS';
    return;
  }
  try {
    const mod = await loader();
    if (token !== renderToken) return;
    const result = await mod.render({ main, signal: ctrl.signal, params, query, go });
    if (token !== renderToken) return result?.();
    cleanup = result || null;
  } catch (err) {
    console.error(err);
    main.innerHTML = `<h1 tabindex="-1">Something went wrong</h1><div class="banner" role="alert"><span>${esc(err.message || 'Unknown error')}</span></div><p><a href="#/">Back to the dashboard</a></p>`;
    document.title = 'Error | InterviewOS';
  }
  if (!first) {
    const h = main.querySelector('h1');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: false });
    }
    announce(document.title.replace(' | InterviewOS', ''));
  }
  first = false;
  window.scrollTo(0, 0);
}

export async function boot() {
  initPwa();
  let persistent = true;
  try {
    ({ persistent } = await repo.init());
  } catch (e) {
    console.error(e);
    persistent = false;
  }
  if (!persistent) {
    const b = document.getElementById('update-banner');
    b.hidden = false;
    b.innerHTML = '<div class="banner" role="alert"><span><strong>Progress will not be saved.</strong> Your browser blocked persistent storage (private mode?). You can still study; export a backup from Settings before closing.</span></div>';
  }
  window.addEventListener('hashchange', route);
  await route();
}
boot();
