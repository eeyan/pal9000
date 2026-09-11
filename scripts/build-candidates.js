// In-session generation, made a command: turns a batch authored as structured
// JSON into content/questions/week-NN.candidates.yaml with exactly the shape,
// validation and statistics scripts/generate.js produces — so curation,
// review, promote and eval-log work unchanged whichever path made the batch.
//
// Usage:  node scripts/build-candidates.js <week-number> <questions.json> [--force] [--model <id>]
// Input:  a JSON array of items in either shape:
//           structured  { type, stem, correct: {text, feedback}, distractors: [{text, feedback}×3],
//                         answerPos: 0-3, selfExplainPrompt?, sourceDoc, sourceLoc }
//           schema      { type, stem, options, answer, feedbackCorrect, distractorFeedback, … }
//         (the structured shape is the one to author in: letters are assigned here)
// Output: content/questions/week-NN.candidates.yaml (status: candidate; malformed
//         items pre-marked rejected), plus a batch summary on stdout
// promptVersion is read from scripts/generate.js so the two paths log the same
// version; the model defaults to the current session model and is recorded.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { fromStructured, buildCandidatesDoc, batchStats, formatStats, lintCandidate } from '../src/lib/candidates.js';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--model');
const week = Number(positional[0]);
const input = positional[1];
if (!Number.isInteger(week) || week < 1 || !input) {
  die('Usage: node scripts/build-candidates.js <week-number> <questions.json> [--force] [--model <id>]');
}

const ww = String(week).padStart(2, '0');
const sourceDir = join('content/sources', `week-${ww}`);
const outPath = join('content/questions', `week-${ww}.candidates.yaml`);
if (existsSync(outPath) && !flag('--force')) {
  die(`${outPath} already exists — it may hold in-progress curation. Re-run with --force to overwrite.`);
}
if (!existsSync(sourceDir)) die(`No source material at ${sourceDir}/ — sourceDoc values must be files there.`);

const sourceNames = readdirSync(sourceDir).filter((f) => /\.(md|txt|pdf|vtt|srt)$/i.test(f)).sort();
const promptVersion = /PROMPT_VERSION = '([^']+)'/.exec(readFileSync('scripts/generate.js', 'utf8'))?.[1] ?? 'unknown';
const model = value('--model') ?? 'claude-fable-5-1';

let items;
try {
  items = JSON.parse(readFileSync(input, 'utf8'));
} catch (err) {
  die(`Could not parse ${input}: ${err.message}`);
}
if (!Array.isArray(items) || items.length === 0) die('Input must be a non-empty JSON array of questions.');

const questions = items.map(fromStructured);
const { doc, malformed } = buildCandidatesDoc({ week, questions, promptVersion, model, sourceNames });
writeFileSync(outPath, yaml.dump(doc, { lineWidth: 100 }));

const stats = batchStats(doc.questions);
console.log(`Wrote ${doc.questions.length} candidates to ${outPath}${malformed ? ` (${malformed} pre-marked "rejected: malformed")` : ''}`);
console.log(`${promptVersion} · ${model} · ${formatStats(stats)}`);
for (const [d, n] of Object.entries(stats.bySource)) console.log(`  ${String(n).padStart(2)}  ${d}`);
const warned = doc.questions.map((q) => [q.id, lintCandidate(q)]).filter(([, w]) => w.length);
if (warned.length) {
  console.log(`Lint warnings on ${warned.length} candidate(s) (also shown on the review page):`);
  for (const [id, w] of warned) console.log(`  ${id}: ${w.join(' · ')}`);
}
console.log(`Next: node scripts/review.js ${week}`);
