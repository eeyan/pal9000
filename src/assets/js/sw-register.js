// Offline support is progressive enhancement — registration failure is fine.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* no-op */ });
    // Ask the browser not to evict our storage under pressure. Chromium
    // (Android) grants this for engaged/installed sites and it protects the
    // review ladder + completion records; elsewhere it's a harmless no-op.
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () { /* no-op */ });
    }
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
  // Subway service flaps between stations, and screen readers often deliver
  // polite regions immediately anyway. Settle for two seconds before saying
  // anything; a bounce inside the window resolves to one final state and
  // produces no announcement at all if it landed back where it started.
  var SETTLE_MS = 2000;

  var timer = null;
  // The markup ships the online string, so that is the state already applied.
  var applied = false;

  function isOffline() {
    // navigator.onLine only ever reports "no network stack" reliably; treat
    // anything but an explicit false as online.
    return navigator.onLine === false;
  }

  // The element is a role="status" live region: only textContent and classes
  // change here. Never aria-hidden — hiding a live region unregisters it.
  function apply(offline) {
    if (offline === applied) return;
    applied = offline;
    el.classList.toggle('offline', offline);
    if (head) head.classList.toggle('offline', offline);
    el.textContent = offline ? OFFLINE_TEXT : ONLINE_TEXT;
  }

  function settle() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      apply(isOffline());
    }, SETTLE_MS);
  }

  apply(isOffline()); // initial sync: no debounce, nothing to announce yet
  window.addEventListener('online', settle);
  window.addEventListener('offline', settle);
})();
