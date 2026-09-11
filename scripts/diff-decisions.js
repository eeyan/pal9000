// Compares two curation-decision files for the same week (the curator's export
// from the review page and an independent reviewer's), prints the per-question
// disagreements and agreement rates, and can merge them into one decisions file
// for scripts/curate.js.
//
// Usage:  node scripts/diff-decisions.js <a.json> <b.json> [--merge <out.json>] [--prefix "Reviewer:"]
//         Both files are { week, decisions: { "wNN-cNN": { status, reason?, note? } } }.
// Merge:  a's status wins; where b disagrees its status is recorded in the note;
//         b's notes are appended with the prefix; an "accepted" in a that b wants
//         edited becomes "edited" so the note is acted on.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith('--') && !['--merge', '--prefix'].includes(args[i - 1]));
if (files.length !== 2) die('Usage: node scripts/diff-decisions.js <a.json> <b.json> [--merge <out.json>] [--prefix "Reviewer:"]');

const load = (f) => {
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch (err) { die(`${f}: ${err.message}`); }
};
const A = load(files[0]);
const B = load(files[1]);
const a = A.decisions ?? A;
const b = B.decisions ?? B;
if (A.week !== undefined && B.week !== undefined && Number(A.week) !== Number(B.week)) die(`Week mismatch: ${A.week} vs ${B.week}`);
const week = Number(A.week ?? B.week);

// Stems for context, when the candidates file is at hand.
let stems = {};
if (Number.isInteger(week)) {
  const p = join('content/questions', `week-${String(week).padStart(2, '0')}.candidates.yaml`);
  if (existsSync(p)) {
    for (const q of yaml.load(readFileSync(p, 'utf8')).questions ?? []) stems[q.id] = q.stem;
  }
}

const fmt = (d) => (d ? d.status + (d.reason ? ` (${d.reason})` : '') : '—');
const keep = (d) => d && d.status !== 'rejected';
const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
let exact = 0;
let keepAgree = 0;
console.log(`${'id'.padEnd(10)}${'A'.padEnd(24)}${'B'.padEnd(24)}stem`);
for (const id of ids) {
  const da = a[id];
  const db = b[id];
  const same = da?.status === db?.status;
  const sameKeep = keep(da) === keep(db);
  if (same) exact += 1;
  if (sameKeep) keepAgree += 1;
  const mark = same ? '  ' : (sameKeep ? '~ ' : '!!');
  console.log(`${mark}${id.padEnd(8)}${fmt(da).padEnd(24)}${fmt(db).padEnd(24)}${(stems[id] ?? '').replace(/\s+/g, ' ').slice(0, 56)}`);
}
console.log(`\nexact status agreement ${exact}/${ids.length} · keep-vs-reject agreement ${keepAgree}/${ids.length}`);
console.log('!! keep/reject disagreement · ~ same fate, different status');

const out = value('--merge');
if (out) {
  const prefix = value('--prefix') ?? 'Reviewer:';
  const merged = {};
  for (const id of ids) {
    const da = a[id];
    const db = b[id];
    if (!da) { merged[id] = { ...db }; continue; }
    const m = { ...da };
    const notes = [da.note];
    if (db && db.status !== da.status) notes.push(`${prefix} ${fmt(db)}${db.note ? ` — ${db.note}` : ''}`);
    else if (db?.note) notes.push(`${prefix} ${db.note}`);
    if (m.status === 'accepted' && db?.status === 'edited') m.status = 'edited';
    const note = notes.filter(Boolean).join(' | ');
    if (note) m.note = note; else delete m.note;
    merged[id] = m;
  }
  writeFileSync(out, JSON.stringify({ week, mergedAt: new Date().toISOString(), decisions: merged }, null, 2));
  console.log(`Merged → ${out}  (then: node scripts/curate.js ${week} ${out})`);
}
