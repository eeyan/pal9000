import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const QUESTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../content/questions');
const LIVE_STATUSES = new Set(['accepted', 'edited']);

export function loadBank(dir = QUESTIONS_DIR) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => /^week-\d+\.ya?ml$/.test(f)).sort();
  } catch {
    return { weeks: [], totalQuestions: 0 };
  }

  const weeks = files.map((file) => {
    const doc = yaml.load(readFileSync(join(dir, file), 'utf8'));
    const questions = (doc.questions ?? []).filter((q) => LIVE_STATUSES.has(q.status));
    return { week: doc.week, title: doc.title, questions };
  }).filter((w) => w.questions.length > 0);

  return {
    weeks,
    totalQuestions: weeks.reduce((n, w) => n + w.questions.length, 0),
  };
}
