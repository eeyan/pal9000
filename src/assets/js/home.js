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
