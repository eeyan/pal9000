// Spaced review ladder: a missed question comes due after 1 day, then 3, then 7.
// Answer correctly at each rung to climb; clear the 7-day rung and it graduates
// out of the queue. Any wrong answer drops it back to the start.
// (SM-2-lite; ts-fsrs is the documented upgrade path — see docs/SPEC.md.)

export const INTERVALS_DAYS = [1, 3, 7];
const DAY_MS = 86_400_000;

export function emptyState() {
  return { items: {} };
}

// Spacing covers every item, not just errors (successive relearning): a
// first-try-correct answer enters the queue at the top rung — one successful
// spaced retrieval a week later graduates it. Items already on the ladder
// (from an earlier miss) are left where they are.
export function recordSuccess(state, id, now) {
  if (state.items[id]) return state;
  const idx = INTERVALS_DAYS.length - 1;
  return {
    items: { ...state.items, [id]: { idx, due: now + INTERVALS_DAYS[idx] * DAY_MS } },
  };
}

export function recordMiss(state, id, now) {
  return {
    items: { ...state.items, [id]: { idx: 0, due: now + INTERVALS_DAYS[0] * DAY_MS } },
  };
}

export function recordReviewResult(state, id, correct, now) {
  const item = state.items[id];
  if (!item) return state;
  if (!correct) return recordMiss(state, id, now);

  const idx = item.idx + 1;
  const items = { ...state.items };
  if (idx >= INTERVALS_DAYS.length) {
    delete items[id];
  } else {
    items[id] = { idx, due: now + INTERVALS_DAYS[idx] * DAY_MS };
  }
  return { items };
}

export function dueIds(state, now) {
  return Object.entries(state.items)
    .filter(([, item]) => item.due <= now)
    .sort(([, a], [, b]) => a.due - b.due)
    .map(([id]) => id);
}

export function queueSize(state) {
  return Object.keys(state.items).length;
}

// Drop ids that no longer exist in the question bank (curation removed/renamed them).
export function prune(state, validIds) {
  const valid = new Set(validIds);
  const items = Object.fromEntries(
    Object.entries(state.items).filter(([id]) => valid.has(id))
  );
  return { items };
}
