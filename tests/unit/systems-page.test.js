// @vitest-environment jsdom
// The SYSTEMS page wired up end to end in jsdom: the set-grouped completion
// log, the NAME form, COPY AS TEXT, restore-from-paste (v2 and v1 backups),
// and FULL RESET. Markup mirrors src/systems.njk (front matter/layout aside).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SETS, setHeading } from '../../src/assets/js/sets.js';
import { LOG_HEADER, pendingLine } from '../../src/assets/js/completion.js';
import { makeBackup } from '../../src/assets/js/backup.js';

const ALL_WEEKS = SETS.flatMap((s) => s.weeks);
const AT = Date.parse('2026-09-04T01:14:30Z');
const CODE = '0WDFS4-DG9QGM';
const REC = { score: 9, total: 10, at: AT, name: 'Ian Anderson', code: CODE };

function mountPage() {
  document.body.innerHTML = `
<nav class="crumb mono"><a href="/">← MISSION SELECT</a></nav>
<section class="hero hero-quiz">
  <p class="kicker mono">PAL 9000 · SYSTEMS</p>
  <h1>Your data, your device.</h1>
</section>

<p class="status-strip mono" id="status-strip" hidden></p>

<section class="sys-block" aria-labelledby="name-h">
  <h2 id="name-h" class="panel-label mono">NAME</h2>
  <form class="name-form" id="name-form">
    <label class="sr-only" for="name-input">Your name</label>
    <input class="name-input" id="name-input" type="text" autocomplete="name" maxlength="60" placeholder="Not set yet" autocapitalize="words">
    <button class="btn-next" type="submit">SAVE NAME</button>
  </form>
  <p class="status-msg" id="name-msg" aria-live="polite"></p>
</section>

<section class="sys-block" aria-labelledby="log-h">
  <h2 id="log-h" class="panel-label mono">COMPLETION LOG</h2>
  <div class="term">
    <div class="term-head"><span>COMPLETION RECORDS · THIS DEVICE</span><button class="term-copy mono" type="button" id="copy-log">COPY AS TEXT</button></div>
    <div class="term-body" id="log-body">CONNECTING…</div>
  </div>
</section>

<section class="sys-block" aria-labelledby="backup-h">
  <h2 id="backup-h" class="panel-label mono">BACKUP &amp; RESTORE</h2>
  <div class="act">
    <button class="btn-next" type="button" id="export-btn">DOWNLOAD BACKUP</button>
    <button class="btn-ghost" type="button" id="copy-backup-btn">COPY BACKUP</button>
    <button class="btn-ghost" type="button" id="import-btn">RESTORE FROM FILE…</button>
    <button class="btn-ghost" type="button" id="paste-btn">PASTE BACKUP…</button>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
  </div>
  <div class="paste-form" id="paste-form" hidden>
    <label class="paste-label" for="paste-text">Paste the backup text you copied, then choose IMPORT.</label>
    <textarea class="paste-text mono" id="paste-text" rows="4" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
    <div class="act">
      <button class="btn-next" type="button" id="paste-import">IMPORT</button>
      <button class="btn-ghost" type="button" id="paste-cancel">CANCEL</button>
    </div>
  </div>
  <div class="confirm warn" id="import-confirm" hidden>
    <p id="import-confirm-text"></p>
    <div class="act">
      <button class="btn-next" type="button" id="import-replace">REPLACE DATA</button>
      <button class="btn-ghost" type="button" id="import-cancel">CANCEL</button>
    </div>
  </div>
  <p class="status-msg" id="backup-msg" aria-live="polite"></p>
</section>

<section class="sys-block" aria-labelledby="reset-h">
  <h2 id="reset-h" class="panel-label mono">RESET</h2>
  <div class="act">
    <button class="btn-ghost" type="button" id="clear-queue-btn">CLEAR REVIEW QUEUE</button>
    <button class="btn-danger" type="button" id="full-reset-btn">FULL RESET</button>
  </div>
  <div class="confirm warn" id="clear-confirm" hidden>
    <p id="clear-confirm-text"></p>
    <div class="act">
      <button class="btn-next" type="button" id="clear-yes">CLEAR QUEUE</button>
      <button class="btn-ghost" type="button" id="clear-cancel">CANCEL</button>
    </div>
  </div>
  <div class="confirm" id="reset-confirm" hidden>
    <p id="reset-confirm-text"></p>
    <div class="act">
      <button class="btn-next" type="button" id="reset-backup">DOWNLOAD BACKUP FIRST</button>
      <button class="btn-danger" type="button" id="reset-yes">ERASE EVERYTHING</button>
      <button class="btn-ghost" type="button" id="reset-cancel">CANCEL</button>
    </div>
  </div>
  <p class="status-msg" id="reset-msg" aria-live="polite"></p>
</section>`;
}

async function loadPage() {
  vi.resetModules();
  await import('../../src/assets/js/systems-page.js');
}

const el = (id) => document.getElementById(id);
const click = (id) => el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const submitName = (value) => {
  el('name-input').value = value;
  el('name-form').dispatchEvent(new Event('submit', { cancelable: true }));
};
const rows = () => [...el('log-body').querySelectorAll('.row')];
const rowTexts = () => rows().map((r) => r.textContent);

function seedSigned() {
  localStorage.setItem('pal9000.progress.v1', JSON.stringify({ 1: REC }));
  localStorage.setItem('pal9000.name.v1', 'Ian Anderson');
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mountPage();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('completion log', () => {
  it('shows the empty state and a zeroed status strip with nothing completed', async () => {
    await loadPage();
    expect(el('log-body').classList.contains('empty')).toBe(true);
    expect(el('log-body').textContent).toContain('No completed weeks yet');
    expect(rows()).toHaveLength(0);

    expect(el('status-strip').hidden).toBe(false);
    expect(el('status-strip').textContent).toContain('0/5 SET 1');
    expect(el('status-strip').textContent).toContain('0/7 SET 2');
  });

  it('renders header, name, both set headings, the done row, and every pending week', async () => {
    seedSigned();
    await loadPage();

    expect(el('log-body').classList.contains('empty')).toBe(false);
    const texts = rowTexts();
    expect(texts[0]).toBe(LOG_HEADER);
    expect(rows()[0].className).toBe('row hdr');
    expect(texts[1]).toBe('NAME · Ian Anderson');
    expect(rows()[1].className).toBe('row nm');

    for (const s of SETS) {
      const i = texts.indexOf(setHeading(s));
      expect(i).toBeGreaterThan(-1);
      expect(rows()[i].className).toBe('row set');
    }

    const doneRows = rows().filter((r) => r.className === 'row ok');
    expect(doneRows).toHaveLength(1);
    expect(doneRows[0].textContent).toContain('W01 ✓');
    expect(doneRows[0].textContent).toContain('9/10');
    expect(doneRows[0].textContent).toContain(CODE);
    // Signed under the device name — no discrepancy marker.
    expect(doneRows[0].textContent).not.toContain('AS "');

    const pending = rows().filter((r) => r.className === 'row off').map((r) => r.textContent);
    expect(pending).toEqual(ALL_WEEKS.filter((w) => w !== 1).map(pendingLine));
    // header + name + one heading per set + one row per week
    expect(texts).toHaveLength(2 + SETS.length + ALL_WEEKS.length);

    expect(el('status-strip').textContent).toContain('1/5 SET 1');
    expect(el('status-strip').textContent).toContain('0/7 SET 2');
  });

  it('renders a stored name as literal text, never as markup', async () => {
    const evil = '<img src=x onerror=alert(1)>';
    localStorage.setItem('pal9000.progress.v1', JSON.stringify({ 1: { ...REC, name: evil } }));
    localStorage.setItem('pal9000.name.v1', evil);
    await loadPage();

    expect(el('log-body').querySelector('img')).toBeNull();
    expect(rowTexts()[1]).toBe(`NAME · ${evil}`);
    expect(el('name-input').value).toBe(evil);
  });

  it('marks a record signed under a different name', async () => {
    localStorage.setItem('pal9000.progress.v1', JSON.stringify({ 1: { ...REC, name: 'Other Name' } }));
    localStorage.setItem('pal9000.name.v1', 'Ian Anderson');
    await loadPage();

    const done = rows().find((r) => r.className === 'row ok');
    expect(done.textContent).toContain('AS "Other Name"');
  });
});

describe('name form', () => {
  it('stores a cleaned name, re-renders the NAME row, and reports it', async () => {
    localStorage.setItem('pal9000.progress.v1', JSON.stringify({ 1: REC }));
    await loadPage();
    expect(rowTexts()[1]).toBe('NAME · (not set)');

    submitName('  jane   doe ');
    expect(localStorage.getItem('pal9000.name.v1')).toBe('jane doe');
    expect(el('name-input').value).toBe('jane doe');
    expect(rowTexts()[1]).toBe('NAME · jane doe');
    expect(el('name-msg').textContent).toBe('Saved. New completions will be signed as jane doe.');
    expect(el('name-msg').classList.contains('err')).toBe(false);
  });

  it('re-submitting the same name says nothing changed', async () => {
    seedSigned();
    await loadPage();
    submitName('Ian   Anderson');
    expect(el('name-msg').textContent).toBe('Name unchanged.');
    expect(localStorage.getItem('pal9000.name.v1')).toBe('Ian Anderson');
  });

  it('an empty submit clears a stored name; with none stored it asks for one', async () => {
    seedSigned();
    await loadPage();
    submitName('   ');
    expect(localStorage.getItem('pal9000.name.v1')).toBeNull();
    expect(rowTexts()[1]).toBe('NAME · (not set)');
    expect(el('name-msg').textContent).toContain('Name cleared.');
    expect(el('name-msg').classList.contains('err')).toBe(false);

    submitName('');
    expect(el('name-msg').textContent).toBe('Enter a name first.');
    expect(el('name-msg').classList.contains('err')).toBe(true);
  });
});

describe('copy as text', () => {
  it('copies the joined log rows and flips the button label back after 2s', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    seedSigned();
    await loadPage();

    vi.useFakeTimers();
    click('copy-log');
    await vi.advanceTimersByTimeAsync(0);

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toBe(rowTexts().join('\n'));
    const lines = copied.split('\n');
    expect(lines[0]).toBe(LOG_HEADER);
    expect(lines.find((l) => l.startsWith('W01'))).toContain(CODE);
    expect(el('copy-log').textContent).toBe('COPIED ✓');

    await vi.advanceTimersByTimeAsync(2000);
    expect(el('copy-log').textContent).toBe('COPY AS TEXT');
  });
});

describe('restore from pasted backup', () => {
  const review = { items: { 'w03-q02': { idx: 0, due: AT + 86_400_000 } } };
  const incoming = { 2: { score: 8, total: 10, at: AT, name: 'Jane Doe', code: CODE } };

  function paste(text) {
    click('paste-btn');
    el('paste-text').value = text;
    click('paste-import');
  }

  it('imports a v2 backup, naming the backup owner before replacing', async () => {
    localStorage.setItem('pal9000.name.v1', 'Ian Anderson');
    await loadPage();

    paste(JSON.stringify(makeBackup(review, incoming, AT, 'Jane Doe'), null, 2));

    expect(el('import-confirm').hidden).toBe(false);
    expect(el('paste-form').hidden).toBe(true);
    const confirmText = el('import-confirm-text').textContent;
    expect(confirmText).toContain('Replace this device’s data with this backup?');
    expect(confirmText).toContain('1 completed week');
    expect(confirmText).toContain('1 review item');
    expect(confirmText).toContain('under the name Jane Doe');

    click('import-replace');
    expect(el('import-confirm').hidden).toBe(true);
    expect(localStorage.getItem('pal9000.name.v1')).toBe('Jane Doe');
    expect(JSON.parse(localStorage.getItem('pal9000.progress.v1'))).toEqual(incoming);
    expect(JSON.parse(localStorage.getItem('pal9000.review.v1'))).toEqual(review);
    expect(el('backup-msg').textContent).toBe('Restored — 1 week complete, 1 in review.');

    expect(rowTexts()[1]).toBe('NAME · Jane Doe');
    const done = rows().filter((r) => r.className === 'row ok');
    expect(done).toHaveLength(1);
    expect(done[0].textContent).toContain('W02 ✓');
  });

  it('keeps the device name when a v1 backup carries none', async () => {
    localStorage.setItem('pal9000.name.v1', 'Ian Anderson');
    await loadPage();

    const v1 = {
      format: 'pal9000-backup-v1',
      exportedAt: AT,
      review,
      progress: { 2: { score: 8, total: 10, at: AT } },
    };
    paste(JSON.stringify(v1));
    expect(el('import-confirm').hidden).toBe(false);
    expect(el('import-confirm-text').textContent).not.toContain('under the name');

    click('import-replace');
    expect(localStorage.getItem('pal9000.name.v1')).toBe('Ian Anderson');
    expect(rowTexts()[1]).toBe('NAME · Ian Anderson');
    const done = rows().filter((r) => r.className === 'row ok');
    expect(done[0].textContent).toContain('UNSIGNED');
  });
});

describe('full reset', () => {
  it('erases name, progress, review, and theme, and empties the log', async () => {
    seedSigned();
    localStorage.setItem('pal9000.review.v1', JSON.stringify({ items: { 'w01-q01': { idx: 0, due: AT } } }));
    localStorage.setItem('pal9000.theme', 'dark');
    localStorage.setItem('pal9000.session:/week-1/', '{}');
    await loadPage();
    expect(rows().length).toBeGreaterThan(0);

    click('full-reset-btn');
    expect(el('reset-confirm').hidden).toBe(false);
    expect(el('reset-confirm-text').textContent).toContain('Erase everything on this device?');
    expect(el('reset-backup').hidden).toBe(false);

    click('reset-yes');
    expect(el('reset-confirm').hidden).toBe(true);
    for (const key of ['pal9000.name.v1', 'pal9000.progress.v1', 'pal9000.review.v1', 'pal9000.theme', 'pal9000.session:/week-1/']) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(el('reset-msg').textContent).toBe('All data on this device has been erased.');
    expect(el('log-body').classList.contains('empty')).toBe(true);
    expect(el('log-body').textContent).toContain('No completed weeks yet');
    expect(el('name-input').value).toBe('');
    expect(el('status-strip').textContent).toContain('0/5 SET 1');
  });
});
