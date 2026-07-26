import { runQuiz } from './engine.js';
import { load, save, KEYS } from './storage.js';
import { emptyState, recordMiss } from './scheduler.js';

const container = document.getElementById('quiz');
const questions = JSON.parse(document.getElementById('question-data').textContent);
const week = Number(container.dataset.week);

runQuiz(container, questions, {
  mode: 'week',
  week,
  onAnswer(id, correct) {
    if (correct) return;
    const state = load(KEYS.review, emptyState());
    save(KEYS.review, recordMiss(state, id, Date.now()));
  },
  onComplete({ score, total }) {
    const progress = load(KEYS.progress, {});
    progress[week] = { score, total, at: Date.now() };
    save(KEYS.progress, progress);
  },
});
