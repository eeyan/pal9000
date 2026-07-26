// Shared quiz engine for weekly sets and the review queue.
// runQuiz(container, questions, {
//   mode: 'week' | 'review', week, shuffle,
//   onAnswer(id, correct, { firstAttempt }), onComplete({ score, total }),
// })
//
// Pedagogy notes (see docs/SPEC.md "As built"):
// - Missed questions are re-asked once at the end of the session, so the last
//   retrieval of an item is never a failure. Score counts first attempts only.
// - NEXT is briefly gated after scenario questions so the self-explanation
//   prompt is a moment, not a label.
// - In review mode options are shuffled and re-lettered to stop position memory.

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const KEY_LETTERS = ['A', 'B', 'C', 'D'];
const THINK_GATE_MS = 2500;
const CLICK_GUARD_MS = 300;

const reducedMotion = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

function localStamp(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function completionStamp(week, at) {
  return `PAL 9000 · WEEK ${String(week).padStart(2, '0')} · COMPLETE · ${localStamp(at)}`;
}

export function runQuiz(container, questions, opts = {}) {
  const total = questions.length;
  const queue = [...questions];
  const state = { i: 0, score: 0, answered: false, requeued: new Set(), renderedAt: 0 };

  container.innerHTML = `
    <div class="quiz-panel">
      <p class="readout mono" aria-live="polite"></p>
      <h2 class="stem" tabindex="-1"></h2>
      <div class="options" role="group" aria-label="Answer options"></div>
      <div class="feedback" aria-live="polite" tabindex="-1"></div>
    </div>`;
  const readoutEl = container.querySelector('.readout');
  const stemEl = container.querySelector('.stem');
  const optionsEl = container.querySelector('.options');
  const feedbackEl = container.querySelector('.feedback');

  let view = [];

  function buildView(q) {
    const shown = q.options.map((o) => ({ ...o }));
    if (opts.shuffle) {
      for (let i = shown.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shown[i], shown[j]] = [shown[j], shown[i]];
      }
    }
    shown.forEach((o, idx) => { o.displayKey = KEY_LETTERS[idx] ?? o.key; });
    return shown;
  }

  function render() {
    const q = queue[state.i];
    view = buildView(q);
    const retry = state.i >= total;

    readoutEl.textContent = `Q ${String(state.i + 1).padStart(2, '0')}/${String(queue.length).padStart(2, '0')}`
      + (opts.mode === 'review' ? ' · REVIEW' : '') + (retry ? ' · RETRY' : '');
    stemEl.textContent = q.stem;
    optionsEl.innerHTML = view.map((o) => `
      <button class="option" data-key="${esc(o.key)}">
        <span class="option-key mono">${esc(o.displayKey)}</span>
        <span class="option-text">${esc(o.text)}</span>
        <span class="sr-only option-state"></span>
      </button>`).join('');
    optionsEl.querySelectorAll('.option').forEach((btn) => {
      btn.addEventListener('click', () => answer(btn.dataset.key));
    });
    feedbackEl.innerHTML = '';

    state.answered = false;
    state.renderedAt = Date.now();
    stemEl.focus();
    stemEl.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function answer(key) {
    if (state.answered || Date.now() - state.renderedAt < CLICK_GUARD_MS) return;
    state.answered = true;

    const q = queue[state.i];
    const correct = key === q.answer;
    const firstAttempt = state.i < total;
    if (correct && firstAttempt) state.score += 1;
    opts.onAnswer?.(q.id, correct, { firstAttempt });

    // Re-ask a missed question once, at the end of this session.
    if (!correct && !state.requeued.has(q.id)) {
      state.requeued.add(q.id);
      queue.push(q);
    }

    const chosen = view.find((o) => o.key === key);
    const right = view.find((o) => o.key === q.answer);

    optionsEl.querySelectorAll('.option').forEach((btn) => {
      btn.disabled = true;
      const stateEl = btn.querySelector('.option-state');
      const chip = btn.querySelector('.option-key');
      if (btn.dataset.key === q.answer) {
        btn.classList.add('is-correct');
        chip.textContent = `✓ ${chip.textContent}`;
        stateEl.textContent = ' (correct answer)';
      } else if (btn.dataset.key === key) {
        btn.classList.add('is-wrong');
        chip.textContent = `✗ ${chip.textContent}`;
        stateEl.textContent = ' (your answer — incorrect)';
      } else {
        btn.classList.add('is-dim');
      }
    });

    const distractorNote = !correct && q.feedback?.[key]
      ? `<p class="fb-distractor"><span class="mono fb-tag">WHY ${esc(chosen.displayKey)} FAILS</span> ${esc(q.feedback[key])}</p>`
      : '';
    const others = view
      .filter((o) => o.key !== q.answer && o.key !== key && q.feedback?.[o.key])
      .map((o) => `<p><span class="mono fb-tag">${esc(o.displayKey)}</span> ${esc(q.feedback[o.key])}</p>`)
      .join('');
    const othersBlock = others
      ? `<details class="others"><summary class="mono">WHY THE OTHER${correct ? 'S' : ' OPTIONS'} FAIL</summary>${others}</details>`
      : '';
    const selfExplain = q.selfExplainPrompt
      ? `<div class="self-explain"><span class="mono fb-tag">THINK IT THROUGH</span><p>${esc(q.selfExplainPrompt)}</p></div>`
      : '';
    const nextLabel = state.i + 1 < queue.length ? 'NEXT QUESTION →' : 'FINISH →';

    feedbackEl.innerHTML = `
      <p class="fb-verdict mono ${correct ? 'ok' : 'no'}">${correct ? 'AFFIRMATIVE.' : "I'M SORRY — THAT'S NOT IT."}</p>
      <p class="fb-correct"><span class="mono fb-tag">CORRECT: ${esc(right.displayKey)}</span> ${esc(q.feedback?.correct ?? '')}</p>
      ${distractorNote}
      ${othersBlock}
      ${selfExplain}
      <button class="btn-next">${nextLabel}</button>`;

    const nextBtn = feedbackEl.querySelector('.btn-next');
    nextBtn.addEventListener('click', next);
    if (q.selfExplainPrompt) {
      nextBtn.disabled = true;
      nextBtn.textContent = 'THINK IT THROUGH…';
      setTimeout(() => {
        nextBtn.disabled = false;
        nextBtn.textContent = nextLabel;
      }, THINK_GATE_MS);
    }
    // Focus the feedback region (not NEXT) so the verdict is read, and the
    // self-explanation prompt isn't a single Enter away from being skipped.
    feedbackEl.focus();
  }

  function next() {
    state.i += 1;
    state.answered = false;
    if (state.i < queue.length) render();
    else finish();
  }

  function finish() {
    const { score } = state;
    const missed = total - score;
    const now = Date.now();
    container.innerHTML = `
      <div class="quiz-panel done-panel">
        <p class="readout mono">${opts.mode === 'review' ? 'REVIEW PASS COMPLETE' : 'SET COMPLETE'}</p>
        <p class="done-score mono">${score}/${total}</p>
        <p class="done-note">${
          opts.mode === 'review'
            ? (missed ? `${missed} item${missed === 1 ? '' : 's'} dropped back to the 1-day step.` : 'Every item climbed a step. Nicely done.')
            : (missed
              ? `You retried ${missed} missed question${missed === 1 ? '' : 's'} just now — ${missed === 1 ? 'it' : 'they'}'ll come back for review in a day or so.`
              : 'Clean sweep on the first pass. These questions will check back in about a week.')
        }</p>
        ${opts.mode === 'week' ? `<p class="done-stamp mono">${esc(completionStamp(opts.week, now))}<br><span class="stamp-note">Screenshot this line to self-report completion. It also stays available on this week's page.</span></p>` : ''}
        <p><a class="btn-next" href="/">← MISSION SELECT</a></p>
      </div>`;
    opts.onComplete?.({ score, total, at: now });
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    const inScope = active === document.body || container.contains(active);

    if (e.key === 'Enter') {
      if (!state.answered || !inScope) return;
      const btn = container.querySelector('.btn-next');
      if (btn && !btn.disabled && active !== btn) {
        e.preventDefault();
        btn.click();
      }
      return;
    }

    const q = queue[state.i];
    if (!q || state.answered || !inScope) return;
    const byNum = { 1: 0, 2: 1, 3: 2, 4: 3 }[e.key];
    const target = byNum !== undefined
      ? view[byNum]
      : view.find((o) => o.displayKey.toLowerCase() === e.key.toLowerCase());
    if (target) answer(target.key);
  }
  document.addEventListener('keydown', onKey);

  render();
}
