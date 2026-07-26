export const KEYS = {
  review: 'pal9000.review.v1',
  progress: 'pal9000.progress.v1',
};

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Review state with shape validation — corrupt-but-parseable values (null,
// "{}", wrong types) fall back to an empty state instead of crashing pages.
export function loadReviewState() {
  const s = load(KEYS.review, null);
  return s && typeof s.items === 'object' && s.items !== null ? s : { items: {} };
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — the app still works, progress just doesn't persist.
  }
}
