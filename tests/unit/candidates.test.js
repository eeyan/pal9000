import { describe, it, expect } from 'vitest';
import {
  fromStructured, validateCandidate, buildCandidatesDoc, lintCandidate, longQuote, quotedSpans, batchStats,
} from '../../src/lib/candidates.js';

const structured = (over = {}) => ({
  type: 'scenario-mcq',
  stem: "A firm weighs two options after reading Carr's 'IT Doesn't Matter'. Which one should the board choose?",
  correct: { text: 'Delay the purchase and cap upgrade costs', feedback: 'Carr says followers spend less and get more, so waiting is the defensive move.' },
  distractors: [
    { text: 'Buy now to capture a first-mover edge', feedback: 'Carr says that hope was unwarranted.' },
    { text: 'Buy only if every rival has already bought', feedback: 'Imitating overspending is still overspending.' },
    { text: 'Cancel all IT spending until returns are proven', feedback: 'Essential spending continues.' },
  ],
  answerPos: 2,
  selfExplainPrompt: 'Relate this to operational risk.',
  sourceDoc: "Carr - IT Doesn't Matter (2003, parts 1-8).md",
  sourceLoc: 'Part 7',
  ...over,
});

describe('fromStructured', () => {
  it('places the correct option at answerPos and letters everything', () => {
    const q = fromStructured(structured());
    expect(q.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.answer).toBe('C');
    expect(q.options[2].text).toBe('Delay the purchase and cap upgrade costs');
    expect(q.distractorFeedback.map((d) => d.key)).toEqual(['A', 'B', 'D']);
    expect(q.feedbackCorrect).toMatch(/defensive/);
  });

  it('passes schema-shaped items through untouched', () => {
    const q = fromStructured(structured());
    expect(fromStructured(q)).toBe(q);
  });
});

describe('validateCandidate', () => {
  const names = ["Carr - IT Doesn't Matter (2003, parts 1-8).md"];
  it('accepts a well-formed item', () => {
    expect(validateCandidate(fromStructured(structured()), names)).toBeNull();
  });
  it('rejects an unknown source and a scenario without a self-explain prompt', () => {
    expect(validateCandidate(fromStructured(structured({ sourceDoc: 'nope.md' })), names)).toMatch(/not a provided source/);
    expect(validateCandidate(fromStructured(structured({ selfExplainPrompt: null })), names)).toMatch(/selfExplainPrompt/);
  });
});

describe('buildCandidatesDoc', () => {
  it('numbers ids per week and pre-marks malformed items', () => {
    const qs = [fromStructured(structured()), fromStructured(structured({ sourceDoc: 'nope.md' }))];
    const { doc, malformed } = buildCandidatesDoc({ week: 2, questions: qs, promptVersion: 'gen-v3', model: 'm', sourceNames: [structured().sourceDoc] });
    expect(doc.questions.map((q) => q.id)).toEqual(['w02-c01', 'w02-c02']);
    expect(doc.questions[0].status).toBe('candidate');
    expect(doc.questions[1].status).toBe('rejected: malformed');
    expect(malformed).toBe(1);
    expect(doc.questions[0].feedback.C).toBeUndefined();
    expect(doc.questions[0].feedback.A).toMatch(/unwarranted/);
  });
});

describe('quotes', () => {
  it('does not treat the text between two quoted titles as a quotation', () => {
    const s = 'As Andreessen recounts in "Why Software Is Eating the World", Amazon was the world\'s largest bookseller and Borders was collapsing. Carr\'s 2003 article "IT Doesn\'t Matter" argued otherwise.';
    expect(quotedSpans(s)).toEqual(['Why Software Is Eating the World', "IT Doesn't Matter"]);
    expect(longQuote(s)).toBeNull();
  });
  it('still catches a real long quotation, curly quotes included', () => {
    const s = 'He wrote: “the key to success, for the vast majority of companies, is no longer to seek advantage aggressively but to manage costs and risks meticulously” and moved on.';
    expect(longQuote(s)).toMatch(/^the key to success/);
  });
});

describe('lintCandidate', () => {
  const record = (over = {}) => {
    const q = fromStructured(structured());
    return {
      stem: q.stem, options: q.options, answer: q.answer,
      feedback: { correct: q.feedbackCorrect, ...Object.fromEntries(q.distractorFeedback.map((d) => [d.key, d.text])) },
      selfExplainPrompt: q.selfExplainPrompt, source: { doc: q.sourceDoc, loc: q.sourceLoc },
      ...over,
    };
  };

  it('is quiet on a clean item', () => {
    expect(lintCandidate(record())).toEqual([]);
  });

  it('flags a longest correct option and a lone because-justification', () => {
    const r = record();
    r.options[2].text = 'Delay the purchase and cap upgrade costs, because Carr says followers spend less and get more';
    const w = lintCandidate(r);
    expect(w).toContain('correct option is the longest');
    expect(w.some((x) => /because\/since/.test(x))).toBe(true);
  });

  it('flags unexpanded acronyms and bare-acronym option sets', () => {
    const r = record({ stem: 'Which system does Chapter 3 assign to tellers?', options: [
      { key: 'A', text: 'TPS' }, { key: 'B', text: 'DSS' }, { key: 'C', text: 'EIS' }, { key: 'D', text: 'ERP' },
    ] });
    const w = lintCandidate(r);
    expect(w).toContain('option set is bare acronyms');
    expect(w.some((x) => /acronym TPS/.test(x))).toBe(true);
    const ok = lintCandidate(record({ stem: 'A distributor evaluates an enterprise resource planning (ERP) system described in Chapter 3. Which ERP trait is shown?' }));
    expect(ok.some((x) => /acronym ERP/.test(x))).toBe(false);
  });

  it('flags a stem that never names its source', () => {
    const w = lintCandidate(record({ stem: 'A firm weighs two options after reading the article. Which one should the board choose?' }));
    expect(w.some((x) => /does not name its source/.test(x))).toBe(true);
    const named = lintCandidate(record({ stem: 'A firm weighs two options after reading Carr. Which one should the board choose?' }));
    expect(named.some((x) => /does not name its source/.test(x))).toBe(false);
  });

  it('flags which-reasoning and yes/no stems', () => {
    const r = record({ stem: "Which reasoning best matches Carr's 'IT Doesn't Matter'?", options: [
      { key: 'A', text: 'Yes, because the edge lasts' }, { key: 'B', text: 'No, because the edge fades' }, { key: 'C', text: 'Yes, because rivals lag' }, { key: 'D', text: 'No, because costs rise' },
    ], answer: 'B' });
    const w = lintCandidate(r);
    expect(w.some((x) => /which reasoning/.test(x))).toBe(true);
    expect(w.some((x) => /yes\/no/.test(x))).toBe(true);
  });
});

describe('batchStats', () => {
  it('counts keys, types, sources and longest-correct', () => {
    const { doc } = buildCandidatesDoc({ week: 2, questions: [fromStructured(structured()), fromStructured(structured({ answerPos: 0, type: 'definitional' }))], promptVersion: 'x', model: 'm', sourceNames: [structured().sourceDoc] });
    const s = batchStats(doc.questions);
    expect(s.keys).toEqual({ A: 1, B: 0, C: 1, D: 0 });
    expect(s.types).toEqual({ 'scenario-mcq': 1, definitional: 1 });
    expect(s.longestCorrect).toBe(0);
  });
});
