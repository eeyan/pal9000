// Groundwork generation CLI — over-generates candidate questions grounded in a
// week's course materials, for human curation into content/questions/week-NN.yaml.
//
// Usage:   node scripts/generate.js <week-number> [target-count] [--force]
// Input:   content/sources/week-NN/  (.md/.txt read as text; .pdf sent natively;
//          .pptx not supported — export the deck to PDF first)
// Output:  content/questions/week-NN.candidates.yaml (status: candidate on every
//          question — curate by setting accepted / edited / rejected: <reason>,
//          then run `node scripts/eval-log.js <week>` to log the batch)
//
// Runs locally only (needs ANTHROPIC_API_KEY or an `ant auth login` profile).
// Never wired into CI — see docs/SPEC.md.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import yaml from 'js-yaml';

const PROMPT_VERSION = 'gen-v1';
const MODEL = 'claude-opus-4-8';
const MAX_TARGET = 40;
// Request-size guards: the API caps requests at 32 MB; leave headroom for
// base64 overhead and prompt text. Token estimate is rough (chars/4 for text,
// bytes/4 for PDFs post-base64) against the 1M context window.
const MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;
const MAX_EST_TOKENS = 800_000;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== '--force');
const force = process.argv.includes('--force');
const week = Number(args[0]);
const target = Number(args[1] ?? 10);
if (!Number.isInteger(week) || week < 1) {
  die('Usage: node scripts/generate.js <week-number> [target-count] [--force]');
}
if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET) {
  die(`target-count must be an integer between 1 and ${MAX_TARGET} (got "${args[1]}").`);
}

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  // `ant auth login` profiles also work — only hard-fail with guidance if the
  // SDK can't find anything at request time; warn here so the fix is obvious.
  console.error('Note: no ANTHROPIC_API_KEY set — relying on an `ant auth login` profile if one exists.');
}

const ww = String(week).padStart(2, '0');
const sourceDir = join('content/sources', `week-${ww}`);
const outPath = join('content/questions', `week-${ww}.candidates.yaml`);

if (existsSync(outPath) && !force) {
  die(`${outPath} already exists — it may hold in-progress curation.\nRe-run with --force to overwrite, or finish curating and move accepted questions to week-${ww}.yaml first.`);
}
if (!existsSync(sourceDir)) {
  die(`No source material at ${sourceDir}/ — drop this week's slides (as PDF), readings, and notes there first.`);
}

const sourceBlocks = [];
const sourceNames = [];
let payloadBytes = 0;
let estTokens = 0;
for (const file of readdirSync(sourceDir).sort()) {
  const path = join(sourceDir, file);
  if (/\.(md|txt)$/i.test(file)) {
    const text = readFileSync(path, 'utf8');
    sourceBlocks.push({ type: 'text', text: `<source doc="${file}">\n${text}\n</source>` });
    sourceNames.push(file);
    payloadBytes += text.length;
    estTokens += Math.ceil(text.length / 4);
  } else if (/\.pdf$/i.test(file)) {
    const bytes = readFileSync(path);
    sourceBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
      title: file,
    });
    sourceNames.push(file);
    payloadBytes += Math.ceil(bytes.length * 4 / 3);
    estTokens += Math.ceil(bytes.length / 4);
  } else if (/\.pptx?$/i.test(file)) {
    console.error(`Skipping ${file} — export PPTX decks to PDF first (File → Export → PDF).`);
  }
}
if (sourceBlocks.length === 0) {
  die(`No usable sources in ${sourceDir}/ (need .md, .txt, or .pdf).`);
}
if (payloadBytes > MAX_PAYLOAD_BYTES) {
  die(`Sources total ~${Math.round(payloadBytes / 1024 / 1024)} MB — over the request limit. Split the week into smaller runs or compress the PDFs.`);
}
if (estTokens > MAX_EST_TOKENS) {
  die(`Sources estimate ~${Math.round(estTokens / 1000)}k tokens — too close to the context window. Split the week into smaller runs.`);
}

const overGenerate = target * 3;

const SYSTEM = `You generate practice questions for PAL 9000, the study tool for CIS 9000 (IT Strategy, MBA-level, Baruch College). Students are part-time working adults; the exam is concept + case based.

Ground every question ONLY in the provided course materials — never in outside knowledge. Every question must cite the specific document and location (slide numbers, section heading, or page) it is grounded in. If you cannot cite it, do not write it. Never copy sentences from the materials verbatim — always paraphrase into original scenario prose.

Question quality rules (violations get rejected in curation — they count against your accept rate):
- Scenario stems are context-rich mini-situations with a decision, mirroring case-based exam reasoning. Never "Which of the following is true?".
- Never leak the answer into the stem (no acronym expansions in a stem asking for the acronym's meaning, no restating the correct option).
- Each distractor encodes a real, nameable misconception; its feedback entry names that misconception. No filler distractors.
- Correct-answer feedback teaches the underlying principle in 2-3 sentences.
- Self-explanation prompts chain the tested concept to a second course concept.
- Concept-level, not trivia. Vendor-neutral generic names unless the material itself teaches a named case.
- Mix: roughly 70% scenario-mcq, 30% definitional.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'stem', 'options', 'answer', 'feedbackCorrect', 'distractorFeedback', 'selfExplainPrompt', 'sourceDoc', 'sourceLoc'],
        properties: {
          type: { type: 'string', enum: ['scenario-mcq', 'definitional'] },
          stem: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'text'],
              properties: { key: { type: 'string', enum: ['A', 'B', 'C', 'D'] }, text: { type: 'string' } },
            },
          },
          answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          feedbackCorrect: { type: 'string' },
          distractorFeedback: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'text'],
              properties: { key: { type: 'string', enum: ['A', 'B', 'C', 'D'] }, text: { type: 'string' } },
            },
          },
          selfExplainPrompt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          sourceDoc: { type: 'string' },
          sourceLoc: { type: 'string' },
        },
      },
    },
  },
};

// The JSON schema can't express everything (no minItems/uniqueness in
// structured outputs) — validate each candidate post-parse. Failures are kept
// but pre-marked rejected so they're visible and counted, never curated in.
function validate(q, names) {
  const keys = (q.options ?? []).map((o) => o.key);
  if (keys.length !== 4 || new Set(keys).size !== 4) return 'options must be exactly A-D';
  if (!keys.includes(q.answer)) return 'answer key not among options';
  const fbKeys = new Set((q.distractorFeedback ?? []).map((d) => d.key));
  for (const k of keys) {
    if (k !== q.answer && !fbKeys.has(k)) return `missing distractor feedback for ${k}`;
  }
  if (!q.feedbackCorrect || q.feedbackCorrect.length < 20) return 'feedbackCorrect too short';
  if (!q.stem || q.stem.length < 20) return 'stem too short';
  if (!names.includes(q.sourceDoc)) return `sourceDoc "${q.sourceDoc}" not a provided source`;
  if (q.type === 'scenario-mcq' && !q.selfExplainPrompt) return 'scenario-mcq missing selfExplainPrompt';
  return null;
}

const client = new Anthropic();

console.log(`Generating ${overGenerate} candidates for week ${week} from: ${sourceNames.join(', ')} (~${Math.round(estTokens / 1000)}k input tokens est.)`);

const stream = client.messages.stream({
  model: MODEL,
  max_tokens: 64000,
  thinking: { type: 'adaptive' },
  system: SYSTEM,
  output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  messages: [
    {
      role: 'user',
      content: [
        ...sourceBlocks,
        {
          type: 'text',
          text: `Generate exactly ${overGenerate} candidate questions for week ${week} from these materials. The curated target is ${target}, so cover the material broadly rather than clustering on one topic. sourceDoc must be one of: ${sourceNames.join(', ')}.`,
        },
      ],
    },
  ],
});

const message = await stream.finalMessage();

if (message.stop_reason === 'refusal') {
  die('Generation refused by the model — check the source material and retry.');
}
if (message.stop_reason === 'max_tokens') {
  die(`Hit max_tokens — output is truncated and unusable. Lower the target (currently ${target} → ${overGenerate} candidates) or split the sources across runs.`);
}

const textBlock = message.content.find((b) => b.type === 'text');
if (!textBlock) {
  die('No text block in the response — nothing to parse. Inspect the run and retry.');
}

let questions;
try {
  ({ questions } = JSON.parse(textBlock.text));
} catch (err) {
  die(`Response was not valid JSON (${err.message}) — inspect the run and retry.`);
}

let malformed = 0;
const doc = {
  week,
  title: `Week ${week} — CANDIDATES (curate before build)`,
  promptVersion: PROMPT_VERSION,
  generated: questions.length,
  questions: questions.map((q, i) => {
    const problem = validate(q, sourceNames);
    if (problem) malformed += 1;
    return {
      id: `w${ww}-c${String(i + 1).padStart(2, '0')}`,
      week,
      type: q.type,
      status: problem ? 'rejected: malformed' : 'candidate',
      ...(problem ? { rejectNote: problem } : {}),
      promptVersion: PROMPT_VERSION,
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
  }),
};

writeFileSync(outPath, yaml.dump(doc, { lineWidth: 100 }));
console.log(`Wrote ${questions.length} candidates to ${outPath}${malformed ? ` (${malformed} pre-marked "rejected: malformed")` : ''}`);
console.log(`Output tokens used: ${message.usage.output_tokens}`);
console.log('Curate: set status to accepted / edited / "rejected: <reason>" (hallucination|leakage|trivia|ambiguous|duplicate),');
console.log(`move accepted questions into content/questions/week-${ww}.yaml with sequential ids, then run: node scripts/eval-log.js ${week}`);
