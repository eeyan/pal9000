// Offline support is progressive enhancement — registration failure is fine.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* no-op */ });
  });
}
