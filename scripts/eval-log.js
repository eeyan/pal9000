// Appends an EVAL-LOG row from a curated candidates file, so the eval artifact
// is a byproduct of curation instead of a manual chore.
//
// Usage: node scripts/eval-log.js <week-number>
// Reads: content/questions/week-NN.candidates.yaml (post-curation statuses)
// Writes: appends a Markdown table row to docs/EVAL-LOG.md

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const week = Number(process.argv[2]);
if (!Number.isInteger(week) || week < 1) {
  console.error('Usage: node scripts/eval-log.js <week-number>');
  process.exit(1);
}

const ww = String(week).padStart(2, '0');
const candidatesPath = join('content/questions', `week-${ww}.candidates.yaml`);
const logPath = 'docs/EVAL-LOG.md';

if (!existsSync(candidatesPath)) {
  console.error(`${candidatesPath} not found — run the generator and curate it first.`);
  process.exit(1);
}

const doc = yaml.load(readFileSync(candidatesPath, 'utf8'));
const questions = doc.questions ?? [];

const uncurated = questions.filter((q) => q.status === 'candidate').length;
if (uncurated > 0) {
  console.error(`${uncurated} question(s) still have status "candidate" — finish curating before logging.`);
  process.exit(1);
}

const accepted = questions.filter((q) => ['accepted', 'edited'].includes(q.status)).length;
const rejects = {};
for (const q of questions) {
  const m = /^rejected:\s*(.+)$/.exec(q.status ?? '');
  if (m) rejects[m[1]] = (rejects[m[1]] ?? 0) + 1;
}
const rejected = Object.values(rejects).reduce((a, b) => a + b, 0);
const generated = questions.length;
const rate = Math.round((accepted / generated) * 100);
const reasons = Object.entries(rejects).map(([r, n]) => `${r} ×${n}`).join(', ') || '—';
const date = new Date().toISOString().slice(0, 10);
const title = (doc.title ?? '').replace(/^Week \d+ — /, '').replace(/ — CANDIDATES.*$/, '').replace(/CANDIDATES.*$/, '').trim();

const row = `| ${date} | ${doc.promptVersion} | ${week}${title ? ` — ${title}` : ''} | ${generated} | ${accepted} | ${rejected} | ${rate}% | ${reasons} |`;

let log = readFileSync(logPath, 'utf8');
const heading = `## ${doc.promptVersion}`;
if (!log.includes(heading)) {
  log += `\n${heading}\n\n| Date | promptVersion | Week | Generated | Accepted | Rejected | Accept rate | Reject reasons |\n|---|---|---|---|---|---|---|---|\n`;
}
log = log.trimEnd() + '\n';
// Insert under the matching section if it exists mid-file, else append.
const idx = log.indexOf(heading);
const nextSection = log.indexOf('\n## ', idx + heading.length);
if (nextSection === -1) {
  log += row + '\n';
} else {
  log = log.slice(0, nextSection) + row + '\n' + log.slice(nextSection);
}

writeFileSync(logPath, log);
console.log(`Logged: ${row}`);
