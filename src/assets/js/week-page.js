import { runQuiz, completionStamp } from './engine.js';
import { load, save, loadReviewState, KEYS } from './storage.js';
import { recordMiss, recordSuccess } from './scheduler.js';

const container = document.getElementById('quiz');
const questions = JSON.parse(document.getElementById('question-data').textContent);
const week = Number(container.dataset.week);

// Recoverable self-report stamp: if this week was completed before, show the
// reportable line above the quiz so navigating away never loses it.
const prev = load(KEYS.progress, {})[week];
if (prev) {
  container.insertAdjacentHTML('beforebegin', `
    <div class="stamp-banner">
      <p class="mono stamp-line"></p>
      <p class="stamp-note">Completed with ${prev.score}/${prev.total}. Retake anytime — a lower score never replaces your record.</p>
    </div>`);
  document.querySelector('.stamp-banner .stamp-line').textContent = completionStamp(week, prev.at);
}

runQuiz(container, questions, {
  mode: 'week',
  week,
  onAnswer(id, correct, { firstAttempt }) {
    const state = loadReviewState();
    if (!correct) save(KEYS.review, recordMiss(state, id, Date.now()));
    else if (firstAttempt) save(KEYS.review, recordSuccess(state, id, Date.now()));
  },
  onComplete({ score, total, at }) {
    const progress = load(KEYS.progress, {});
    const best = progress[week];
    if (!best || score >= best.score) progress[week] = { score, total, at };
    save(KEYS.progress, progress);
  },
});
