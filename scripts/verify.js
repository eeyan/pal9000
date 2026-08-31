#!/usr/bin/env node
// Verify pasted PAL 9000 completion logs in bulk.
//
//   node scripts/verify.js submissions.txt            # one or many logs, concatenated
//   node scripts/verify.js --set 1 submissions.txt    # only count weeks in set 1
//   node scripts/verify.js --csv submissions.txt      # CSV instead of a table
//   cat log.txt | node scripts/verify.js
//
// Input is plain text: every "PAL 9000 · COMPLETION LOG" header starts a new
// student's log. Paste Brightspace text submissions one after another (or
// export them and concatenate). Output: one row per log with the count of
// weeks whose codes verify, plus flags — codes that don't verify, unsigned
// records, records signed under a different name, and codes that appear in
// more than one student's log (shared screenshots).
import { readFileSync } from 'node:fs';
import { LOG_HEADER, parseLog, verifyCompletion } from '../src/assets/js/completion.js';
import { SETS } from '../src/assets/js/sets.js';

const args = process.argv.slice(2);
let onlySet = null;
let csv = false;
const files = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--set') onlySet = Number(args[++i]);
  else if (args[i] === '--csv') csv = true;
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('usage: node scripts/verify.js [--set N] [--csv] [file ...]  (stdin if no file)');
    process.exit(0);
  } else files.push(args[i]);
}
if (onlySet !== null && !SETS.some((s) => s.set === onlySet)) {
  console.error(`No such set: ${onlySet}. Sets: ${SETS.map((s) => s.set).join(', ')}`);
  process.exit(2);
}

const text = files.length
  ? files.map((f) => readFileSync(f, 'utf8')).join('\n')
  : readFileSync(0, 'utf8');

// Split on the log header; anything before the first header is ignored.
const chunks = text.split(LOG_HEADER).slice(1);
if (chunks.length === 0) {
  console.error(`No logs found — expected at least one "${LOG_HEADER}" header.`);
  process.exit(2);
}

const wanted = new Set((onlySet === null ? SETS : SETS.filter((s) => s.set === onlySet)).flatMap((s) => s.weeks));
const setOfWeek = (w) => SETS.find((s) => s.weeks.includes(w))?.set ?? null;
const checkpointFor = (w) => SETS.find((s) => s.weeks.includes(w))?.checkpointDate ?? null;

const seenCodes = new Map(); // code → first log index
const sharedFrom = new Set(); // log indexes whose codes reappeared later
const rows = [];
for (const [i, chunk] of chunks.entries()) {
  const log = parseLog(chunk);
  const flags = [];
  const valid = new Set();
  for (const rec of log.records) {
    if (!wanted.has(rec.week)) continue;
    const label = `W${String(rec.week).padStart(2, '0')}`;
    if (!rec.code) {
      flags.push(`${label} unsigned`);
      continue;
    }
    if (valid.has(rec.week)) {
      flags.push(`${label} duplicated`);
      continue;
    }
    const name = rec.name ?? log.name;
    if (rec.name !== null) flags.push(`${label} signed as "${rec.name}"`);
    const { ok, at } = await verifyCompletion({ week: rec.week, code: rec.code, score: rec.score, total: rec.total, name });
    if (!ok) {
      flags.push(`${label} code invalid`);
      continue;
    }
    const cp = checkpointFor(rec.week);
    if (at > Date.now()) flags.push(`${label} dated in the future`);
    else if (cp && at > Date.parse(`${cp}T23:59:59`)) flags.push(`${label} completed after checkpoint`);
    if (seenCodes.has(rec.code)) {
      flags.push(`${label} code also in log #${seenCodes.get(rec.code) + 1}`);
      sharedFrom.add(seenCodes.get(rec.code));
    } else seenCodes.set(rec.code, i);
    valid.add(rec.week);
  }
  if (!log.name) flags.unshift('no name');
  const bySet = {};
  for (const w of valid) bySet[setOfWeek(w)] = (bySet[setOfWeek(w)] ?? 0) + 1;
  rows.push({ n: i + 1, name: log.name || '(no name)', valid: valid.size, bySet, weeks: [...valid].sort((a, b) => a - b), flags });
}

// Shared codes are flagged on the later log as they're met; mark the earlier one too.
for (const i of sharedFrom) rows[i].flags.push('code shared with a later log');

const setCols = (onlySet === null ? SETS : SETS.filter((s) => s.set === onlySet)).map((s) => s.set);
if (csv) {
  const q = (v) => `"${String(v).replaceAll('"', '""')}"`;
  console.log(['#', 'name', ...setCols.map((s) => `set${s}`), 'weeks', 'flags'].join(','));
  for (const r of rows) {
    console.log([r.n, q(r.name), ...setCols.map((s) => r.bySet[s] ?? 0), q(r.weeks.join(' ')), q(r.flags.join('; '))].join(','));
  }
} else {
  const w = Math.max(4, ...rows.map((r) => r.name.length));
  console.log(['#'.padStart(3), 'NAME'.padEnd(w), ...setCols.map((s) => `SET${s}`), 'WEEKS'.padEnd(20), 'FLAGS'].join('  '));
  for (const r of rows) {
    console.log([
      String(r.n).padStart(3), r.name.padEnd(w),
      ...setCols.map((s) => String(r.bySet[s] ?? 0).padStart(4)),
      r.weeks.map((x) => `W${String(x).padStart(2, '0')}`).join(' ').padEnd(20),
      r.flags.join('; ') || '—',
    ].join('  '));
  }
  console.log(`\n${rows.length} log${rows.length === 1 ? '' : 's'} checked.`);
}
