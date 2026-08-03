import { completionStamp } from './engine.js';
import { load, save, loadReviewState, KEYS } from './storage.js';
import { queueSize } from './scheduler.js';
import { makeBackup, parseBackup } from './backup.js';

// theme.js is a classic (non-module) script, so its key is duplicated here.
const THEME_KEY = 'pal9000.theme';

const weeks = JSON.parse(document.getElementById('weeks-data').textContent);
const pad2 = (n) => String(n).padStart(2, '0');

const el = (id) => document.getElementById(id);
const strip = el('status-strip');
const logBody = el('log-body');
const backupMsg = el('backup-msg');
const resetMsg = el('reset-msg');

function say(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle('err', isError);
}

// ---------- render ----------

function completedWeeks() {
  const progress = load(KEYS.progress, {});
  return weeks.filter((w) => progress[w]);
}

function render() {
  const progress = load(KEYS.progress, {});
  const done = completedWeeks();
  const queued = queueSize(loadReviewState());
  const lastAt = Math.max(0, ...done.map((w) => progress[w].at));
  const last = lastAt
    ? new Date(lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—';

  strip.innerHTML = `<span><span class="v">${done.length}/${weeks.length}</span> WEEKS COMPLETE</span>`
    + `<span class="sep">·</span><span><span class="v">${queued}</span> IN REVIEW QUEUE</span>`
    + `<span class="sep">·</span><span>LAST ACTIVITY <span class="v">${last}</span></span>`;
  strip.hidden = false;

  if (done.length === 0) {
    logBody.textContent = 'No completed weeks yet — finish a week’s question set and it will appear here.';
    logBody.classList.add('empty');
  } else {
    logBody.classList.remove('empty');
    logBody.innerHTML = weeks.map((w) => (progress[w]
      ? `<span class="ok" aria-hidden="true">■</span> ${completionStamp(w, progress[w].at)}`
      : `<span class="off">□ WEEK ${pad2(w)} · NOT YET COMPLETE</span>`)).join('<br>');
  }
}

function logText() {
  const progress = load(KEYS.progress, {});
  return weeks.map((w) => (progress[w]
    ? completionStamp(w, progress[w].at)
    : `WEEK ${pad2(w)} · NOT YET COMPLETE`)).join('\n');
}

// ---------- completion log ----------

el('copy-log').addEventListener('click', async () => {
  const btn = el('copy-log');
  try {
    await navigator.clipboard.writeText(logText());
    btn.textContent = 'COPIED ✓';
  } catch {
    btn.textContent = 'COPY FAILED';
  }
  setTimeout(() => { btn.textContent = 'COPY AS TEXT'; }, 2000);
});

// ---------- backup & restore ----------

function downloadBackup() {
  const backup = makeBackup(loadReviewState(), load(KEYS.progress, {}), Date.now());
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const a = document.createElement('a');
  a.href = url;
  a.download = `pal9000-backup-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

el('export-btn').addEventListener('click', () => {
  downloadBackup();
  say(backupMsg, 'Backup saved to your downloads.');
});

let pendingImport = null;

el('import-btn').addEventListener('click', () => el('import-file').click());

el('import-file').addEventListener('change', async () => {
  const input = el('import-file');
  const file = input.files[0];
  input.value = ''; // allow re-choosing the same file
  if (!file) return;
  say(backupMsg, '');
  try {
    pendingImport = parseBackup(await file.text());
  } catch (err) {
    pendingImport = null;
    say(backupMsg, err.message, true);
    return;
  }
  const nDone = Object.keys(pendingImport.progress).length;
  const nQueue = Object.keys(pendingImport.review.items).length;
  const saved = pendingImport.exportedAt
    ? ` (saved ${new Date(pendingImport.exportedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })})`
    : '';
  el('import-confirm-text').innerHTML = `<span class="strong">Replace this device’s data with this backup?</span><br>`
    + `It contains ${nDone} completed ${nDone === 1 ? 'week' : 'weeks'} and ${nQueue} review ${nQueue === 1 ? 'item' : 'items'}${saved}. `
    + 'What’s currently on this device will be overwritten.';
  el('import-confirm').hidden = false;
  el('import-replace').focus();
});

el('import-replace').addEventListener('click', () => {
  if (!pendingImport) return;
  save(KEYS.review, pendingImport.review);
  save(KEYS.progress, pendingImport.progress);
  const nDone = Object.keys(pendingImport.progress).length;
  const nQueue = Object.keys(pendingImport.review.items).length;
  pendingImport = null;
  el('import-confirm').hidden = true;
  render();
  say(backupMsg, `Restored — ${nDone} ${nDone === 1 ? 'week' : 'weeks'} complete, ${nQueue} in review.`);
});

el('import-cancel').addEventListener('click', () => {
  pendingImport = null;
  el('import-confirm').hidden = true;
  el('import-btn').focus();
});

// ---------- reset ----------

el('clear-queue-btn').addEventListener('click', () => {
  say(resetMsg, '');
  el('reset-confirm').hidden = true;
  const n = queueSize(loadReviewState());
  el('clear-confirm-text').innerHTML = '<span class="strong">Clear the review queue?</span><br>'
    + `${n} ${n === 1 ? 'item' : 'items'} will stop coming back for spaced review. Your completion records are kept.`;
  el('clear-confirm').hidden = false;
  el('clear-yes').focus();
});

el('clear-yes').addEventListener('click', () => {
  save(KEYS.review, { items: {} });
  el('clear-confirm').hidden = true;
  render();
  say(resetMsg, 'Review queue cleared.');
});

el('clear-cancel').addEventListener('click', () => {
  el('clear-confirm').hidden = true;
  el('clear-queue-btn').focus();
});

el('full-reset-btn').addEventListener('click', () => {
  say(resetMsg, '');
  el('clear-confirm').hidden = true;
  const done = completedWeeks();
  const detail = done.length
    ? `This deletes your completion ${done.length === 1 ? 'record' : 'records'} for ${done.length === 1 ? 'week' : 'weeks'} ${done.join(', ')}, with no undo. You can download a backup first.`
    : 'This erases your review queue and saved settings on this device, with no undo.';
  el('reset-confirm-text').innerHTML = `<span class="strong">Erase everything on this device?</span><br>${detail}`;
  el('reset-backup').hidden = done.length === 0;
  el('reset-confirm').hidden = false;
  (done.length ? el('reset-backup') : el('reset-yes')).focus();
});

el('reset-backup').addEventListener('click', () => {
  downloadBackup();
  say(resetMsg, 'Backup saved to your downloads.');
});

el('reset-yes').addEventListener('click', () => {
  try {
    localStorage.removeItem(KEYS.review);
    localStorage.removeItem(KEYS.progress);
    localStorage.removeItem(THEME_KEY);
    // In-progress quiz sessions (engine.js resume state) count as "everything" too.
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('pal9000.session:')) sessionStorage.removeItem(key);
    }
  } catch { /* private mode — nothing stored anyway */ }
  el('reset-confirm').hidden = true;
  render();
  say(resetMsg, 'All data on this device has been erased.');
});

el('reset-cancel').addEventListener('click', () => {
  el('reset-confirm').hidden = true;
  el('full-reset-btn').focus();
});

render();
