import { load, loadReviewState, KEYS } from './storage.js';
import { dueIds, queueSize } from './scheduler.js';

const progress = load(KEYS.progress, {});
document.querySelectorAll('[data-week-status]').forEach((el) => {
  const p = progress[el.dataset.weekStatus];
  if (p) {
    el.textContent = `${p.score}/${p.total} ✓`;
    el.classList.add('ok');
  }
});

// ---------- install hint ----------

// Only worth asking once a student has something to lose, and only where the
// answer is actionable: not already installed, not already waved off.
const INSTALL_HINT_KEY = 'pal9000.installHint.v1';

function isInstalled() {
  return navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

function hintDismissed() {
  try {
    return localStorage.getItem(INSTALL_HINT_KEY) === 'dismissed';
  } catch {
    return false; // private mode — nothing was ever stored
  }
}

const hint = document.getElementById('install-hint');
if (hint && Object.keys(progress).length > 0 && !isInstalled() && !hintDismissed()) {
  hint.hidden = false;
  document.getElementById('install-hint-dismiss').addEventListener('click', () => {
    hint.hidden = true;
    try {
      localStorage.setItem(INSTALL_HINT_KEY, 'dismissed');
    } catch { /* private mode — it'll just ask again next time */ }
  });
}

// ---------- review queue ----------

const review = loadReviewState();
const due = dueIds(review, Date.now()).length;
const total = queueSize(review);
const el = document.getElementById('review-count');
if (total === 0) {
  el.textContent = 'EMPTY';
} else {
  el.textContent = `${due} DUE / ${total}`;
  if (due > 0) el.classList.add('alert');
}
