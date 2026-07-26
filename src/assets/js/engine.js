// Shared quiz engine for weekly sets and the review queue.
// runQuiz(container, questions, { mode, week, onAnswer(id, correct), onComplete({score, total}) })

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export function runQuiz(container, questions, opts = {}) {
  const state = { i: 0, score: 0, answered: false };

  function render() {
    const q = questions[state.i];
    container.innerHTML = `
      <div class="quiz-panel">
        <p class="readout mono" aria-live="polite">Q ${String(state.i + 1).padStart(2, '0')}/${String(questions.length).padStart(2, '0')}${opts.mode === 'review' ? ' · REVIEW' : ''}</p>
        <h2 class="stem">${esc(q.stem)}</h2>
        <div class="options" role="group" aria-label="Answer options">
          ${q.options.map((o) => `
            <button class="option" data-key="${esc(o.key)}">
              <span class="option-key mono">${esc(o.key)}</span>
              <span class="option-text">${esc(o.text)}</span>
            </button>`).join('')}
        </div>
        <div class="feedback" aria-live="polite"></div>
      </div>`;

    container.querySelectorAll('.option').forEach((btn) => {
      btn.addEventListener('click', () => answer(btn.dataset.key));
    });
  }

  function answer(key) {
    if (state.answered) return;
    state.answered = true;

    const q = questions[state.i];
    const correct = key === q.answer;
    if (correct) state.score += 1;
    opts.onAnswer?.(q.id, correct);

    container.querySelectorAll('.option').forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.key === q.answer) btn.classList.add('is-correct');
      else if (btn.dataset.key === key) btn.classList.add('is-wrong');
      else btn.classList.add('is-dim');
    });

    const fb = container.querySelector('.feedback');
    const distractorNote = !correct && q.feedback?.[key]
      ? `<p class="fb-distractor"><span class="mono fb-tag">WHY ${esc(key)} FAILS</span> ${esc(q.feedback[key])}</p>`
      : '';
    const selfExplain = q.selfExplainPrompt
      ? `<div class="self-explain"><span class="mono fb-tag">THINK IT THROUGH</span><p>${esc(q.selfExplainPrompt)}</p></div>`
      : '';
    fb.innerHTML = `
      <p class="fb-verdict mono ${correct ? 'ok' : 'no'}">${correct ? 'AFFIRMATIVE.' : "I'M SORRY — THAT'S NOT IT."}</p>
      <p class="fb-correct">${esc(q.feedback?.correct ?? '')}</p>
      ${distractorNote}
      ${selfExplain}
      <button class="btn-next">${state.i + 1 < questions.length ? 'NEXT QUESTION' : 'FINISH'} →</button>`;
    fb.querySelector('.btn-next').addEventListener('click', next);
    fb.querySelector('.btn-next').focus();
  }

  function next() {
    state.i += 1;
    state.answered = false;
    if (state.i < questions.length) {
      render();
      container.querySelector('.stem')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else {
      finish();
    }
  }

  function finish() {
    const { score } = state;
    const total = questions.length;
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const missed = total - score;
    container.innerHTML = `
      <div class="quiz-panel done-panel">
        <p class="readout mono">${opts.mode === 'review' ? 'REVIEW PASS COMPLETE' : 'SET COMPLETE'}</p>
        <p class="done-score mono">${score}/${total}</p>
        <p class="done-note">${
          opts.mode === 'review'
            ? (missed ? `${missed} question${missed === 1 ? '' : 's'} dropped back to the start of the ladder.` : 'Every item climbed the ladder. Nicely done.')
            : (missed ? `${missed} missed question${missed === 1 ? '' : 's'} added to your review queue — due tomorrow.` : 'Clean sweep — nothing enters the review queue.')
        }</p>
        ${opts.mode === 'week' ? `<p class="done-stamp mono">PAL 9000 · WEEK ${String(opts.week).padStart(2, '0')} · ${score}/${total} · ${esc(stamp)}<br><span class="foot-dim">Screenshot this line to self-report completion.</span></p>` : ''}
        <p><a class="btn-next" href="/">← MISSION SELECT</a></p>
      </div>`;
    opts.onComplete?.({ score, total });
  }

  function onKey(e) {
    if (e.key === 'Enter' && state.answered) {
      const btn = container.querySelector('.btn-next');
      if (btn && document.activeElement !== btn) { e.preventDefault(); btn.click(); }
      return;
    }
    const q = questions[state.i];
    if (!q || state.answered) return;
    const byNum = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    const key = byNum !== undefined ? q.options[byNum]?.key
      : q.options.find((o) => o.key.toLowerCase() === e.key.toLowerCase())?.key;
    if (key) answer(key);
  }
  document.addEventListener('keydown', onKey);

  render();
}
