import { describe, it, expect } from 'vitest';
import { BACKUP_FORMAT, makeBackup, parseBackup } from '../../src/assets/js/backup.js';

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
    expect(Object.keys(parsed)).toEqual(['review', 'progress', 'exportedAt']);
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
