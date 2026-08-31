import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { loadBank, WEEK_FILE_RE } from '../../src/lib/bank.js';

const QUESTIONS_DIR = join(import.meta.dirname, '../../content/questions');
const REJECT_REASONS = ['hallucination', 'leakage', 'trivia', 'ambiguous', 'duplicate', 'malformed'];

// Same regex the loader uses — lint coverage and site coverage cannot diverge.
const weekFiles = readdirSync(QUESTIONS_DIR).filter((f) => WEEK_FILE_RE.test(f));

// Long verbatim quotes are a copyright red flag: generated questions are
// grounded in publisher/case materials, and a 15+ word quotation in committed
// content suggests source text was copied rather than paraphrased.
const MAX_QUOTED_WORDS = 15;
function longQuote(text) {
  for (const m of String(text ?? '').matchAll(/["“]([^"”]{40,})["”]/g)) {
    if (m[1].trim().split(/\s+/).length > MAX_QUOTED_WORDS) return m[1];
  }
  return null;
}

describe('question bank schema (curation lint)', () => {
  it('has at least one week file', () => {
    expect(weekFiles.length).toBeGreaterThan(0);
  });

  it('no week-like file evades the lint (wrong extension or casing)', () => {
    const strays = readdirSync(QUESTIONS_DIR).filter(
      (f) => /week/i.test(f) && !WEEK_FILE_RE.test(f) && !f.endsWith('.candidates.yaml'),
    );
    expect(strays, `files the loader/lint would miss: ${strays.join(', ')}`).toEqual([]);
  });

  for (const file of weekFiles) {
    describe(file, () => {
      const doc = yaml.load(readFileSync(join(QUESTIONS_DIR, file), 'utf8'));

      it('has week number and title', () => {
        expect(Number.isInteger(doc.week)).toBe(true);
        expect(typeof doc.title).toBe('string');
      });

      for (const q of doc.questions) {
        describe(q.id, () => {
          it('has a valid status', () => {
            const ok = ['accepted', 'edited', 'candidate'].includes(q.status)
              || REJECT_REASONS.some((r) => q.status === `rejected: ${r}`);
            expect(ok, `status "${q.status}"`).toBe(true);
          });

          if (typeof q.status === 'string' && q.status.startsWith('rejected')) return;

          it('has required fields', () => {
            expect(['scenario-mcq', 'definitional']).toContain(q.type);
            expect(q.stem.length).toBeGreaterThan(10);
            expect(q.promptVersion).toBeTruthy();
          });

          it('answer key exists among options', () => {
            expect(q.options.map((o) => o.key)).toContain(q.answer);
          });

          it('option keys are unique', () => {
            const keys = q.options.map((o) => o.key);
            expect(new Set(keys).size).toBe(keys.length);
          });

          it('feedback covers the correct answer and every distractor', () => {
            expect(q.feedback.correct.length).toBeGreaterThan(10);
            for (const o of q.options) {
              if (o.key === q.answer) continue;
              expect(q.feedback[o.key], `feedback for distractor ${o.key}`).toBeTruthy();
            }
          });

          it('carries a source citation (no citation = hallucination risk)', () => {
            expect(q.source?.doc).toBeTruthy();
            expect(q.source?.loc).toBeTruthy();
          });

          it('contains no long verbatim quotes (copyright guard)', () => {
            const texts = [q.stem, q.feedback?.correct, ...Object.values(q.feedback ?? {}), q.selfExplainPrompt];
            for (const t of texts) {
              const hit = longQuote(t);
              expect(hit, `quoted span over ${MAX_QUOTED_WORDS} words: "${hit}"`).toBeNull();
            }
          });

          if (q.type === 'scenario-mcq') {
            it('scenario questions have a self-explanation prompt', () => {
              expect(q.selfExplainPrompt).toBeTruthy();
            });
          }
        });
      }
    });
  }
});

describe('loadBank', () => {
  it('only accepted/edited questions reach the app', () => {
    const bank = loadBank();
    for (const w of bank.weeks) {
      for (const q of w.questions) {
        expect(['accepted', 'edited']).toContain(q.status);
      }
    }
  });

  it('question ids are globally unique', () => {
    const bank = loadBank();
    const ids = bank.weeks.flatMap((w) => w.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('options survive shuffling (both quiz modes re-order and re-letter options)', () => {
  const POSITIONAL = /\b(all|none|both|either|neither) of the above\b|\bboth [A-D]\b|\b[A-D] (and|or) [A-D]\b|\boptions? [A-D]\b|\bthe (first|second|third|fourth|last) (option|choice|answer)\b/i;
  for (const file of weekFiles) {
    const doc = yaml.load(readFileSync(join(QUESTIONS_DIR, file), 'utf8'));
    for (const q of doc.questions ?? []) {
      it(`${q.id}: no option or feedback refers to a position`, () => {
        for (const o of q.options ?? []) expect(o.text, `${q.id} option ${o.key}`).not.toMatch(POSITIONAL);
        for (const [k, v] of Object.entries(q.feedback ?? {})) expect(v, `${q.id} feedback ${k}`).not.toMatch(POSITIONAL);
        expect(q.stem, `${q.id} stem`).not.toMatch(POSITIONAL);
      });
    }
  }
});

describe('published flag', () => {
  it('holds a week out of the bank when published: false, without touching other weeks', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'pal-bank-'));
    const q = (id) => `  - id: ${id}\n    week: 1\n    type: scenario-mcq\n    status: accepted\n    stem: s\n    answer: A\n    options: [{key: A, text: a}]\n`;
    writeFileSync(join(dir, 'week-01.yaml'), `week: 1\ntitle: One\nquestions:\n${q('w01-q01')}`);
    writeFileSync(join(dir, 'week-02.yaml'), `week: 2\ntitle: Two\npublished: false\nquestions:\n${q('w02-q01').replace('week: 1', 'week: 2')}`);
    const bank = loadBank(dir);
    expect(bank.weeks.map((w) => w.week)).toEqual([1]);
    expect(bank.totalQuestions).toBe(1);
  });

  it('weeks 2 and 3 are held out until after their class sessions (2026-08-31 decision)', () => {
    expect(loadBank().weeks.map((w) => w.week)).toEqual([1]);
  });
});
