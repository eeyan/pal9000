// Backup file format for the SYSTEMS page: both localStorage stores plus a
// format-version stamp, so a future scheduler migration (ts-fsrs) can detect
// and convert old files instead of stranding them.

export const BACKUP_FORMAT = 'pal9000-backup-v1';

export function makeBackup(review, progress, exportedAt) {
  return { format: BACKUP_FORMAT, exportedAt, review, progress };
}

// Parse + shape-validate a backup file. Throws with a student-readable message
// on anything malformed; returns sanitized { review, progress, exportedAt }
// containing only the fields the app knows about (import is replace, so junk
// must not ride along into localStorage).
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file could not be read as a backup.');
  }
  if (!data || typeof data !== 'object' || data.format !== BACKUP_FORMAT) {
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
    progress[week] = { score: p.score, total: p.total, at: p.at };
  }

  return {
    review: { items },
    progress,
    exportedAt: typeof data.exportedAt === 'number' ? data.exportedAt : null,
  };
}
