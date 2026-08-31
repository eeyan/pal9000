// Course structure: weeks grouped into SETS, each set closing at a checkpoint
// (an in-class test). Students submit their completion log once per set, not
// weekly — 79 students × 2 checkpoints beats 79 × 12.
//
// This module ships to the browser AND is imported by Eleventy data files,
// tests, and scripts/verify.js — keep it dependency-free and side-effect-free.
// Semester-specific values live here on purpose; a second course instance
// edits this file (Groundwork reuse).

export const SETS = [
  {
    set: 1,
    weeks: [1, 2, 3, 4, 5],
    checkpoint: 'TEST 1',
    checkpointDate: '2026-10-06',
  },
  {
    set: 2,
    weeks: [6, 7, 8, 9, 10, 11, 12],
    checkpoint: 'FINAL EXAM',
    checkpointDate: '2026-12-01',
  },
];

export function setForWeek(week) {
  return SETS.find((s) => s.weeks.includes(Number(week))) ?? null;
}

export function weekRange(s) {
  return `WEEKS ${s.weeks[0]}–${s.weeks[s.weeks.length - 1]}`;
}

// "OCT 6" — for chrome copy; parsed as a calendar date, not an instant, so it
// never shifts a day in western time zones.
export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}`;
}

// Header line for a set, shared by the home page and the completion log.
export function setHeading(s) {
  return `SET ${s.set} · ${weekRange(s)} · DUE ${shortDate(s.checkpointDate)} (${s.checkpoint})`;
}
