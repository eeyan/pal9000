import { runQuiz, completionStamp } from './engine.js';
import { load, save, loadReviewState, loadName, saveName, KEYS } from './storage.js';
import { recordMiss, recordSuccess } from './scheduler.js';
import { signCompletion, NAME_MAX } from './completion.js';

const container = document.getElementById('quiz');
const questions = JSON.parse(document.getElementById('question-data').textContent);
const week = Number(container.dataset.week);

// "9/11 · 0WDNEA-KZ1F20 · Ian Anderson" — the reportable half of a stamp.
function codeLine(rec) {
  return `${rec.score}/${rec.total} · ${rec.code ?? 'UNSIGNED'} · ${rec.name || '(no name)'}`;
}

// Recoverable self-report stamp: if this week was completed before, show the
// reportable line above the quiz so navigating away never loses it.
const prev = load(KEYS.progress, {})[week];
if (prev) {
  container.insertAdjacentHTML('beforebegin', `
    <div class="stamp-banner">
      <p class="mono stamp-line"></p>
      <p class="mono stamp-code"></p>
      <p class="stamp-note">Completed with ${prev.score}/${prev.total}. Retake anytime — a lower score never replaces your record.</p>
    </div>`);
  document.querySelector('.stamp-banner .stamp-line').textContent = completionStamp(week, prev.at);
  document.querySelector('.stamp-banner .stamp-code').textContent = codeLine(prev);
}

function start(name) {
  runQuiz(container, questions, {
    mode: 'week',
    week,
    onAnswer(id, correct, { firstAttempt }) {
      const state = loadReviewState();
      if (!correct) save(KEYS.review, recordMiss(state, id, Date.now()));
      else if (firstAttempt) save(KEYS.review, recordSuccess(state, id, Date.now()));
    },
    async onComplete({ score, total, at }) {
      const rec = { score, total, at, name };
      try {
        rec.code = await signCompletion({ week, at, score, total, name });
      } catch {
        // No Web Crypto (insecure context) — record stays unsigned rather than lost.
      }
      const progress = load(KEYS.progress, {});
      const best = progress[week];
      const keep = !best || score >= best.score;
      if (keep) {
        progress[week] = rec;
        save(KEYS.progress, progress);
      }
      // The finish screen shows the record ON FILE — after a lower retake
      // that's the earlier, better one, code and all.
      const onFile = keep ? rec : best;
      const line = container.querySelector('.done-stamp .stamp-line');
      const code = container.querySelector('.done-stamp .stamp-code');
      if (line) line.textContent = completionStamp(week, onFile.at);
      if (code) code.textContent = codeLine(onFile);
    },
  });
}

// Name gate: a completion code is only useful if it's bound to a name, so
// the first set on a device asks once. Stored locally, never sent.
function nameGate() {
  container.innerHTML = `
    <div class="quiz-panel name-gate">
      <p class="readout mono">IDENTIFY YOURSELF</p>
      <h2 class="stem" tabindex="-1">Before your first set: what’s your name?</h2>
      <p class="done-note">Enter it as it appears in Brightspace. It stays on this device only and is printed on your completion log — every completion code is tied to it, which is what lets you hand in one log per set instead of weekly screenshots. Spelling matters; capitalization doesn’t.</p>
      <form class="name-form" id="name-form">
        <label class="sr-only" for="name-input">Your name</label>
        <input class="name-input" id="name-input" type="text" autocomplete="name" maxlength="${NAME_MAX}" required autocapitalize="words" enterkeyhint="go">
        <button class="btn-next" type="submit">BEGIN →</button>
      </form>
    </div>`;
  const form = container.querySelector('#name-form');
  const input = container.querySelector('#name-input');
  input.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const clean = saveName(input.value);
    if (!clean) {
      input.focus();
      return;
    }
    start(clean);
  });
}

const name = loadName();
if (name) start(name);
else nameGate();
