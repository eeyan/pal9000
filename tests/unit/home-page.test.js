// @vitest-environment jsdom
// The home page's client-side status pass: per-week completion stamps, the
// per-set tally in each set heading, and the review-queue count.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SETS } from '../../src/assets/js/sets.js';

const AT = Date.parse('2026-09-04T01:14:30Z');
const DAY_MS = 86_400_000;

const weekStatus = (n) => document.querySelector(`[data-week-status="${n}"]`);
const setStatus = (n) => document.querySelector(`[data-set-status="${n}"]`);

function mountPage() {
  const weeks = [1, 2, 3, 4, 5, 6]
    .map((n) => `<span class="mission-status" data-week-status="${n}"></span>`)
    .join('');
  document.body.innerHTML = `
    <h3><span class="set-status" data-set-status="1"></span></h3>
    <h3><span class="set-status" data-set-status="2"></span></h3>
    ${weeks}
    <span class="mission-meta mono" id="review-count">—</span>
    <section class="install-hint" id="install-hint" hidden>
      <button class="btn-ghost" type="button" id="install-hint-dismiss">GOT IT</button>
    </section>`;
}

async function loadPage() {
  vi.resetModules();
  await import('../../src/assets/js/home.js');
}

const setProgress = (progress) => localStorage.setItem('pal9000.progress.v1', JSON.stringify(progress));
const rec = (score = 9, total = 10) => ({ score, total, at: AT });

beforeEach(() => {
  localStorage.clear();
  mountPage();
  // home.js checks display-mode for the install hint; jsdom has no matchMedia.
  window.matchMedia = () => ({ matches: false });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('per-week status', () => {
  it('stamps completed weeks with the score and leaves the rest blank', async () => {
    setProgress({ 1: rec(9, 10) });
    await loadPage();

    expect(weekStatus(1).textContent).toBe('9/10 ✓');
    expect(weekStatus(1).classList.contains('ok')).toBe(true);
    expect(weekStatus(2).textContent).toBe('');
    expect(weekStatus(2).classList.contains('ok')).toBe(false);
  });
});

describe('per-set tally', () => {
  it('counts completed weeks against each set', async () => {
    setProgress({ 1: rec() });
    await loadPage();

    expect(setStatus(1).textContent).toBe('1/5 COMPLETE');
    expect(setStatus(1).classList.contains('ok')).toBe(false);
    expect(setStatus(2).textContent).toBe('0/7 COMPLETE');
    expect(setStatus(2).classList.contains('ok')).toBe(false);
  });

  it('marks a set ok once every week in it is complete', async () => {
    setProgress(Object.fromEntries(SETS[0].weeks.map((w) => [w, rec()])));
    await loadPage();

    expect(setStatus(1).textContent).toBe(`${SETS[0].weeks.length}/${SETS[0].weeks.length} COMPLETE`);
    expect(setStatus(1).classList.contains('ok')).toBe(true);
    expect(setStatus(2).classList.contains('ok')).toBe(false);
  });
});

describe('review count', () => {
  it('reads EMPTY with no review state', async () => {
    await loadPage();
    expect(document.getElementById('review-count').textContent).toBe('EMPTY');
    expect(document.getElementById('review-count').classList.contains('alert')).toBe(false);
  });

  it('shows due / total and flags the queue when something is due', async () => {
    localStorage.setItem('pal9000.review.v1', JSON.stringify({
      items: {
        'w01-q01': { idx: 0, due: Date.now() - DAY_MS },
        'w01-q02': { idx: 1, due: Date.now() + DAY_MS },
      },
    }));
    await loadPage();

    expect(document.getElementById('review-count').textContent).toBe('1 DUE / 2');
    expect(document.getElementById('review-count').classList.contains('alert')).toBe(true);
  });
});
