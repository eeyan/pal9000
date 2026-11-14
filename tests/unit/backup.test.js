import { describe, it, expect } from 'vitest';
import { BACKUP_FORMAT, makeBackup, parseBackup, recordsFromLog, mergeProgress } from '../../src/assets/js/backup.js';
import { buildLog, logText, signCompletion } from '../../src/assets/js/completion.js';
import { SETS, setHeading } from '../../src/assets/js/sets.js';

const review = { items: { 'w01-q01': { idx: 2, due: 1_700_000_000_000 } } };
const progress = { 1: { score: 9, total: 10, at: 1_690_000_000_000 } };

describe('makeBackup / parseBackup round-trip', () => {
  it('round-trips review, progress, and export time', () => {
    const text = JSON.stringify(makeBackup(review, progress, 123));
    const parsed = parseBackup(text);
    expect(parsed.review).toEqual(review);
    expect(parsed.progress).toEqual({ 1: progress[1] });
    expect(parsed.exportedAt).toBe(123);
  });

  it('strips unknown fields on import (replace must not carry junk)', () => {
    const dirty = makeBackup(
      { items: { a: { idx: 0, due: 5, extra: 'x' } }, extra: 'x' },
      { 2: { score: 1, total: 2, at: 3, extra: 'x' } },
      1,
    );
    dirty.junk = { nested: true };
    const parsed = parseBackup(JSON.stringify(dirty));
    expect(parsed.review.items.a).toEqual({ idx: 0, due: 5 });
    expect(parsed.progress[2]).toEqual({ score: 1, total: 2, at: 3 });
    expect(Object.keys(parsed)).toEqual(['review', 'progress', 'name', 'exportedAt']);
  });
});

describe('parseBackup rejection', () => {
  const cases = [
    ['not JSON', 'nope{'],
    ['wrong format stamp', JSON.stringify({ format: 'other-v9', review, progress })],
    ['missing format', JSON.stringify({ review, progress })],
    ['missing review items', JSON.stringify({ format: BACKUP_FORMAT, review: {}, progress })],
    ['non-integer idx', JSON.stringify({ format: BACKUP_FORMAT, review: { items: { a: { idx: 1.5, due: 2 } } }, progress })],
    ['negative idx', JSON.stringify({ format: BACKUP_FORMAT, review: { items: { a: { idx: -1, due: 2 } } }, progress })],
    ['missing due', JSON.stringify({ format: BACKUP_FORMAT, review: { items: { a: { idx: 0 } } }, progress })],
    ['missing progress', JSON.stringify({ format: BACKUP_FORMAT, review })],
    ['non-numeric week key', JSON.stringify({ format: BACKUP_FORMAT, review, progress: { w1: { score: 1, total: 2, at: 3 } } })],
    ['string score', JSON.stringify({ format: BACKUP_FORMAT, review, progress: { 1: { score: '9', total: 10, at: 3 } } })],
    ['null progress entry', JSON.stringify({ format: BACKUP_FORMAT, review, progress: { 1: null } })],
    ['malformed completion code', JSON.stringify({ format: BACKUP_FORMAT, review, progress: { 1: { score: 9, total: 10, at: 3, code: 'nope' } } })],
    ['non-string record name', JSON.stringify({ format: BACKUP_FORMAT, review, progress: { 1: { score: 9, total: 10, at: 3, name: 42 } } })],
    ['non-string top-level name', JSON.stringify({ format: BACKUP_FORMAT, name: { x: 1 }, review, progress })],
  ];
  for (const [label, text] of cases) {
    it(`throws a readable error on ${label}`, () => {
      expect(() => parseBackup(text)).toThrowError(/backup|read/i);
    });
  }

  it('accepts empty stores (fresh-device backup)', () => {
    const parsed = parseBackup(JSON.stringify(makeBackup({ items: {} }, {}, 1)));
    expect(parsed.review.items).toEqual({});
    expect(parsed.progress).toEqual({});
  });
});

describe('v2: name + completion codes', () => {
  const signed = { 1: { score: 9, total: 10, at: 1_690_000_000_000, name: 'Ian Anderson', code: '0WDNEA-KZ1F20' } };

  it('round-trips the device name and per-record name/code', () => {
    const parsed = parseBackup(JSON.stringify(makeBackup(review, signed, 5, '  Ian   Anderson ')));
    expect(parsed.name).toBe('Ian Anderson');
    expect(parsed.progress[1]).toEqual(signed[1]);
  });

  it('still imports a v1 file — records come through unsigned, no name', () => {
    const v1 = { format: 'pal9000-backup-v1', exportedAt: 1, review, progress };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.name).toBe('');
    expect(parsed.progress[1]).toEqual({ score: 9, total: 10, at: 1_690_000_000_000 });
    expect(parsed.progress[1].code).toBeUndefined();
  });

  it('writes the v2 stamp', () => {
    expect(makeBackup(review, {}, 1, 'x').format).toBe('pal9000-backup-v2');
    expect(BACKUP_FORMAT).toBe('pal9000-backup-v2');
  });
});

describe('restore from a saved completion log', () => {
  const AT = Date.parse('2026-10-20T23:05:00Z'); // on the minute — codes carry minute precision
  const WEEKS = SETS.flatMap((s) => s.weeks);

  async function signedProgress(name, entries) {
    const progress = {};
    for (const [week, score, total] of entries) {
      progress[week] = { score, total, at: AT, name, code: await signCompletion({ week, at: AT, score, total, name }) };
    }
    return progress;
  }
  const textOf = (progress, name) => logText(buildLog(SETS, progress, name, setHeading));

  it('rebuilds exactly the records a copied log was made from', async () => {
    const progress = await signedProgress('Jordan Rivera', [[6, 13, 15], [7, 15, 15]]);
    const out = await recordsFromLog(textOf(progress, 'Jordan Rivera'), WEEKS);
    expect(out.progress).toEqual(progress);
    expect(out.name).toBe('Jordan Rivera');
    expect(out.skipped).toBe(0);
  });

  it('leaves out lines that do not verify: edited score, unsigned, wrong name', async () => {
    const progress = await signedProgress('Jordan Rivera', [[6, 13, 15], [7, 15, 15]]);
    progress[8] = { score: 9, total: 15, at: AT }; // unsigned
    const text = textOf(progress, 'Jordan Rivera').replace('13/15', '15/15');
    const out = await recordsFromLog(text, WEEKS);
    expect(Object.keys(out.progress)).toEqual(['7']);
    expect(out.skipped).toBe(2);

    const stolen = textOf(await signedProgress('Jordan Rivera', [[6, 13, 15]]), 'Jordan Rivera')
      .replace('NAME · Jordan Rivera', 'NAME · Someone Else');
    expect((await recordsFromLog(stolen, WEEKS)).progress).toEqual({});
  });

  it('keeps the better score when two saved logs are pasted together', async () => {
    const a = textOf(await signedProgress('Jordan Rivera', [[6, 11, 15]]), 'Jordan Rivera');
    const b = textOf(await signedProgress('Jordan Rivera', [[6, 14, 15], [9, 12, 15]]), 'Jordan Rivera');
    const out = await recordsFromLog(`${a}\n\n${b}`, WEEKS);
    expect(out.progress[6].score).toBe(14);
    expect(out.progress[9].score).toBe(12);
  });

  it('mergeProgress adds and upgrades but never removes or lowers', () => {
    const have = {
      6: { score: 14, total: 15, at: 1, name: 'J', code: 'AAAAAA-AAAAAA' },
      7: { score: 9, total: 15, at: 1 }, // unsigned
      10: { score: 15, total: 15, at: 1, name: 'J', code: 'BBBBBB-BBBBBB' },
    };
    const incoming = {
      6: { score: 12, total: 15, at: 2, name: 'J', code: 'CCCCCC-CCCCCC' },
      7: { score: 8, total: 15, at: 2, name: 'J', code: 'DDDDDD-DDDDDD' },
      8: { score: 13, total: 15, at: 2, name: 'J', code: 'EEEEEE-EEEEEE' },
    };
    const { progress, added } = mergeProgress(have, incoming);
    expect(added).toEqual([7, 8]);
    expect(progress[6]).toEqual(have[6]);
    expect(progress[7]).toEqual(incoming[7]);
    expect(progress[8]).toEqual(incoming[8]);
    expect(progress[10]).toEqual(have[10]);
    expect(have[7].code).toBeUndefined(); // input not mutated
  });
});
