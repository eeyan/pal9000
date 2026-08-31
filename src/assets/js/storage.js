import { cleanName } from './completion.js';

export const KEYS = {
  review: 'pal9000.review.v1',
  progress: 'pal9000.progress.v1',
  // Student's name as entered on this device — printed on the completion
  // log and bound into every completion code. Never sent anywhere.
  name: 'pal9000.name.v1',
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

// Name is stored as a plain string (not JSON) — always returns a clean string.
export function loadName() {
  try {
    return cleanName(localStorage.getItem(KEYS.name) ?? '');
  } catch {
    return '';
  }
}

export function saveName(name) {
  try {
    const clean = cleanName(name);
    if (clean) localStorage.setItem(KEYS.name, clean);
    else localStorage.removeItem(KEYS.name);
    return clean;
  } catch {
    return cleanName(name);
  }
}
