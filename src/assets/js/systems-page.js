import { load, save, loadReviewState, loadName, saveName, KEYS } from './storage.js';
import { queueSize } from './scheduler.js';
import { makeBackup, parseBackup } from './backup.js';
import { buildLog, logText, cleanName, CODE_RE } from './completion.js';
import { SETS, setHeading } from './sets.js';

// theme.js is a classic (non-module) script, so its key is duplicated here.
const THEME_KEY = 'pal9000.theme';
// engine.js namespaces per-week quiz resume state under this prefix.
const SESSION_PREFIX = 'pal9000.session:';

const pad2 = (n) => String(n).padStart(2, '0');

const el = (id) => document.getElementById(id);
const strip = el('status-strip');
const logBody = el('log-body');
const backupMsg = el('backup-msg');
const resetMsg = el('reset-msg');
const nameMsg = el('name-msg');
const nameInput = el('name-input');

function say(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle('err', isError);
}

// ---------- render ----------

function completedWeeks() {
  const progress = load(KEYS.progress, {});
  return SETS.flatMap((s) => s.weeks).filter((w) => progress[w]);
}

function currentRows() {
  return buildLog(SETS, load(KEYS.progress, {}), loadName(), setHeading);
}

const ROW_CLASS = { header: 'hdr', name: 'nm', set: 'set', done: 'ok', pending: 'off' };

function render() {
  const progress = load(KEYS.progress, {});
  const done = completedWeeks();
  const queued = queueSize(loadReviewState());
  const lastAt = Math.max(0, ...done.map((w) => progress[w].at));
  const last = lastAt
    ? new Date(lastAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—';

  strip.innerHTML = SETS.map((s) => {
    const n = s.weeks.filter((w) => progress[w]).length;
    return `<span><span class="v">${n}/${s.weeks.length}</span> SET ${s.set}</span>`;
  }).join('<span class="sep">·</span>')
    + `<span class="sep">·</span><span><span class="v">${queued}</span> IN REVIEW QUEUE</span>`
    + `<span class="sep">·</span><span>LAST ACTIVITY <span class="v">${last}</span></span>`;
  strip.hidden = false;

  nameInput.value = loadName();

  if (done.length === 0) {
    logBody.textContent = 'No completed weeks yet — finish a week’s question set and it will appear here.';
    logBody.classList.add('empty');
  } else {
    logBody.classList.remove('empty');
    const list = document.createElement('ul');
    list.className = 'log-list';
    for (const r of currentRows()) {
      // textContent, never innerHTML: the name is student-typed text.
      const li = document.createElement('li');
      li.className = `row ${ROW_CLASS[r.kind]}`;
      // Keep the code on one line so a phone screenshot never splits it.
      const parts = r.text.split(' ');
      parts.forEach((word, i) => {
        if (CODE_RE.test(word)) {
          const c = document.createElement('span');
          c.className = 'code';
          c.textContent = word;
          li.append(c);
        } else {
          li.append(word);
        }
        if (i < parts.length - 1) li.append(' ');
      });
      list.append(li);
    }
    logBody.replaceChildren(list);
  }
}

// ---------- name ----------

el('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const before = loadName();
  const clean = saveName(nameInput.value);
  nameInput.value = clean;
  render();
  if (!clean) say(nameMsg, before ? 'Name cleared. You’ll be asked for it again before your next week.' : 'Enter a name first.', !before);
  else if (clean === before) say(nameMsg, 'Name unchanged.');
  else say(nameMsg, `Saved. New completions will be signed as ${clean}.`);
});

// ---------- completion log ----------

el('copy-log').addEventListener('click', async () => {
  const btn = el('copy-log');
  try {
    await navigator.clipboard.writeText(logText(currentRows()));
    btn.textContent = 'COPIED ✓';
  } catch {
    btn.textContent = 'COPY FAILED';
  }
  setTimeout(() => { btn.textContent = 'COPY AS TEXT'; }, 2000);
});

// ---------- backup & restore ----------

function backupText() {
  return JSON.stringify(makeBackup(loadReviewState(), load(KEYS.progress, {}), Date.now(), loadName()), null, 2);
}

function downloadBackup() {
  const blob = new Blob([backupText()], { type: 'application/json' });
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

// Second export transport: installed iOS apps can't be trusted to complete a
// blob download, and their storage is separate from Safari's — the clipboard
// is the reliable bridge between the two.
el('copy-backup-btn').addEventListener('click', async () => {
  const btn = el('copy-backup-btn');
  try {
    await navigator.clipboard.writeText(backupText());
    btn.textContent = 'COPIED ✓';
    say(backupMsg, 'Backup copied. On the other device, choose PASTE BACKUP and paste it in.');
  } catch {
    btn.textContent = 'COPY FAILED';
    say(backupMsg, 'Could not reach the clipboard — use DOWNLOAD BACKUP instead.', true);
  }
  setTimeout(() => { btn.textContent = 'COPY BACKUP'; }, 2000);
});

let pendingImport = null;
let importReturnFocus = 'import-btn';

// Both import transports (file picker, pasted text) funnel through here, so
// they share one validation pass and one replace-confirm panel.
// Returns true when the backup parsed and the confirm panel is showing.
function offerImport(text, returnFocusId) {
  importReturnFocus = returnFocusId;
  say(backupMsg, '');
  el('import-confirm').hidden = true;
  try {
    pendingImport = parseBackup(text);
  } catch (err) {
    pendingImport = null;
    say(backupMsg, err.message, true);
    return false;
  }
  const nDone = Object.keys(pendingImport.progress).length;
  const nQueue = Object.keys(pendingImport.review.items).length;
  const saved = pendingImport.exportedAt
    ? ` (saved ${new Date(pendingImport.exportedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })})`
    : '';
  const p = el('import-confirm-text');
  p.replaceChildren();
  const strong = document.createElement('span');
  strong.className = 'strong';
  strong.textContent = 'Replace this device’s data with this backup?';
  p.append(strong, document.createElement('br'));
  p.append(`It contains ${nDone} completed ${nDone === 1 ? 'week' : 'weeks'} and ${nQueue} review ${nQueue === 1 ? 'item' : 'items'}${saved}`
    + (pendingImport.name ? `, under the name ${pendingImport.name}. ` : '. ')
    + 'What’s currently on this device will be overwritten.');
  el('import-confirm').hidden = false;
  el('import-replace').focus();
  return true;
}

function closePasteForm() {
  el('paste-form').hidden = true;
  el('paste-text').value = '';
}

el('import-btn').addEventListener('click', () => el('import-file').click());

el('import-file').addEventListener('change', async () => {
  const input = el('import-file');
  const file = input.files[0];
  input.value = ''; // allow re-choosing the same file
  if (!file) return;
  closePasteForm();
  offerImport(await file.text(), 'import-btn');
});

el('paste-btn').addEventListener('click', () => {
  say(backupMsg, '');
  el('import-confirm').hidden = true;
  pendingImport = null;
  el('paste-form').hidden = false;
  el('paste-text').focus();
});

el('paste-import').addEventListener('click', () => {
  const text = el('paste-text').value.trim();
  if (!text) {
    say(backupMsg, 'Paste your backup text into the box first.', true);
    el('paste-text').focus();
    return;
  }
  // Leave the box open on failure so a partial paste can be fixed in place.
  if (offerImport(text, 'paste-btn')) closePasteForm();
});

el('paste-cancel').addEventListener('click', () => {
  closePasteForm();
  el('paste-btn').focus();
});

el('import-replace').addEventListener('click', () => {
  if (!pendingImport) return;
  save(KEYS.review, pendingImport.review);
  save(KEYS.progress, pendingImport.progress);
  // A v1 backup carries no name — keep the device's rather than wipe it.
  if (pendingImport.name) saveName(pendingImport.name);
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
  el(importReturnFocus).focus();
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
    ? `This deletes your completion ${done.length === 1 ? 'record' : 'records'} for ${done.length === 1 ? 'week' : 'weeks'} ${done.join(', ')}, plus your name and review queue, with no undo. You can download a backup first.`
    : 'This erases your name, review queue, and saved settings on this device, with no undo.';
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
    localStorage.removeItem(KEYS.name);
    localStorage.removeItem(THEME_KEY);
    // In-progress quiz sessions (engine.js resume state) count as "everything"
    // too. That state lives in localStorage now; the sessionStorage sweep stays
    // so a tab still holding the old location gets cleared as well.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(SESSION_PREFIX)) localStorage.removeItem(key);
    }
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(key);
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

// cleanName is imported for parity with the gate; keep the input honest on blur.
nameInput.addEventListener('blur', () => { nameInput.value = cleanName(nameInput.value); });

render();
