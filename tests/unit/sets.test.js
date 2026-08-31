import { describe, it, expect } from 'vitest';
import { SETS, setForWeek, setHeading, shortDate, weekRange } from '../../src/assets/js/sets.js';

describe('sets', () => {
  it('cover weeks 1–12 exactly once, in order, with no gaps', () => {
    const all = SETS.flatMap((s) => s.weeks);
    expect(all).toEqual([...all].sort((a, b) => a - b));
    expect(new Set(all).size).toBe(all.length);
    expect(all[0]).toBe(1);
    for (let i = 1; i < all.length; i += 1) expect(all[i]).toBe(all[i - 1] + 1);
  });

  it('have unique set numbers and ISO checkpoint dates in semester order', () => {
    expect(new Set(SETS.map((s) => s.set)).size).toBe(SETS.length);
    for (const s of SETS) expect(s.checkpointDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = SETS.map((s) => s.checkpointDate);
    expect(dates).toEqual([...dates].sort());
  });

  it('setForWeek finds the set, tolerating string weeks; null when out of range', () => {
    expect(setForWeek(1).set).toBe(1);
    expect(setForWeek('5').set).toBe(1);
    expect(setForWeek(6).set).toBe(2);
    expect(setForWeek(12).set).toBe(2);
    expect(setForWeek(13)).toBeNull();
    expect(setForWeek(0)).toBeNull();
  });

  it('formats headings without date-shift bugs', () => {
    expect(shortDate('2026-10-06')).toBe('OCT 6');
    expect(shortDate('2026-12-01')).toBe('DEC 1');
    expect(weekRange(SETS[0])).toBe('WEEKS 1–5');
    expect(setHeading(SETS[0])).toBe('SET 1 · WEEKS 1–5 · DUE OCT 6 (TEST 1)');
  });
});
