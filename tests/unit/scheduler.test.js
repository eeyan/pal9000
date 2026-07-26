import { describe, it, expect } from 'vitest';
import {
  INTERVALS_DAYS, emptyState, recordMiss, recordReviewResult, dueIds, queueSize, prune,
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

  it('ladder is 1, 3, 7 days', () => {
    expect(INTERVALS_DAYS).toEqual([1, 3, 7]);
  });
});
