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

async function log(name, weeks) {
  const progress = {};
  for (const w of weeks) {
    const at = AT + w * 3_600_000;
    progress[w] = { score: 9, total: 11, at, name, code: await signCompletion({ week: w, at, score: 9, total: 11, name }) };
  }
  return logText(buildLog(SETS, progress, name, setHeading));
}

let file;
beforeAll(async () => {
  const honest = await log('Ian Anderson', [1, 2, 3]);
  const other = await log('Jon Doe', [1, 6]);
  const copycat = honest.replace('NAME · Ian Anderson', 'NAME · Copy Cat');
  const inflated = honest.replace(/9\/11/, '11/11'); // first record's score edited
  const unsigned = `PAL 9000 · COMPLETION LOG\nNAME · Legacy Larry\nW01 ✓ Aug 1, 2026 · 9/11 · UNSIGNED`;
  file = join(mkdtempSync(join(tmpdir(), 'pal-verify-')), 'subs.txt');
  writeFileSync(file, [honest, other, copycat, inflated, unsigned].join('\n\n'));
});

function run(...args) {
  return execFileSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

describe('scripts/verify.js', () => {
  it('counts verified weeks per set and flags forgeries, tampering, sharing, and unsigned records', () => {
    const rows = run('--csv', file).trim().split('\n').slice(1).map((l) => l.match(/(".*?"|[^,]+)/g));
    expect(rows.length).toBe(5);
    const [honest, other, copycat, inflated, unsigned] = rows;
    expect(honest.slice(1, 4)).toEqual(['"Ian Anderson"', '3', '0']);
    expect(honest[5]).toContain('code shared with a later log'); // the copycat/inflated logs reused these codes
    expect(other.slice(1, 4)).toEqual(['"Jon Doe"', '1', '1']);
    expect(copycat.slice(1, 4)).toEqual(['"Copy Cat"', '0', '0']);
    expect(copycat[5]).toContain('code invalid');
    expect(inflated.slice(2, 4)).toEqual(['2', '0']);
    expect(inflated[5]).toContain('W01 code invalid');
    expect(inflated[5]).toContain('also in log #1');
    expect(unsigned.slice(2, 4)).toEqual(['0', '0']);
    expect(unsigned[5]).toContain('W01 unsigned');
  });

  it('--set restricts counting to one set', () => {
    const out = run('--set', '2', '--csv', file);
    const header = out.split('\n')[0];
    expect(header).toBe('#,name,set2,weeks,flags');
    const jon = out.split('\n')[2];
    expect(jon).toContain('"Jon Doe",1,"6"');
  });

  it('prints a readable table by default and exits non-zero with no logs', () => {
    const table = run(file);
    expect(table).toContain('NAME');
    expect(table).toContain('5 logs checked.');
    expect(() => execFileSync('node', [SCRIPT], { cwd: ROOT, input: 'nothing here', stdio: 'pipe' })).toThrow();
  });
});
