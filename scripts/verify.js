#!/usr/bin/env node
// Verify pasted PAL 9000 completion logs in bulk.
//
//   node scripts/verify.js submissions.txt            # one or many logs, concatenated
//   node scripts/verify.js --set 1 submissions.txt    # only count weeks in set 1
//   node scripts/verify.js --csv submissions.txt      # CSV instead of a table
//   node scripts/verify.js --min-score 0.5 subs.txt   # score floor (default 0.7)
//   cat log.txt | node scripts/verify.js
//
// Input is plain text: every "PAL 9000 · COMPLETION LOG" header starts a new
// student's log. Paste Brightspace text submissions one after another (or
// export them and concatenate). Output: one row per student (logs with the
// same name are merged — phone + laptop) with the count of weeks whose codes
// verify under that name, per set; a separate OTHER count for records that
// verify only under a *different* name (SIGNED AS …) — those never count
// automatically, the instructor decides; and flags: invalid codes, unsigned
// records, codes that appear in more than one student's log (shared
// screenshots), two NAME lines in one chunk (header-less paste), and record
// lines that didn't parse (mangled separators).
import { readFileSync } from 'node:fs';
import { LOG_HEADER, normalizeName, parseLog, verifyCompletion } from '../src/assets/js/completion.js';
import { SETS } from '../src/assets/js/sets.js';

const args = process.argv.slice(2);
let onlySet = null;
let csv = false;
let minScore = 0.7; // a week counts only if the on-file best score clears this
const files = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--set') onlySet = Number(args[++i]);
  else if (args[i] === '--csv') csv = true;
  else if (args[i] === '--min-score') minScore = Number(args[++i]);
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('usage: node scripts/verify.js [--set N] [--csv] [file ...]  (stdin if no file)');
    process.exit(0);
  } else files.push(args[i]);
}
if (!(minScore >= 0 && minScore <= 1)) {
  console.error('--min-score must be between 0 and 1 (fraction of questions right)');
  process.exit(2);
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

const activeSets = onlySet === null ? SETS : SETS.filter((s) => s.set === onlySet);
const wanted = new Set(activeSets.flatMap((s) => s.weeks));
const setOfWeek = (w) => SETS.find((s) => s.weeks.includes(w))?.set ?? null;
const checkpointFor = (w) => SETS.find((s) => s.weeks.includes(w))?.checkpointDate ?? null;
const label = (w) => `W${String(w).padStart(2, '0')}`;

const logs = chunks.map((chunk, i) => ({ n: i + 1, ...parseLog(chunk) }));
const headerNames = new Set(logs.map((l) => normalizeName(l.name)).filter(Boolean));

// ---------- pass 1: verify each log ----------
const seenCodes = new Map(); // code → first log number
const sharedFrom = new Set(); // log numbers whose codes reappeared later
for (const log of logs) {
  log.flags = [];
  log.valid = new Map(); // week → code
  log.other = new Map(); // week → name it verifies under
  if (!log.name) log.flags.push('no name');
  if (log.names.length > 1) log.flags.push(`${log.names.length} NAME lines in one paste (two logs merged?)`);
  for (const line of log.unparsed) log.flags.push(`unreadable line: "${line.slice(0, 40)}"`);

  for (const rec of log.records) {
    if (!wanted.has(rec.week)) continue;
    const w = label(rec.week);
    if (!rec.code) { log.flags.push(`${w} unsigned`); continue; }
    if (log.valid.has(rec.week) || log.other.has(rec.week)) { log.flags.push(`${w} listed twice`); continue; }

    const under = rec.name ?? log.name;
    const { ok, at } = await verifyCompletion({ week: rec.week, code: rec.code, score: rec.score, total: rec.total, name: under });
    if (!ok) { log.flags.push(`${w} code invalid`); continue; }
    if (rec.total <= 0 || rec.score / rec.total < minScore) {
      log.flags.push(`${w} below ${Math.round(minScore * 100)}% (${rec.score}/${rec.total})`);
      continue;
    }

    const cp = checkpointFor(rec.week);
    if (at > Date.now()) log.flags.push(`${w} dated in the future`);
    else if (cp && at > Date.parse(`${cp}T23:59:59`)) log.flags.push(`${w} completed after checkpoint`);

    if (seenCodes.has(rec.code)) {
      log.flags.push(`${w} code also in log #${seenCodes.get(rec.code)}`);
      sharedFrom.add(seenCodes.get(rec.code));
    } else seenCodes.set(rec.code, log.n);

    if (rec.name !== null && normalizeName(rec.name) !== normalizeName(log.name)) {
      // Verifies, but under someone else's name. Never counted automatically.
      log.other.set(rec.week, rec.name);
      const clash = headerNames.has(normalizeName(rec.name));
      log.flags.push(`${w} signed as "${rec.name}"${clash ? ' — ANOTHER SUBMITTED LOG HAS THAT NAME' : ''}`);
      continue;
    }
    log.valid.set(rec.week, rec.code);
  }
}
for (const log of logs) if (sharedFrom.has(log.n)) log.flags.push('code shared with a later log');

// ---------- pass 2: merge logs by name ----------
const byName = new Map();
for (const log of logs) {
  const key = normalizeName(log.name) || `#${log.n}`;
  if (!byName.has(key)) byName.set(key, { name: log.name || '(no name)', logs: [], valid: new Map(), other: new Map(), flags: [] });
  const row = byName.get(key);
  row.logs.push(log.n);
  for (const [w, c] of log.valid) row.valid.set(w, c);
  for (const [w, nm] of log.other) if (!row.valid.has(w)) row.other.set(w, nm);
  row.flags.push(...log.flags);
}
const rows = [...byName.values()].map((r) => {
  const bySet = {};
  for (const w of r.valid.keys()) bySet[setOfWeek(w)] = (bySet[setOfWeek(w)] ?? 0) + 1;
  if (r.logs.length > 1) r.flags.unshift(`${r.logs.length} logs merged (#${r.logs.join(', #')})`);
  return {
    name: r.name,
    logs: r.logs,
    bySet,
    weeks: [...r.valid.keys()].sort((a, b) => a - b),
    other: [...r.other.keys()].sort((a, b) => a - b),
    flags: r.flags,
  };
});

// ---------- output ----------
const setCols = activeSets.map((s) => s.set);
if (csv) {
  const q = (v) => `"${String(v).replaceAll('"', '""')}"`;
  console.log(['logs', 'name', ...setCols.map((s) => `set${s}`), 'weeks', 'other', 'flags'].join(','));
  for (const r of rows) {
    console.log([q(r.logs.join(' ')), q(r.name), ...setCols.map((s) => r.bySet[s] ?? 0),
      q(r.weeks.join(' ')), q(r.other.join(' ')), q(r.flags.join('; '))].join(','));
  }
} else {
  const w = Math.max(4, ...rows.map((r) => r.name.length));
  console.log(['LOGS'.padEnd(6), 'NAME'.padEnd(w), ...setCols.map((s) => `SET${s}`), 'WEEKS'.padEnd(20), 'OTHER'.padEnd(8), 'FLAGS'].join('  '));
  for (const r of rows) {
    console.log([
      r.logs.map((n) => `#${n}`).join(',').padEnd(6), r.name.padEnd(w),
      ...setCols.map((s) => String(r.bySet[s] ?? 0).padStart(4)),
      r.weeks.map(label).join(' ').padEnd(20),
      (r.other.length ? r.other.map(label).join(' ') : '—').padEnd(8),
      r.flags.join('; ') || '—',
    ].join('  '));
  }
  console.log(`\n${logs.length} log${logs.length === 1 ? '' : 's'} checked, ${rows.length} student${rows.length === 1 ? '' : 's'}.`);
}
