// Groundwork generation CLI — over-generates candidate questions grounded in a
// week's course materials, for human curation into content/questions/week-NN.yaml.
//
// Usage:   node scripts/generate.js <week-number> [target-count]
// Input:   content/sources/week-NN/  (.md/.txt read as text; .pdf sent natively;
//          .pptx not supported — export the deck to PDF first)
// Output:  content/questions/week-NN.candidates.yaml (status: candidate on every
//          question — curate by setting accepted / edited / rejected: <reason>)
//
// Runs locally only (needs ANTHROPIC_API_KEY or an `ant auth login` profile).
// Never wired into CI — see docs/SPEC.md.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import yaml from 'js-yaml';

const PROMPT_VERSION = 'gen-v1';
const MODEL = 'claude-opus-4-8';

const week = Number(process.argv[2]);
const target = Number(process.argv[3] ?? 10);
if (!Number.isInteger(week) || week < 1) {
  console.error('Usage: node scripts/generate.js <week-number> [target-count]');
  process.exit(1);
}

const ww = String(week).padStart(2, '0');
const sourceDir = join('content/sources', `week-${ww}`);
const outPath = join('content/questions', `week-${ww}.candidates.yaml`);

if (!existsSync(sourceDir)) {
  console.error(`No source material at ${sourceDir}/ — drop this week's slides (as PDF), readings, and notes there first.`);
  process.exit(1);
}

const sourceBlocks = [];
const sourceNames = [];
for (const file of readdirSync(sourceDir).sort()) {
  const path = join(sourceDir, file);
  if (/\.(md|txt)$/i.test(file)) {
    sourceBlocks.push({ type: 'text', text: `<source doc="${file}">\n${readFileSync(path, 'utf8')}\n</source>` });
    sourceNames.push(file);
  } else if (/\.pdf$/i.test(file)) {
    sourceBlocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: readFileSync(path).toString('base64') },
      title: file,
    });
    sourceNames.push(file);
  } else if (/\.pptx?$/i.test(file)) {
    console.error(`Skipping ${file} — export PPTX decks to PDF first (File → Export → PDF).`);
  }
}
if (sourceBlocks.length === 0) {
  console.error(`No usable sources in ${sourceDir}/ (need .md, .txt, or .pdf).`);
  process.exit(1);
}

const overGenerate = target * 3;

const SYSTEM = `You generate practice questions for PAL 9000, the study tool for CIS 9000 (IT Strategy, MBA-level, Baruch College). Students are part-time working adults; the exam is concept + case based.

Ground every question ONLY in the provided course materials — never in outside knowledge. Every question must cite the specific document and location (slide numbers, section heading, or page) it is grounded in. If you cannot cite it, do not write it.

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

const client = new Anthropic();

console.log(`Generating ${overGenerate} candidates for week ${week} from: ${sourceNames.join(', ')}`);

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
  console.error('Generation refused by the model — check the source material and retry.');
  process.exit(1);
}
if (message.stop_reason === 'max_tokens') {
  console.error('Hit max_tokens — output may be truncated. Lower the target or split the sources.');
}

const textBlock = message.content.find((b) => b.type === 'text');
const { questions } = JSON.parse(textBlock.text);

const doc = {
  week,
  title: `Week ${week} — CANDIDATES (curate before build)`,
  promptVersion: PROMPT_VERSION,
  generated: questions.length,
  questions: questions.map((q, i) => ({
    id: `w${ww}-c${String(i + 1).padStart(2, '0')}`,
    week,
    type: q.type,
    status: 'candidate',
    promptVersion: PROMPT_VERSION,
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    feedback: {
      correct: q.feedbackCorrect,
      ...Object.fromEntries(q.distractorFeedback.map((d) => [d.key, d.text])),
    },
    ...(q.selfExplainPrompt ? { selfExplainPrompt: q.selfExplainPrompt } : {}),
    source: { doc: q.sourceDoc, loc: q.sourceLoc },
  })),
};

writeFileSync(outPath, yaml.dump(doc, { lineWidth: 100 }));
console.log(`Wrote ${questions.length} candidates to ${outPath}`);
console.log(`Curate: set status to accepted / edited / "rejected: <reason>" (hallucination|leakage|trivia|ambiguous|duplicate),`);
console.log(`move accepted questions into content/questions/week-${ww}.yaml with sequential ids, and log counts in docs/EVAL-LOG.md.`);
