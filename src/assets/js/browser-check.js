// Where is this page running? Saved progress lives in the browser's own
// storage, and an in-app browser (the web view an email, chat, or LMS app
// opens links in) keeps a separate copy from Safari/Chrome — one the student
// can't get back to once they open PAL the normal way. That looks exactly
// like "my history got deleted", so those pages get a notice up front.
//
// Heuristic by design (user-agent sniffing is all there is): a miss shows no
// notice, a false hit shows an unneeded one. Pure function so it's testable;
// keep it DOM-free.
//
// → true when the page is probably inside another app's embedded browser.
export function inAppBrowser(ua, standalone = false) {
  const s = String(ua ?? '');
  if (standalone) return false; // installed home-screen app: its own durable storage
  // Apps that announce themselves (these keep the Safari/Chrome tokens too).
  if (/\b(FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|MicroMessenger|Snapchat|GSA\/)/.test(s)) return true;
  // Android WebView marks itself with "; wv)".
  if (/Android/.test(s) && /;\s*wv\)/.test(s)) return true;
  // iOS: every real browser (Safari, Chrome, Firefox, Edge) carries a
  // "Safari/" token; a bare WKWebView inside another app does not.
  if (/\b(iPhone|iPad|iPod)\b/.test(s) && /AppleWebKit/.test(s) && !/Safari\//.test(s)) return true;
  return false;
}

function isStandalone() {
  return navigator.standalone === true
    || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}

// Insert the notice at the top of <main> when it applies. No dismiss button:
// it only shows in the one place where saving progress is a trap.
export function warnIfInAppBrowser(doc = document) {
  if (!inAppBrowser(navigator.userAgent, isStandalone())) return false;
  const main = doc.querySelector('main');
  if (!main || doc.querySelector('.inapp-notice')) return false;
  const p = doc.createElement('p');
  p.className = 'inapp-notice';
  p.setAttribute('role', 'note');
  const b = doc.createElement('strong');
  b.textContent = 'You’re viewing PAL inside another app.';
  p.append(b, ' Progress saved here stays inside that app and won’t be there when you open PAL in your regular browser. Open this page in Safari or Chrome (look for “Open in browser” in the menu), and use the same one every time.');
  main.prepend(p);
  return true;
}
