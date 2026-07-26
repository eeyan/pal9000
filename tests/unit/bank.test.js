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
