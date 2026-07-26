import { runQuiz } from './engine.js';
import { load, save, KEYS } from './storage.js';
import { emptyState, prune, dueIds, queueSize, recordReviewResult } from './scheduler.js';

const container = document.getElementById('quiz');
const weeks = JSON.parse(document.getElementById('bank-data').textContent);
const byId = new Map(weeks.flatMap((w) => w.questions.map((q) => [q.id, q])));

let state = prune(load(KEYS.review, emptyState()), [...byId.keys()]);
save(KEYS.review, state);

const due = dueIds(state, Date.now());

if (due.length === 0) {
  const waiting = queueSize(state);
  container.innerHTML = `
    <div class="quiz-panel done-panel">
      <p class="readout mono">QUEUE CLEAR</p>
      <p class="done-note">${
        waiting
          ? `Nothing due right now — ${waiting} item${waiting === 1 ? '' : 's'} scheduled for later. Come back tomorrow.`
          : 'Nothing in the queue. Miss a question in a weekly set and it lands here.'
      }</p>
      <p><a class="btn-next" href="/">← MISSION SELECT</a></p>
    </div>`;
} else {
  runQuiz(container, due.map((id) => byId.get(id)), {
    mode: 'review',
    onAnswer(id, correct) {
      state = recordReviewResult(state, id, correct, Date.now());
      save(KEYS.review, state);
    },
  });
}
