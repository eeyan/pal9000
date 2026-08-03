// Offline support is progressive enhancement — registration failure is fine.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* no-op */ });
  });
}

// Connectivity readout in the header. Students study on the subway, so the
// header says out loud that the site is still running from the cache.
// Classic script, deferred — the header exists by the time this runs.
(function () {
  var el = document.querySelector('.head-status');
  if (!el) return;

  var head = el.parentElement; // .site-head — lets the header wrap when offline
  var ONLINE_TEXT = el.textContent;
  var OFFLINE_TEXT = 'OFFLINE — RUNNING FROM MEMORY';

  function sync() {
    // navigator.onLine only ever reports "no network stack" reliably; treat
    // anything but an explicit false as online.
    var offline = navigator.onLine === false;
    if (offline) {
      // Unhide before the text swap so the live region actually announces it.
      el.setAttribute('aria-hidden', 'false');
      el.classList.add('offline');
      if (head) head.classList.add('offline');
      el.textContent = OFFLINE_TEXT;
    } else {
      el.textContent = ONLINE_TEXT;
      el.classList.remove('offline');
      if (head) head.classList.remove('offline');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
})();
