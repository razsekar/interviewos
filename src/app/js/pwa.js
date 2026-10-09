// Service worker registration, update prompt, online/offline indicator and install prompt.
import { ROOT } from './config.js';
import { toast, announce } from './util.js';

let deferredInstall = null;
const installListeners = new Set();

export function canInstall() {
  return !!deferredInstall;
}
export const onInstallAvailable = (fn) => (installListeners.add(fn), () => installListeners.delete(fn));
export async function promptInstall() {
  if (!deferredInstall) return null;
  deferredInstall.prompt();
  const res = await deferredInstall.userChoice;
  deferredInstall = null;
  installListeners.forEach((f) => f());
  return res.outcome;
}

function showUpdateBanner(reg) {
  const el = document.getElementById('update-banner');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = '<div class="banner banner-ok" role="status"><span>A new version of InterviewOS is ready.</span><button type="button" class="btn btn-sm btn-primary" id="do-update">Reload to update</button></div>';
  document.getElementById('do-update').addEventListener('click', () => {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
}

export function initPwa() {
  const net = document.getElementById('net-status');
  const setNet = () => {
    if (!net) return;
    net.hidden = navigator.onLine;
    if (!navigator.onLine) announce('You are offline. Saved content and your progress still work.');
  };
  window.addEventListener('online', setNet);
  window.addEventListener('offline', setNet);
  setNet();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    installListeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    toast('InterviewOS installed.');
    installListeners.forEach((f) => f());
  });

  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost')) return;
  navigator.serviceWorker
    .register(ROOT + 'sw.js', { scope: new URL(ROOT).pathname })
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(reg);
        });
      });
      // look for updates when the app regains focus
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    })
    .catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

/** Ask the browser to keep our storage (progress survives low-disk eviction). Best effort. */
export async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}
