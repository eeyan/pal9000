import { runQuiz } from './engine.js';
import { save, loadReviewState, KEYS } from './storage.js';
import { prune, dueIds, queueSize, recordReviewResult } from './scheduler.js';

const container = document.getElementById('quiz');
const weeks = JSON.parse(document.getElementById('bank-data').textContent);
const byId = new Map(weeks.flatMap((w) => w.questions.map((q) => [q.id, q])));

const initial = prune(loadReviewState(), [...byId.keys()]);
save(KEYS.review, initial);

const due = dueIds(initial, Date.now());

if (due.length === 0) {
  const waiting = queueSize(initial);
  container.innerHTML = `
    <div class="quiz-panel done-panel">
      <p class="readout mono">QUEUE CLEAR</p>
      <p class="done-note">${
        waiting
          ? `Nothing due right now — ${waiting} item${waiting === 1 ? '' : 's'} scheduled for later. Check back in a day or so.`
          : 'Nothing in the queue yet. Complete a weekly set and its questions land here on a spaced schedule.'
      }</p>
      <p><a class="btn-next" href="/">← MISSION SELECT</a></p>
    </div>`;
} else {
  runQuiz(container, due.map((id) => byId.get(id)), {
    mode: 'review',
    shuffle: true,
    onAnswer(id, correct, { firstAttempt }) {
      if (!firstAttempt) return; // in-session retries don't move the ladder
      // Reload before writing so a week quiz in another tab isn't clobbered.
      const state = loadReviewState();
      save(KEYS.review, recordReviewResult(state, id, correct, Date.now()));
    },
  });
}
