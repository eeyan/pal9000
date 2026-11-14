// Backup file format for the SYSTEMS page: both localStorage stores, the
// student's name, and a format-version stamp so a future scheduler migration
// (ts-fsrs) can detect and convert old files instead of stranding them.
//
// v2 (2026-08-30) adds the top-level `name` and per-record `name` + `code`
// (name-bound completion codes). v1 files still import; their records come
// through unsigned.
import { CODE_RE, NAME_MAX, cleanName, foldCode, parseLog, verifyCompletion } from './completion.js';

export const BACKUP_FORMAT = 'pal9000-backup-v2';
const ACCEPTED_FORMATS = new Set(['pal9000-backup-v1', BACKUP_FORMAT]);

export function makeBackup(review, progress, exportedAt, name = '') {
  return { format: BACKUP_FORMAT, exportedAt, name: cleanName(name), review, progress };
}

// Parse + shape-validate a backup file. Throws with a student-readable message
// on anything malformed; returns sanitized { review, progress, name, exportedAt }
// containing only the fields the app knows about (import is replace, so junk
// must not ride along into localStorage).
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file could not be read as a backup.');
  }
  if (!data || typeof data !== 'object' || !ACCEPTED_FORMATS.has(data.format)) {
    throw new Error('That does not look like a PAL 9000 backup file.');
  }

  const items = {};
  const rawItems = data.review?.items;
  if (!rawItems || typeof rawItems !== 'object') {
    throw new Error('This backup file is damaged (missing review data).');
  }
  for (const [id, item] of Object.entries(rawItems)) {
    if (!item || !Number.isInteger(item.idx) || item.idx < 0 || typeof item.due !== 'number') {
      throw new Error('This backup file is damaged (bad review entry).');
    }
    items[id] = { idx: item.idx, due: item.due };
  }

  const progress = {};
  if (!data.progress || typeof data.progress !== 'object') {
    throw new Error('This backup file is damaged (missing completion records).');
  }
  for (const [week, p] of Object.entries(data.progress)) {
    if (!/^\d+$/.test(week) || !p
      || typeof p.score !== 'number' || typeof p.total !== 'number' || typeof p.at !== 'number') {
      throw new Error('This backup file is damaged (bad completion record).');
    }
    const rec = { score: p.score, total: p.total, at: p.at };
    if (p.code !== undefined && p.code !== null) {
      if (typeof p.code !== 'string' || !CODE_RE.test(foldCode(p.code))) {
        throw new Error('This backup file is damaged (bad completion code).');
      }
      rec.code = foldCode(p.code);
    }
    if (p.name !== undefined && p.name !== null) {
      if (typeof p.name !== 'string' || p.name.length > NAME_MAX * 4) {
        throw new Error('This backup file is damaged (bad name).');
      }
      rec.name = cleanName(p.name);
    }
    progress[week] = rec;
  }

  if (data.name !== undefined && data.name !== null && typeof data.name !== 'string') {
    throw new Error('This backup file is damaged (bad name).');
  }

  return {
    review: { items },
    progress,
    name: cleanName(data.name ?? ''),
    exportedAt: typeof data.exportedAt === 'number' ? data.exportedAt : null,
  };
}

// ---------- restore from a saved completion log ----------
// Students are told to keep a copy of their completion log text. That text
// is also a (partial) backup: every signed line carries week, score, minute
// and name, so the completion records can be rebuilt from it — the review
// schedule can't. Only lines whose code verifies are accepted, so this opens
// no door a hand-edited log didn't already have.
//
// → { progress: { [week]: rec }, name, skipped } — `skipped` counts record
// lines left out (unsigned, failed verification, unknown week, or mangled).
// Throws if Web Crypto is unavailable.
export async function recordsFromLog(text, validWeeks) {
  const log = parseLog(text);
  const weeks = new Set(validWeeks);
  const progress = {};
  let skipped = log.unparsed.length;
  for (const r of log.records) {
    const name = r.name ?? log.name;
    if (!r.code || !name || !weeks.has(r.week)) {
      skipped += 1;
      continue;
    }
    const { ok, at } = await verifyCompletion({ week: r.week, code: r.code, score: r.score, total: r.total, name });
    if (!ok || !Number.isFinite(at)) {
      skipped += 1;
      continue;
    }
    const rec = { score: r.score, total: r.total, at, name, code: foldCode(r.code) };
    // Two saved logs pasted together: the better score for a week wins.
    if (!progress[r.week] || rec.score > progress[r.week].score) progress[r.week] = rec;
  }
  return { progress, name: log.name, skipped };
}

// Merge restored records into what the device has. Never removes a week, and
// never lowers one: an incoming record wins only where the device has nothing,
// has an unsigned record, or has a lower score. Returns { progress, added }
// where `added` lists the weeks that changed.
export function mergeProgress(current, incoming) {
  const progress = { ...current };
  const added = [];
  for (const [week, rec] of Object.entries(incoming)) {
    const have = progress[week];
    if (!have || !have.code || rec.score > have.score) {
      progress[week] = rec;
      added.push(Number(week));
    }
  }
  return { progress, added: added.sort((a, b) => a - b) };
}
