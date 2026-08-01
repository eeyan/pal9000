// @vitest-environment jsdom
// Quiz-engine behavior in a real DOM: answer-once, click/modifier guards,
// miss re-queue, shuffle re-lettering, the self-explain NEXT gate, and
// embed/XSS safety fixtures.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { runQuiz } from '../../src/assets/js/engine.js';
import eleventyConfig from '../../eleventy.config.js';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}; // not implemented in jsdom
});

function makeQ(id, extra = {}) {
  return {
    id,
    type: 'scenario',
    stem: `Stem for ${id}`,
    answer: 'B',
    options: [
      { key: 'A', text: 'alpha' },
      { key: 'B', text: 'bravo' },
      { key: 'C', text: 'charlie' },
      { key: 'D', text: 'delta' },
    ],
    feedback: { correct: 'because reasons', A: 'nope A', C: 'nope C', D: 'nope D' },
    ...extra,
  };
}

let container;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Clear the 300ms double-click guard that starts at each render.
const settle = () => vi.advanceTimersByTime(301);
const option = (key) => container.querySelector(`.option[data-key="${key}"]`);
// dispatchEvent (not .click()) so disabled buttons still deliver the event —
// this exercises the engine's own answered-state guard, not the DOM's.
const click = (btn) => btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const press = (key, init = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
const verdict = () => container.querySelector('.fb-verdict')?.textContent ?? null;
const readout = () => container.querySelector('.readout').textContent;
const nextBtn = () => container.querySelector('.btn-next');

describe('answer guards', () => {
  it('ignores clicks landing within 300ms of render (double-click guard)', () => {
    runQuiz(container, [makeQ('q1')], {});
    click(option('B'));
    expect(verdict()).toBeNull();
    settle();
    click(option('B'));
    expect(verdict()).toContain('AFFIRMATIVE');
  });

  it('answers only once — later clicks change nothing and onAnswer fires once', () => {
    const onAnswer = vi.fn();
    runQuiz(container, [makeQ('q1')], { onAnswer });
    settle();
    click(option('B'));
    click(option('A'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('q1', true, { firstAttempt: true });
    expect(option('A').classList.contains('is-wrong')).toBe(false);
  });

  it('ignores keyboard answers with modifier keys held (browser shortcuts)', () => {
    runQuiz(container, [makeQ('q1')], {});
    settle();
    press('b', { metaKey: true });
    press('b', { ctrlKey: true });
    press('b', { altKey: true });
    expect(verdict()).toBeNull();
    press('b');
    expect(verdict()).toContain('AFFIRMATIVE');
  });

  it('maps number keys to displayed position', () => {
    runQuiz(container, [makeQ('q1')], {});
    settle();
    press('3'); // third displayed option = C, a distractor
    expect(verdict()).toContain("I'M SORRY");
    expect(option('C').classList.contains('is-wrong')).toBe(true);
  });
});

describe('miss re-queue', () => {
  it('re-asks a missed question once at the end; score counts first attempts only', () => {
    const onAnswer = vi.fn();
    const onComplete = vi.fn();
    runQuiz(container, [makeQ('q1'), makeQ('q2')], { mode: 'week', week: 1, onAnswer, onComplete });

    settle();
    click(option('A')); // q1 wrong → re-queued
    click(nextBtn());
    expect(readout()).toBe('Q 02/03');

    settle();
    click(option('B')); // q2 correct
    click(nextBtn());

    // retry pass
    expect(readout()).toBe('Q 03/03 · RETRY');
    expect(container.querySelector('.stem').textContent).toBe('Stem for q1');
    settle();
    click(option('B')); // correct now, but not a first attempt
    expect(onAnswer).toHaveBeenLastCalledWith('q1', true, { firstAttempt: false });
    expect(nextBtn().textContent).toBe('FINISH →');
    click(nextBtn());

    expect(onComplete).toHaveBeenCalledWith({ score: 1, total: 2, at: expect.any(Number) });
    expect(container.querySelector('.done-score').textContent).toBe('1/2');
    expect(container.querySelector('.done-stamp').textContent).toContain('WEEK 01');
  });

  it('re-queues each miss only once — a failed retry still finishes', () => {
    const onComplete = vi.fn();
    runQuiz(container, [makeQ('q1')], { mode: 'week', week: 1, onComplete });
    settle();
    click(option('A')); // wrong
    click(nextBtn());
    settle();
    click(option('C')); // wrong again on retry
    expect(nextBtn().textContent).toBe('FINISH →');
    click(nextBtn());
    expect(onComplete).toHaveBeenCalledWith({ score: 0, total: 1, at: expect.any(Number) });
  });
});

describe('shuffle + re-lettering (review mode)', () => {
  it('re-letters shuffled options A–D in display order and reports the display key', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic: [B, C, D, A]
    runQuiz(container, [makeQ('q1')], { mode: 'review', shuffle: true });

    const dataKeys = [...container.querySelectorAll('.option')].map((b) => b.dataset.key);
    const shownLetters = [...container.querySelectorAll('.option-key')].map((el) => el.textContent);
    expect(dataKeys).toEqual(['B', 'C', 'D', 'A']);
    expect(shownLetters).toEqual(['A', 'B', 'C', 'D']);

    settle();
    click(option('B')); // still the correct answer wherever it's displayed
    expect(verdict()).toContain('AFFIRMATIVE');
    // feedback names the DISPLAYED letter of the right answer, not its bank key
    expect(container.querySelector('.fb-correct .fb-tag').textContent).toBe('CORRECT: A');
  });
});

describe('self-explanation NEXT gate', () => {
  it('disables NEXT for the think gate, then restores the label', () => {
    runQuiz(container, [makeQ('q1', { selfExplainPrompt: 'Why does B follow?' })], {});
    settle();
    click(option('B'));
    expect(nextBtn().disabled).toBe(true);
    expect(nextBtn().textContent).toBe('THINK IT THROUGH…');
    vi.advanceTimersByTime(2500);
    expect(nextBtn().disabled).toBe(false);
    expect(nextBtn().textContent).toBe('FINISH →');
  });

  it('Enter advances only after answering', () => {
    runQuiz(container, [makeQ('q1'), makeQ('q2')], {});
    settle();
    press('Enter');
    expect(readout()).toBe('Q 01/02'); // unanswered — Enter does nothing
    click(option('B'));
    press('Enter');
    expect(readout()).toBe('Q 02/02');
  });
});

describe('embed / XSS safety', () => {
  it('embedJson output cannot terminate a <script> element and round-trips', () => {
    const filters = {};
    eleventyConfig({ addPassthroughCopy() {}, addFilter(name, fn) { filters[name] = fn; } });
    const questions = [{ stem: 'Beware </script><script>alert(1)</script> injection' }];
    const out = filters.embedJson(questions);
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual(questions);
  });

  it('renders hostile question text inert', () => {
    const q = makeQ('q1', {
      stem: 'Stem with <img src=x onerror=alert(1)>',
      options: [
        { key: 'A', text: '<script>alert(1)</script>' },
        { key: 'B', text: 'safe "quoted" & <tagged>' },
        { key: 'C', text: 'charlie' },
        { key: 'D', text: 'delta' },
      ],
      feedback: { correct: 'fb <b>bold</b>', A: 'x', C: 'x', D: 'x' },
    });
    runQuiz(container, [q], {});
    expect(container.querySelector('script, img, b')).toBeNull();
    expect(option('A').querySelector('.option-text').textContent).toBe('<script>alert(1)</script>');
    settle();
    click(option('B'));
    expect(container.querySelector('script, img, b')).toBeNull();
    expect(container.querySelector('.fb-correct').textContent).toContain('fb <b>bold</b>');
  });
});
