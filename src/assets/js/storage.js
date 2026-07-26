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

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota — the app still works, progress just doesn't persist.
  }
}
