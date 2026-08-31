// @vitest-environment jsdom
// The week page's name gate and signed completion record, end to end in jsdom:
// gate shows when no name is stored, stores the name, starts the quiz, and
// onComplete writes a signed record that verifies against that name.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { verifyCompletion } from '../../src/assets/js/completion.js';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

const QS = [1, 2].map((n) => ({
  id: `w01-q0${n}`, type: 'scenario', stem: `Stem ${n}`, answer: 'A',
  options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }, { key: 'C', text: 'c' }, { key: 'D', text: 'd' }],
  feedback: { correct: 'yes', B: 'no', C: 'no', D: 'no' },
}));

function mountPage() {
  document.body.innerHTML = `
    <div id="quiz" data-mode="week" data-week="1"></div>
    <script type="application/json" id="question-data">${JSON.stringify(QS)}</script>`;
}

async function loadPage() {
  vi.resetModules();
  await import('../../src/assets/js/week-page.js');
}

const settle = () => vi.advanceTimersByTime(301);
const click = (sel) => document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  mountPage();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('week page name gate', () => {
  it('asks for a name before the first set and refuses an empty one', async () => {
    await loadPage();
    expect(document.querySelector('.name-gate')).not.toBeNull();
    expect(document.querySelector('.option')).toBeNull();
    document.querySelector('#name-input').value = '   ';
    document.querySelector('#name-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.querySelector('.name-gate')).not.toBeNull();
    expect(localStorage.getItem('pal9000.name.v1')).toBeNull();
  });

  it('stores the cleaned name, starts the quiz, and signs the completion under it', async () => {
    vi.useFakeTimers();
    await loadPage();
    document.querySelector('#name-input').value = '  Ian   Anderson ';
    document.querySelector('#name-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(localStorage.getItem('pal9000.name.v1')).toBe('Ian Anderson');
    expect(document.querySelector('.name-gate')).toBeNull();
    expect(document.querySelectorAll('.option').length).toBe(4);

    for (let i = 0; i < QS.length; i += 1) {
      settle();
      click('.option[data-key="A"]');
      click('.btn-next');
    }
    expect(document.querySelector('.done-panel')).not.toBeNull();
    vi.useRealTimers();
    await flush(); // signing is async (Web Crypto)

    const rec = JSON.parse(localStorage.getItem('pal9000.progress.v1'))[1];
    expect(rec).toMatchObject({ score: 2, total: 2, name: 'Ian Anderson' });
    expect(rec.code).toMatch(/^[0-9A-Z]{6}-[0-9A-Z]{6}$/);
    expect((await verifyCompletion({ week: 1, code: rec.code, score: 2, total: 2, name: 'ian anderson' })).ok).toBe(true);
    expect((await verifyCompletion({ week: 1, code: rec.code, score: 2, total: 2, name: 'someone else' })).ok).toBe(false);
    expect(document.querySelector('.done-stamp .stamp-code').textContent).toContain(rec.code);
    expect(document.querySelector('.done-stamp .stamp-code').textContent).toContain('Ian Anderson');
  });

  it('skips the gate when a name is already stored and shows the on-file record banner', async () => {
    localStorage.setItem('pal9000.name.v1', 'Ian Anderson');
    localStorage.setItem('pal9000.progress.v1', JSON.stringify({ 1: { score: 1, total: 2, at: 1_690_000_000_000, name: 'Ian Anderson', code: '0WDNEA-KZ1F20' } }));
    await loadPage();
    expect(document.querySelector('.name-gate')).toBeNull();
    expect(document.querySelectorAll('.option').length).toBe(4);
    expect(document.querySelector('.stamp-banner .stamp-code').textContent).toContain('0WDNEA-KZ1F20');
  });

  it('a lower retake keeps the earlier record and shows it on the finish screen', async () => {
    vi.useFakeTimers();
    localStorage.setItem('pal9000.name.v1', 'Ian Anderson');
    const prev = { score: 2, total: 2, at: 1_690_000_000_000, name: 'Ian Anderson', code: '0WDNEA-KZ1F20' };
    localStorage.setItem('pal9000.progress.v1', JSON.stringify({ 1: prev }));
    await loadPage();
    settle(); click('.option[data-key="B"]'); click('.btn-next'); // miss q1
    settle(); click('.option[data-key="A"]'); click('.btn-next');
    settle(); click('.option[data-key="A"]'); click('.btn-next'); // retry of q1
    expect(document.querySelector('.done-panel')).not.toBeNull();
    vi.useRealTimers();
    await flush();
    expect(JSON.parse(localStorage.getItem('pal9000.progress.v1'))[1]).toEqual(prev);
    expect(document.querySelector('.done-stamp .stamp-code').textContent).toContain('0WDNEA-KZ1F20');
  });
});
