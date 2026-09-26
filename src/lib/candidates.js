// Shared candidate-batch logic for the Groundwork pipeline: shape conversion,
// validation, style lint, and batch statistics. Used by scripts/generate.js
// (API path), scripts/build-candidates.js (in-session path), scripts/review.js
// (per-question warnings on the curation page) and the bank lint tests — so
// the two generation paths and the curation view can't drift apart.
//
// Pure functions, no I/O, no DOM.

export const KEYS = ['A', 'B', 'C', 'D'];

// Acronyms that read as plain words to the course's audience and need no
// expansion. Everything else in CAPS is expected to appear as "long form (ACR)"
// somewhere in the stem or options the first time it is used.
const PLAIN_ACRONYMS = new Set([
  'IT', 'CEO', 'CIO', 'CFO', 'COO', 'CMO', 'CTO', 'PC', 'PCS', 'AI', 'US', 'USA', 'MBA', 'HR',
  'IPO', 'VP', 'GPT', 'API', 'URL', 'HBR', 'HBS', 'CNBC', 'NYU', 'CUNY', 'MIT', 'ASAP',
  'IVK', // the company in The Adventures of an IT Leader — a name, not an acronym
]);

// Words in a source filename that don't identify the source in a stem.
const DOC_STOPWORDS = new Set([
  'news', 'chapter', 'parts', 'part', 'excerpt', 'report', 'introduces', 'release', 'and', 'the',
  'with', 'from', 'personal', 'agent', 'problem', 'prize', 'millennium', 'world', 'software',
  'eating', 'strategy', 'internet', 'matter', 'doesn', 'leader', 'adventures', 'cis',
]);

// Structured authoring shape (what an in-session batch is written in):
//   { type, stem, correct: { text, feedback }, distractors: [{ text, feedback } ×3],
//     answerPos: 0-3, selfExplainPrompt?, sourceDoc, sourceLoc }
// → the schema shape scripts/generate.js gets back from the API. Letters are
// assigned here so an author never types A-D by hand. Items already in schema
// shape (options + answer present) pass through untouched.
export function fromStructured(item) {
  if (item.options && item.answer) return item;
  const pos = Number.isInteger(item.answerPos) ? item.answerPos : 0;
  const all = [...(item.distractors ?? [])];
  all.splice(pos, 0, item.correct);
  const options = all.map((o, i) => ({ key: KEYS[i], text: o.text }));
  const answer = KEYS[pos];
  const distractorFeedback = all
    .map((o, i) => ({ key: KEYS[i], text: o.feedback }))
    .filter((d) => d.key !== answer);
  return {
    type: item.type,
    stem: item.stem,
    options,
    answer,
    feedbackCorrect: item.correct?.feedback,
    distractorFeedback,
    selfExplainPrompt: item.selfExplainPrompt ?? null,
    sourceDoc: item.sourceDoc,
    sourceLoc: item.sourceLoc,
  };
}

// Hard requirements (schema shape). A failure pre-marks the candidate
// "rejected: malformed" so it is counted but never curated in.
export function validateCandidate(q, sourceNames) {
  const keys = (q.options ?? []).map((o) => o.key);
  if (keys.length !== 4 || new Set(keys).size !== 4) return 'options must be exactly A-D';
  if (!keys.includes(q.answer)) return 'answer key not among options';
  const fbKeys = new Set((q.distractorFeedback ?? []).map((d) => d.key));
  for (const k of keys) {
    if (k !== q.answer && !fbKeys.has(k)) return `missing distractor feedback for ${k}`;
  }
  if (!q.feedbackCorrect || q.feedbackCorrect.length < 20) return 'feedbackCorrect too short';
  if (!q.stem || q.stem.length < 20) return 'stem too short';
  if (!sourceNames.includes(q.sourceDoc)) return `sourceDoc "${q.sourceDoc}" not a provided source`;
  if (q.type === 'scenario-mcq' && !q.selfExplainPrompt) return 'scenario-mcq missing selfExplainPrompt';
  return null;
}

// Schema shape → the YAML record stored in week-NN.candidates.yaml.
export function toCandidateRecord(q, { id, week, promptVersion, problem }) {
  return {
    id,
    week,
    type: q.type,
    status: problem ? 'rejected: malformed' : 'candidate',
    ...(problem ? { rejectNote: problem } : {}),
    promptVersion,
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    feedback: {
      correct: q.feedbackCorrect,
      ...Object.fromEntries((q.distractorFeedback ?? []).map((d) => [d.key, d.text])),
    },
    ...(q.selfExplainPrompt ? { selfExplainPrompt: q.selfExplainPrompt } : {}),
    source: { doc: q.sourceDoc, loc: q.sourceLoc },
  };
}

export function buildCandidatesDoc({ week, questions, promptVersion, model, sourceNames }) {
  const ww = String(week).padStart(2, '0');
  let malformed = 0;
  const doc = {
    week,
    title: `Week ${week} — CANDIDATES (curate before build)`,
    promptVersion,
    model,
    generated: questions.length,
    questions: questions.map((q, i) => {
      const problem = validateCandidate(q, sourceNames);
      if (problem) malformed += 1;
      return toCandidateRecord(q, { id: `w${ww}-c${String(i + 1).padStart(2, '0')}`, week, promptVersion, problem });
    }),
  };
  return { doc, malformed };
}

// Quoted spans, tokenised rather than regexed: `A "X" b "Y" c` yields X and Y,
// never the text between two quoted titles (which a greedy open…close regex
// mistook for a quotation in Week 2).
export function quotedSpans(text) {
  const parts = String(text ?? '').replace(/[“”]/g, '"').split('"');
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push(parts[i]);
  return out;
}

// A 15+ word quotation is a copyright red flag: generated questions are
// grounded in publisher/case materials and should paraphrase.
export const MAX_QUOTED_WORDS = 15;
export function longQuote(text, maxWords = MAX_QUOTED_WORDS) {
  for (const span of quotedSpans(text)) {
    if (span.length < 40) continue;
    if (span.trim().split(/\s+/).length > maxWords) return span;
  }
  return null;
}

const ALL_CAPS = /\b[A-Z][A-Z0-9]{1,5}s?\b/g;

function sourceNamedInStem(stem, doc) {
  if (/\bChapter \d/.test(stem)) return true;
  if (/["“‘'][^"”’']{8,}["”’']/.test(stem)) return true; // a quoted title
  const words = String(doc ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length >= 4 && !DOC_STOPWORDS.has(w.toLowerCase()));
  return words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(stem));
}

// Style lint for the curation page — warnings, not failures. Works on the YAML
// record (feedback map, source object); the review page and the bank lint
// both hold that shape.
export function lintCandidate(q) {
  const warnings = [];
  const options = q.options ?? [];
  const texts = options.map((o) => String(o.text ?? '').trim());
  const lens = texts.map((t) => t.length);
  const ai = options.findIndex((o) => o.key === q.answer);
  if (ai >= 0 && lens.length === 4) {
    const others = lens.filter((_, i) => i !== ai);
    if (lens[ai] > Math.max(...others)) warnings.push('correct option is the longest');
    if (Math.max(...lens) > Math.min(...lens) * 1.35 && Math.min(...lens) > 20) warnings.push(`option lengths spread >35% (${lens.join('/')})`);
    const just = /\b(because|since)\b/i;
    if (just.test(texts[ai]) && !texts.some((t, i) => i !== ai && just.test(t))) warnings.push('only the correct option carries a because/since justification');
    if (texts.filter((t) => /^(yes|no)\b/i.test(t)).length >= 3) warnings.push('yes/no verdict option set (Week 1 rejected these as ambiguous)');
  }

  const stem = String(q.stem ?? '');
  if (/which reasoning|which of the following is (true|correct)|which statement is (true|correct)/i.test(stem)) warnings.push('stem asks which reasoning/statement is true — ask for a decision or diagnosis');
  if (!sourceNamedInStem(stem, q.source?.doc)) warnings.push('stem does not name its source (chapter, article, book, or news event)');

  const corpus = stem + ' ' + texts.join(' ');
  const seen = new Set();
  for (const m of corpus.matchAll(ALL_CAPS)) {
    const acr = m[0].replace(/s$/, '');
    if (PLAIN_ACRONYMS.has(acr) || /^\d/.test(acr) || acr.length < 2 || seen.has(acr)) continue;
    seen.add(acr);
    if (!new RegExp(`\\(${acr}s?\\)`).test(corpus)) warnings.push(`acronym ${acr} is never spelled out in the stem or options`);
  }
  if (texts.length && texts.every((t) => /^[A-Z][A-Z0-9]{1,5}$/.test(t))) warnings.push('option set is bare acronyms');

  const fb = q.feedback ?? {};
  for (const t of [stem, fb.correct, ...Object.values(fb), q.selfExplainPrompt]) {
    const hit = longQuote(t);
    if (hit) { warnings.push(`quoted span over ${MAX_QUOTED_WORDS} words: "${hit.slice(0, 60)}…"`); break; }
  }
  return warnings;
}

// Batch-level numbers for the console and the review page header.
export function batchStats(records) {
  const keys = Object.fromEntries(KEYS.map((k) => [k, 0]));
  const types = {};
  const bySource = {};
  let longestCorrect = 0;
  let shortestCorrect = 0;
  for (const q of records) {
    if (q.answer in keys) keys[q.answer] += 1;
    types[q.type] = (types[q.type] ?? 0) + 1;
    const doc = q.source?.doc ?? q.sourceDoc ?? '(none)';
    bySource[doc] = (bySource[doc] ?? 0) + 1;
    const lens = (q.options ?? []).map((o) => String(o.text ?? '').trim().length);
    const ai = (q.options ?? []).findIndex((o) => o.key === q.answer);
    if (ai >= 0 && lens[ai] > Math.max(...lens.filter((_, i) => i !== ai))) longestCorrect += 1;
    // Week 3: "never the longest" was overcorrected into "usually the shortest".
    if (ai >= 0 && lens[ai] < Math.min(...lens.filter((_, i) => i !== ai))) shortestCorrect += 1;
  }
  return { total: records.length, keys, types, bySource, longestCorrect, shortestCorrect };
}

export function formatStats(s) {
  const keys = KEYS.map((k) => `${k}=${s.keys[k]}`).join(' ');
  const types = Object.entries(s.types).map(([t, n]) => `${t}=${n}`).join(' ');
  return `${s.total} candidates · keys ${keys} · ${types} · correct-is-longest ${s.longestCorrect}/${s.total} · correct-is-shortest ${s.shortestCorrect}/${s.total}`;
}
