import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLog, logText, signCompletion } from '../../src/assets/js/completion.js';
import { SETS, setHeading } from '../../src/assets/js/sets.js';

const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/verify.js');
// Past dates so nothing trips the "dated in the future" check.
const AT = Date.parse('2026-08-01T14:00:00Z');

async function progressFor(name, weeks, score = 9) {
  const progress = {};
  for (const w of weeks) {
    const at = AT + w * 3_600_000;
    progress[w] = { score, total: 11, at, name, code: await signCompletion({ week: w, at, score, total: 11, name }) };
  }
  return progress;
}
async function log(name, weeks, score) {
  return logText(buildLog(SETS, await progressFor(name, weeks, score), name, setHeading));
}

let file;
let rows;
beforeAll(async () => {
  const honest = await log('Ian Anderson', [1, 2, 3]);
  const other = await log('Jon Doe', [1, 6]);
  const copycat = honest.replace('NAME · Ian Anderson', 'NAME · Copy Cat');
  const inflated = honest.replace(/9\/11/, '11/11'); // first record's score edited
  const unsigned = `PAL 9000 · COMPLETION LOG\nNAME · Legacy Larry\nW01 ✓ Aug 1, 2026 · 9/11 · UNSIGNED`;
  // Spoof: copy Ian's log, claim it as Spoofy, mark every record SIGNED AS Ian. Codes verify — but under another name.
  const spoof = honest.replace('NAME · Ian Anderson', 'NAME · Spoofy McSpoof')
    .replace(/(W0[123] ✓ .*)$/gm, '$1 · SIGNED AS "Ian Anderson"');
  // Same student, second device: merges with Jon Doe (case/space-insensitive).
  const jonLaptop = await log('JON  DOE', [7]);
  // Header-less paste: two students' logs glued together under one header.
  const glued = `${await log('Glue A', [4])}\n${(await log('Glue B', [5])).replace('PAL 9000 · COMPLETION LOG\n', '')}`;
  // Mangled separators from a bad paste.
  const mangled = (await log('Mangle Mary', [2])).split('\n').map((l) => (l.startsWith('W') ? l.replace(/·/g, '-') : l)).join('\n');
  const guesser = await log('Guessing Gus', [1, 2], 4); // 4/11 — valid codes, below the floor
  file = join(mkdtempSync(join(tmpdir(), 'pal-verify-')), 'subs.txt');
  writeFileSync(file, [honest, other, copycat, inflated, unsigned, spoof, jonLaptop, glued, mangled, guesser].join('\n\n'));
  const out = execFileSync('node', [SCRIPT, '--csv', file], { cwd: ROOT, encoding: 'utf8' });
  rows = out.trim().split('\n').slice(1).map(parseCsvLine);
});

// Minimal RFC-4180 row parser (cells may contain commas and doubled quotes).
// Cells are returned still wrapped in their quotes when they were quoted.
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  let wasQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (ch === '"') inQ = false; else cur += ch;
    } else if (ch === '"') { inQ = true; wasQ = true; } else if (ch === ',') {
      cells.push(wasQ ? `"${cur}"` : cur); cur = ''; wasQ = false;
    } else cur += ch;
  }
  cells.push(wasQ ? `"${cur}"` : cur);
  return cells;
}

const byName = (n) => rows.find((r) => r[1] === `"${n}"`);
function run(...args) {
  return execFileSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

describe('scripts/verify.js', () => {
  it('counts verified weeks per set and flags forgeries, tampering, sharing, and unsigned records', () => {
    // columns: logs, name, set1, set2, weeks, other, flags
    const honest = byName('Ian Anderson');
    expect(honest.slice(2, 4)).toEqual(['3', '0']);
    expect(honest[6]).toContain('code shared with a later log');
    expect(byName('Jon Doe')[6]).not.toContain('invalid');
    const copycat = byName('Copy Cat');
    expect(copycat.slice(2, 4)).toEqual(['0', '0']);
    expect(copycat[6]).toContain('code invalid');
    const inflated = rows.filter((r) => r[1] === '"Ian Anderson"');
    expect(inflated.length).toBe(1); // merged into Ian's row — see merge test
    const unsigned = byName('Legacy Larry');
    expect(unsigned.slice(2, 4)).toEqual(['0', '0']);
    expect(unsigned[6]).toContain('W01 unsigned');
  });

  it('never counts records that verify only under another name; flags when that name submitted a log', () => {
    const spoof = byName('Spoofy McSpoof');
    expect(spoof.slice(2, 4)).toEqual(['0', '0']);
    expect(spoof[5]).toBe('"1 2 3"'); // OTHER column
    expect(spoof[6]).toContain('signed as "Ian Anderson" — ANOTHER SUBMITTED LOG HAS THAT NAME');
    expect(spoof[6]).toContain('also in log #1');
  });

  it('merges logs from the same student across devices', () => {
    const jon = byName('Jon Doe');
    expect(jon[0]).toMatch(/^"\d+ \d+"$/); // two log numbers
    expect(jon.slice(2, 4)).toEqual(['1', '2']); // W01 + W06 from phone, W07 from laptop
    expect(jon[6]).toContain('2 logs merged');
    // Ian's honest + inflated logs merge too: W01 invalid in the inflated copy doesn't remove the honest W01.
    const ian = byName('Ian Anderson');
    expect(ian[4]).toBe('"1 2 3"');
    expect(ian[6]).toContain('W01 code invalid');
  });

  it('flags header-less concatenation and unreadable lines instead of failing silently', () => {
    const glued = byName('Glue B'); // last NAME line wins for the merged chunk
    expect(glued[6]).toContain('2 NAME lines in one paste');
    expect(glued[6]).toContain('W04 code invalid'); // Glue A's record checked under Glue B's name
    const mangled = byName('Mangle Mary');
    expect(mangled.slice(2, 4)).toEqual(['0', '0']);
    expect(mangled[6]).toContain('unreadable line');
  });

  it('enforces the score floor (default 70%) and --min-score overrides it', () => {
    const gus = byName('Guessing Gus');
    expect(gus.slice(2, 4)).toEqual(['0', '0']);
    expect(gus[6]).toContain('W01 below 70% (4/11)');
    const relaxed = run('--min-score', '0.3', '--csv', file);
    expect(relaxed).toMatch(/"Guessing Gus",2,0,"1 2"/);
    expect(() => execFileSync('node', [SCRIPT, '--min-score', '7', file], { cwd: ROOT, stdio: 'pipe' })).toThrow();
  });

  it('--set restricts counting to one set', () => {
    const out = run('--set', '2', '--csv', file);
    expect(out.split('\n')[0]).toBe('logs,name,set2,weeks,other,flags');
    expect(out).toContain('"Jon Doe",2,"6 7"');
  });

  it('prints a readable table by default and exits non-zero with no logs', () => {
    const table = run(file);
    expect(table).toContain('NAME');
    expect(table).toMatch(/10 logs checked, \d+ students\./);
    expect(() => execFileSync('node', [SCRIPT], { cwd: ROOT, input: 'nothing here', stdio: 'pipe' })).toThrow();
  });
});
