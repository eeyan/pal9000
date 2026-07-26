import { describe, it, expect } from 'vitest';
import {
  INTERVALS_DAYS, emptyState, recordMiss, recordSuccess, recordReviewResult, dueIds, queueSize, prune,
} from '../../src/assets/js/scheduler.js';

const DAY = 86_400_000;
const T0 = 1_000_000_000_000;

describe('scheduler', () => {
  it('a miss enters the queue due in 1 day', () => {
    const s = recordMiss(emptyState(), 'q1', T0);
    expect(queueSize(s)).toBe(1);
    expect(dueIds(s, T0)).toEqual([]);
    expect(dueIds(s, T0 + 1 * DAY)).toEqual(['q1']);
  });

  it('correct review answers climb 1d → 3d → 7d, then graduate', () => {
    let s = recordMiss(emptyState(), 'q1', T0);
    s = recordReviewResult(s, 'q1', true, T0 + 1 * DAY);
    expect(dueIds(s, T0 + 1 * DAY + 3 * DAY)).toEqual(['q1']);
    s = recordReviewResult(s, 'q1', true, T0 + 4 * DAY);
    expect(dueIds(s, T0 + 4 * DAY + 7 * DAY)).toEqual(['q1']);
    s = recordReviewResult(s, 'q1', true, T0 + 11 * DAY);
    expect(queueSize(s)).toBe(0);
  });

  it('a wrong review answer drops the item back to the first rung', () => {
    let s = recordMiss(emptyState(), 'q1', T0);
    s = recordReviewResult(s, 'q1', true, T0 + 1 * DAY); // now at 3d rung
    s = recordReviewResult(s, 'q1', false, T0 + 4 * DAY);
    expect(s.items.q1.idx).toBe(0);
    expect(dueIds(s, T0 + 4 * DAY + 1 * DAY)).toEqual(['q1']);
  });

  it('review result for an unknown id is a no-op', () => {
    const s = recordReviewResult(emptyState(), 'ghost', true, T0);
    expect(queueSize(s)).toBe(0);
  });

  it('dueIds returns oldest-due first', () => {
    let s = recordMiss(emptyState(), 'later', T0 + 1000);
    s = recordMiss(s, 'sooner', T0);
    expect(dueIds(s, T0 + 2 * DAY)).toEqual(['sooner', 'later']);
  });

  it('prune drops ids no longer in the bank', () => {
    let s = recordMiss(emptyState(), 'kept', T0);
    s = recordMiss(s, 'removed-by-curation', T0);
    expect(queueSize(prune(s, ['kept']))).toBe(1);
  });

  it('a first-try success enters at the top rung, due in 7 days', () => {
    const s = recordSuccess(emptyState(), 'q1', T0);
    expect(s.items.q1.idx).toBe(INTERVALS_DAYS.length - 1);
    expect(dueIds(s, T0 + 7 * DAY)).toEqual(['q1']);
  });

  it('one correct review graduates a success-entered item', () => {
    let s = recordSuccess(emptyState(), 'q1', T0);
    s = recordReviewResult(s, 'q1', true, T0 + 7 * DAY);
    expect(queueSize(s)).toBe(0);
  });

  it('recordSuccess never moves an item already on the miss ladder', () => {
    let s = recordMiss(emptyState(), 'q1', T0);
    s = recordSuccess(s, 'q1', T0 + 1000);
    expect(s.items.q1.idx).toBe(0);
  });

  it('a wrong review answer on a success-entered item drops it to the first rung', () => {
    let s = recordSuccess(emptyState(), 'q1', T0);
    s = recordReviewResult(s, 'q1', false, T0 + 7 * DAY);
    expect(s.items.q1.idx).toBe(0);
  });

  it('ladder is 1, 3, 7 days', () => {
    expect(INTERVALS_DAYS).toEqual([1, 3, 7]);
  });
});
