import { runQuiz, completionStamp } from './engine.js';
import { load, save, loadReviewState, loadName, saveName, KEYS } from './storage.js';
import { recordMiss, recordSuccess } from './scheduler.js';
import { signCompletion, NAME_MAX, buildLog, logText } from './completion.js';
import { SETS, setHeading } from './sets.js';
import { warnIfInAppBrowser } from './browser-check.js';

warnIfInAppBrowser();

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
if (prev && !prev.code) {
  container.insertAdjacentHTML('beforebegin', `
    <div class="stamp-banner">
      <p class="mono stamp-line"></p>
      <p class="stamp-note">Completed with ${prev.score}/${prev.total} but no completion code — sign it with your name on SYSTEMS, or retake it.</p>
    </div>`);
  document.querySelector('.stamp-banner .stamp-line').textContent = completionStamp(week, prev.at);
} else if (prev) {
  container.insertAdjacentHTML('beforebegin', `
    <div class="stamp-banner">
      <p class="mono stamp-line"></p>
      <p class="mono stamp-code"></p>
      <p class="stamp-note">Completed with ${prev.score}/${prev.total}. Retake anytime — a lower score never replaces your record.</p>
    </div>`);
  document.querySelector('.stamp-banner .stamp-line').textContent = completionStamp(week, prev.at);
  document.querySelector('.stamp-banner .stamp-code').textContent = codeLine(prev);
}

// Finish-screen nudge: the record just written lives only in this browser,
// and browsers do lose it (Safari clears a site's storage after a week away;
// an in-app browser or a different device never had it). The completion log
// is self-verifying text, so a copy kept anywhere else is a full safety net
// for the hand-in — make saving one a single tap, right when it's fresh.
function offerSaveCopy() {
  const panel = container.querySelector('.done-panel');
  if (!panel || panel.querySelector('.save-copy')) return;
  const text = () => logText(buildLog(SETS, load(KEYS.progress, {}), loadName(), setHeading));

  const box = document.createElement('div');
  box.className = 'save-copy';
  box.innerHTML = `
    <p class="save-copy-note"><strong>Save a copy now.</strong> This record is stored only in this browser, and browsers sometimes clear saved data. Copy your completion log and paste it into a note or an email to yourself — if this device ever loses it, the saved text is still good to hand in.</p>
    <div class="act">
      <button class="btn-ghost" type="button" data-save="copy">COPY COMPLETION LOG</button>
    </div>
    <p class="status-msg" aria-live="polite"></p>`;
  const act = box.querySelector('.act');
  const msg = box.querySelector('.status-msg');
  const copyBtn = box.querySelector('[data-save="copy"]');

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text());
      copyBtn.textContent = 'COPIED ✓';
      msg.classList.remove('err');
      msg.textContent = 'Copied. Paste it somewhere you’ll find it later.';
    } catch {
      msg.classList.add('err');
      msg.textContent = 'Could not reach the clipboard — copy it from SYSTEMS instead.';
    }
  });

  // Phones: the share sheet goes straight to Notes / Mail / Messages, which
  // is fewer steps than copy → switch apps → paste.
  if (typeof navigator.share === 'function') {
    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'btn-ghost';
    shareBtn.dataset.save = 'share';
    shareBtn.textContent = 'SEND TO NOTES / EMAIL…';
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: 'PAL 9000 completion log', text: text() });
      } catch { /* dismissed the sheet — nothing to report */ }
    });
    act.append(shareBtn);
  }

  const back = [...panel.children].find((c) => c.querySelector?.('a.btn-next'));
  panel.insertBefore(box, back ?? null);
}

function start(name) {
  runQuiz(container, questions, {
    mode: 'week',
    week,
    // Retakes count (best score is kept), so option order must not be
    // memorizable between attempts. Same shuffle + re-lettering as review.
    shuffle: true,
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
      // A signed record always replaces an unsigned one (pre-code completions
      // have no hand-in value); otherwise a lower score never replaces.
      const keep = !best || !best.code || score >= best.score;
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
      const note = container.querySelector('.done-stamp .stamp-note');
      if (note && !keep) {
        note.prepend(`Your earlier ${best.score}/${best.total} stays on file — this is that record. `);
      } else if (note && !rec.code) {
        note.textContent = 'This completion could not be signed (no secure connection), so it is recorded without a code. Sign it with your name on SYSTEMS, or retake it on a normal connection.';
      }
      offerSaveCopy();
    },
  });
}

// Name gate: a completion code is only useful if it's bound to a name, so
// the first set on a device asks once. Stored locally, never sent.
function nameGate() {
  container.innerHTML = `
    <div class="quiz-panel name-gate">
      <p class="readout mono">IDENTIFY YOURSELF</p>
      <h2 class="stem">What’s your name?</h2>
      <p class="done-note">As it appears in Brightspace. It’s saved on this device only and goes on your completion log — every completion code is tied to it. Spelling matters; capitalization doesn’t.</p>
      <form class="name-form" id="name-form" novalidate>
        <label class="paste-label" for="name-input">Your name</label>
        <div class="name-row">
          <input class="name-input" id="name-input" type="text" autocomplete="name" maxlength="${NAME_MAX}" required autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go">
          <button class="btn-next" type="submit">BEGIN →</button>
        </div>
      </form>
      <p class="status-msg err" id="gate-msg" aria-live="polite"></p>
    </div>`;
  const form = container.querySelector('#name-form');
  const input = container.querySelector('#name-input');
  input.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const clean = saveName(input.value);
    if (!clean) {
      container.querySelector('#gate-msg').textContent = 'Type your name to begin.';
      input.focus();
      return;
    }
    start(clean);
  });
}

// Shared phone or lab machine: make it obvious whose name the record will
// carry before a single question is answered.
function showSigningAs(name) {
  const p = document.createElement('p');
  p.className = 'signing-as mono';
  p.append('SIGNING AS ');
  const b = document.createElement('strong');
  b.textContent = name;
  p.append(b, ' · ');
  const a = document.createElement('a');
  a.href = '/systems/';
  a.textContent = 'NOT YOU?';
  p.append(a);
  container.before(p);
}

const name = loadName();
if (name) {
  showSigningAs(name);
  start(name);
} else {
  nameGate();
}
