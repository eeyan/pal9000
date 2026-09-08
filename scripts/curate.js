// Writes review-page decisions back into a week's candidates file, so the
// YAML is never edited by hand. Pairs with scripts/review.js.
//
// Usage:  node scripts/curate.js <week-number> [decisions.json]
//         pbpaste | node scripts/curate.js <week-number>      (stdin when no file)
// Reads:  content/questions/week-NN.candidates.yaml + the decisions JSON
//         { week, decisions: { "wNN-cNN": { status, reason?, note? } } }
// Writes: the same candidates file — status becomes accepted | edited |
//         "rejected: <reason>", and `note` carries the curator's guidance for a
//         better version (kept on the question so an edit pass can act on it).
//         Questions with no decision stay `candidate`.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const REJECT_REASONS = ['hallucination', 'leakage', 'trivia', 'ambiguous', 'duplicate'];

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const week = Number(process.argv[2]);
if (!Number.isInteger(week) || week < 1) die('Usage: node scripts/curate.js <week-number> [decisions.json]');

const ww = String(week).padStart(2, '0');
const candidatesPath = join('content/questions', `week-${ww}.candidates.yaml`);
if (!existsSync(candidatesPath)) die(`${candidatesPath} not found.`);

const input = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : readFileSync(0, 'utf8');
let payload;
try {
  payload = JSON.parse(input);
} catch (err) {
  die(`Decisions are not valid JSON (${err.message}). Use "Copy decisions" on the review page, then pipe pbpaste in.`);
}
if (payload.week !== undefined && Number(payload.week) !== week) {
  die(`Decisions are for week ${payload.week}, not week ${week}.`);
}
const decisions = payload.decisions ?? payload;
if (!decisions || typeof decisions !== 'object') die('No "decisions" object found in the JSON.');

const doc = yaml.load(readFileSync(candidatesPath, 'utf8'));
const byId = new Map((doc.questions ?? []).map((q) => [q.id, q]));

const counts = { accepted: 0, edited: 0, rejected: 0 };
const unknown = [];
for (const [id, d] of Object.entries(decisions)) {
  const q = byId.get(id);
  if (!q) { unknown.push(id); continue; }
  if (d.status === 'rejected') {
    if (!REJECT_REASONS.includes(d.reason)) die(`${id}: rejected without a valid reason (got "${d.reason ?? ''}"; need one of ${REJECT_REASONS.join('|')}).`);
    q.status = `rejected: ${d.reason}`;
  } else if (d.status === 'accepted' || d.status === 'edited') {
    q.status = d.status;
  } else {
    die(`${id}: unknown status "${d.status}".`);
  }
  counts[d.status] += 1;
  const note = typeof d.note === 'string' ? d.note.trim() : '';
  if (note) q.note = note;
  else delete q.note;
}

writeFileSync(candidatesPath, yaml.dump(doc, { lineWidth: 100 }));

const remaining = (doc.questions ?? []).filter((q) => q.status === 'candidate').map((q) => q.id);
const notes = (doc.questions ?? []).filter((q) => q.note).length;
console.log(`Updated ${candidatesPath}: ${counts.accepted} accepted, ${counts.edited} edited, ${counts.rejected} rejected${notes ? `, ${notes} with guidance notes` : ''}.`);
if (unknown.length) console.warn(`Ignored ${unknown.length} id(s) not in the file: ${unknown.join(', ')}`);
if (remaining.length) {
  console.log(`${remaining.length} still candidate: ${remaining.join(', ')}`);
  console.log(`Re-run node scripts/review.js ${week} to pick up where you left off.`);
} else {
  const editedTotal = (doc.questions ?? []).filter((q) => q.status === 'edited').length;
  console.log('Every question is decided. Next:');
  if (editedTotal) console.log(`  1. Act on the notes of the ${editedTotal} "edited" question(s) in the candidates file.`);
  console.log(`  ${editedTotal ? 2 : 1}. Move accepted/edited questions into content/questions/week-${ww}.yaml with sequential ids (w${ww}-q01…).`);
  console.log(`  ${editedTotal ? 3 : 2}. node scripts/eval-log.js ${week}`);
}
