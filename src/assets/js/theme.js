// Theme bootstrap + toggle. Loaded as a blocking classic script in <head> so
// the theme lands on <html> before first paint (no flash of wrong theme).
// Stored choice wins; otherwise follow the OS preference.
(function () {
  var KEY = 'pal9000.theme';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.dataset.theme = theme;

  function paint(btn) {
    var dark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = dark ? '☀ LIGHT' : '☾ DARK';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    paint(btn);
    btn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) { /* non-fatal */ }
      paint(btn);
    });
  });
})();
