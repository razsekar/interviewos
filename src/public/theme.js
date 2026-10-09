/* Runs before first paint: applies the saved theme and flags JS availability. No network, no tracking. */
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('interviewos:prefs') || '{}');
    if (p.theme === 'light' || p.theme === 'dark') document.documentElement.setAttribute('data-theme', p.theme);
  } catch (e) {}
  document.documentElement.classList.add('js');
})();
