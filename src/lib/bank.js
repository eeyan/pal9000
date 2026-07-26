import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const QUESTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content/questions');
const LIVE_STATUSES = new Set(['accepted', 'edited']);

// Single source of truth for which files are part of the bank — the curation
// lint (tests/unit/bank.test.js) imports this so nothing can ship un-linted.
export const WEEK_FILE_RE = /^week-(\d+)\.yaml$/;

export function loadBank(dir = QUESTIONS_DIR) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => WEEK_FILE_RE.test(f)).sort();
  } catch {
    return { weeks: [], totalQuestions: 0 };
  }

  const seen = new Set();
  const weeks = files.map((file) => {
    const doc = yaml.load(readFileSync(join(dir, file), 'utf8'));
    const fromName = Number(WEEK_FILE_RE.exec(file)[1]);
    if (doc.week !== fromName) {
      throw new Error(`${file}: filename says week ${fromName} but document says week ${doc.week}`);
    }
    if (seen.has(doc.week)) {
      throw new Error(`${file}: duplicate week number ${doc.week}`);
    }
    seen.add(doc.week);
    const questions = (doc.questions ?? []).filter((q) => LIVE_STATUSES.has(q.status));
    return { week: doc.week, title: doc.title, questions };
  }).filter((w) => w.questions.length > 0);

  return {
    weeks,
    totalQuestions: weeks.reduce((n, w) => n + w.questions.length, 0),
  };
}
