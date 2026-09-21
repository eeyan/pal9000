// Groundwork generation CLI — over-generates candidate questions grounded in a
// week's course materials, for human curation into content/questions/week-NN.yaml.
//
// Usage:   node scripts/generate.js <week-number> [target-count] [--force]
// Input:   content/sources/week-NN/  (.md/.txt read as text; .pdf sent natively;
//          .vtt/.srt class transcripts (Zoom cloud recording → "audio transcript")
//          are flattened to text and tagged as discussion sources — name them
//          with the class date, e.g. class-2026-09-01.vtt, so citations carry it;
//          .pptx not supported — export the deck to PDF first)
// Output:  content/questions/week-NN.candidates.yaml (status: candidate on every
//          question — curate by setting accepted / edited / rejected: <reason>,
//          then run `node scripts/eval-log.js <week>` to log the batch)
//
// Runs locally only (needs ANTHROPIC_API_KEY or an `ant auth login` profile).
// Never wired into CI — see docs/SPEC.md.
//
// Alternative path: generate in an interactive Claude Code session instead of
// via the API (subscription-billed, no key). The session must write the same
// candidates file shape this script does (see the `doc` object at the bottom)
// so curation and scripts/eval-log.js work unchanged; set `model` to the
// session model and keep `promptVersion` honest about which prompt was used.

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import yaml from 'js-yaml';
import { TRANSCRIPT_FILE_RE, transcriptToText, dateFromFilename } from '../src/lib/transcript.js';
import { buildCandidatesDoc, batchStats, formatStats } from '../src/lib/candidates.js';

const PROMPT_VERSION = 'gen-v4'; // v2 (2026-09-08): option parallelism + direct stems, from Week 1 curation findings
// v3 (2026-09-11): name the source, spell out acronyms, real-claim distractors, proportional coverage — from Week 2 curation findings
// v4 (2026-09-20): correct option mid-length (not shortest either), no stem-to-key echo, bare-term option sets, grounded feedback, honest cross-source framing, one item per keyed concept — from Week 3 curation findings
// Not pinned: the model is a per-batch choice, recorded in the candidates file
// and in EVAL-LOG next to promptVersion. Override with PAL_MODEL=<id>.
const MODEL = process.env.PAL_MODEL ?? 'claude-fable-5-1';
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
const transcriptNames = [];
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
  } else if (TRANSCRIPT_FILE_RE.test(file)) {
    const text = transcriptToText(readFileSync(path, 'utf8'));
    const date = dateFromFilename(file);
    sourceBlocks.push({ type: 'text', text: `<source doc="${file}" kind="class-transcript"${date ? ` date="${date}"` : ''}>\n${text}\n</source>` });
    sourceNames.push(file);
    transcriptNames.push(file);
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
  die(`No usable sources in ${sourceDir}/ (need .md, .txt, .pdf, or a .vtt/.srt transcript).`);
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
- Mix: roughly 70% scenario-mcq, 30% definitional.

Option parallelism (the Week 1 batch failed this in 28 of 30 questions — students learn to pick the longest option):
- All four options share one grammatical form and are close in length (within about 25% of each other). The correct option must be neither the longest nor the shortest of the four — aim for the middle (Week 3 overcorrected: shortest in 14 of 30, which is just a different tell). It must not be the only option carrying a "because…" or "since…" clause, and must not be the only one without one. Put the reasoning in the feedback, not in the correct option.
- Distractors get the same fullness of wording as the correct option.

Stems ask a direct question:
- The stem ends in a question whose answer is a decision or a diagnosis: "Which component is undermining the system?", "What should the COO change?", "Which term describes this?". Never "Which reasoning best matches/applies…" and never an option set of yes/no verdicts with reasons attached — those were rejected as ambiguous.
- One situation, one decision. If a stem needs two projects and a reversal, split it.

Name what you are testing (the Week 2 batch lost 8 of 30 to this in curation):
- Say which source the question draws on, in the stem: the book title and chapter ("Chapter 1 of The Adventures of an IT Leader"), the article and author ("Carr's 'IT Doesn't Matter'", "Andreessen's 'Why Software Is Eating the World'"), or the news event by name. Never "the chapter", "the essay", "a report", "the reading".
- Spell out every acronym the first time it appears in a stem or option set ("enterprise resource planning (ERP)", "customer relationship management (CRM)"). Never build an option set out of bare acronyms.
- When the source teaches a named case, use the names (Borders and Amazon, American Hospital Supply); do not anonymize them into "a bookstore chain".
- Distractors are real claims or terms from the source that do not fit the scenario, not negations or inversions of the correct claim. If knowing the direction of the author's thesis is enough to answer, rewrite the distractors. Test: if a distractor's feedback would read "the source says the opposite", it is a reversal — replace it with something the source does say that fails to answer this question. Never invent events for a named case (an acquisition offer, an expansion, an outsourcing deal the source never mentions).

Do not let the wording answer the question (Week 3 needed fixes on 9 of 30 for this, all invisible to lint):
- No stem-to-key echo. The distinctive word of the correct option, or an obvious cue for it, must not appear in the stem: a stem about warehouses and shipped discs keyed to "logistics", "new carriers" keyed to "new entrants", "what the firm actually pays" keyed to "the sum actually disbursed". Describe the situation in neutral terms and let the concept do the work.
- When the options are the terms or cells of a framework, give the bare terms ("A reward strategy"), never each term followed by its definition — self-defining options let the scenario be matched to the definition without knowing the framework. Never build an option set where the answer is the largest number shown.
- The stem's closing question must be answerable, grammatically, by every option.
- One defensible answer. If the source gives several true reasons for a decision, ask about the one the scenario isolates. Check that the symptom in the scenario points to the keyed concept and not to a neighboring one, and that the scenario's own arithmetic supports the key (rising volume at flat margins is rising profit, not zero appropriation).

Feedback is held to the same grounding as the stem (Week 3: eight feedback lines said things the sources do not):
- Every number, name, day and sequence of events in feedback must be in the source. Keep the source's hedges ("more than $1,200", not "$1,200").
- Never assert a causal link the source does not make ("precisely because…") — two items appearing in the same exhibit is not a reason.
- Each distractor's feedback answers that distractor's claim, not its mirror image, and does not describe what "the slides say" unless the slide says it.

One item per keyed concept: two questions with the same key and the same distractor set are duplicates even when one is a scenario and one is a case. A second item on a concept must come at it from a different source and ask a different question.

Cover the material in proportion (Week 2 put five items on one article and one on the second half of the slide deck): spread candidates across every source roughly by its weight in the week, and across the whole slide deck including its later sections, before adding a second item on any one idea.

Connect sources when it is natural (the curator's favorite Week 1 item did this): apply a textbook framework to the week's reading or news item, or map a reading's advice onto a textbook concept. Cite both locations in sourceLoc. A cross-source item must use the second source's concept in its key or options — never write "Using Chapter N" in a stem whose options contain no Chapter N concept. Never force it: if a framework's dimensions do not honestly apply to the case (a flat-fee subscription has no obvious "repurchase frequency"), leave the case and the framework in separate questions.`;

// Class recordings are a different kind of source: what was actually said,
// including improvised examples and student questions. Worth mining, with
// guardrails — no logistics, no people.
const TRANSCRIPT_RULES = `

Sources marked kind="class-transcript" are automatic transcripts of the class session (the date attribute is the class date). For these:
- Treat them as the record of what was actually discussed — improvised examples, analogies, and student questions are the most valuable material, because the exam draws on them.
- Ignore logistics, small talk, technical difficulties, and anything about grading or the course itself.
- Never name, quote, or describe any student. Refer to contributions only as "a student asked/suggested"; never reproduce a student's words.
- Transcripts contain recognition errors — when a term is garbled, prefer the spelling used in the slides or readings, and skip a passage you cannot confidently interpret.
- For a question grounded mainly in a transcript, set sourceDoc to the transcript file and sourceLoc to "class discussion <date>" (use the transcript's date attribute; add the topic in a few words). About a third of the batch may come from the transcript; the rest from the slides and readings.`;

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

// Post-parse validation and the YAML shape live in src/lib/candidates.js,
// shared with scripts/build-candidates.js (the in-session path).

const client = new Anthropic();

console.log(`Generating ${overGenerate} candidates for week ${week} from: ${sourceNames.join(', ')} (~${Math.round(estTokens / 1000)}k input tokens est.)${transcriptNames.length ? `\n  class transcript${transcriptNames.length === 1 ? '' : 's'}: ${transcriptNames.join(', ')} — questions from these cite "class discussion <date>"` : ''}`);

const stream = client.messages.stream({
  model: MODEL,
  max_tokens: 64000,
  thinking: { type: 'adaptive' },
  system: SYSTEM + (transcriptNames.length ? TRANSCRIPT_RULES : ''),
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

const { doc, malformed } = buildCandidatesDoc({ week, questions, promptVersion: PROMPT_VERSION, model: MODEL, sourceNames });
const stats = batchStats(doc.questions);
writeFileSync(outPath, yaml.dump(doc, { lineWidth: 100 }));
console.log(`Wrote ${questions.length} candidates to ${outPath}${malformed ? ` (${malformed} pre-marked "rejected: malformed")` : ''}`);
console.log(`Output tokens used: ${message.usage.output_tokens}`);
console.log(formatStats(stats));
if (stats.longestCorrect > questions.length / 3) {
  console.warn(`Warning: the correct option is the longest option in ${stats.longestCorrect}/${questions.length} candidates — expect a length-balancing edit pass (chance level is ~25%).`);
}
if (stats.shortestCorrect > questions.length / 3) {
  console.warn(`Warning: the correct option is the shortest option in ${stats.shortestCorrect}/${questions.length} candidates — the longest-option rule has been overcorrected into a different tell (chance level is ~25%).`);
}
console.log('Curate: set status to accepted / edited / "rejected: <reason>" (hallucination|leakage|trivia|ambiguous|duplicate),');
console.log(`move accepted questions into content/questions/week-${ww}.yaml with sequential ids, then run: node scripts/eval-log.js ${week}`);
