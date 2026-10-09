/* Progressive enhancement for public pages: theme toggle, answer-style control, offline cache registration. */
(function () {
  var KEY = 'interviewos:prefs';
  var root = new URL('../', document.currentScript.src);

  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writePref(k, v) {
    try { var p = readPrefs(); p[k] = v; localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* Theme: system -> light -> dark */
  var btn = document.getElementById('theme-toggle');
  if (btn) {
    var label = function () {
      var t = readPrefs().theme || 'system';
      btn.textContent = 'Theme: ' + t;
      btn.setAttribute('aria-label', 'Colour theme: ' + t + '. Activate to change.');
    };
    label();
    btn.addEventListener('click', function () {
      var order = ['system', 'light', 'dark'];
      var cur = readPrefs().theme || 'system';
      var next = order[(order.indexOf(cur) + 1) % 3];
      writePref('theme', next);
      if (next === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', next);
      label();
    });
  }

  /* Answer-style segmented control on question pages */
  var seg = document.getElementById('style-seg');
  if (seg) {
    var sections = document.querySelectorAll('.style-section');
    var apply = function (style) {
      sections.forEach(function (s) { s.hidden = s.getAttribute('data-style') !== style; });
      seg.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-style') === style));
      });
    };
    var saved = readPrefs().style;
    apply(['detailed', 'quick', 'revision'].indexOf(saved) >= 0 ? saved : 'detailed');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-style]');
      if (!b) return;
      writePref('style', b.getAttribute('data-style'));
      apply(b.getAttribute('data-style'));
    });
  }

  /* Offline: register the service worker (same scope as the app) */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(new URL('sw.js', root).href, { scope: root.pathname }).catch(function () {});
    });
  }
})();
