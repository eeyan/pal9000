// Promotes curated candidates into the week's shipped bank file, so the
// "copy accepted questions over and renumber them" step is a command.
//
// Usage:  node scripts/promote.js <week-number> [options]
//   --ids w01-c02,w01-c30,…   promote only these, in this order (default: every accepted/edited)
//   --title "…"               week title (required when the week file does not exist yet)
//   --publish                 write published: true (default: false — flip on deploy night)
//   --force                   overwrite an existing week-NN.yaml (e.g. replacing a sample set)
// Reads:  content/questions/week-NN.candidates.yaml
// Writes: content/questions/week-NN.yaml with ids wNN-q01…, curator notes stripped;
//         stamps each promoted candidate with promotedAs: wNN-qNN so the
//         candidates file records what shipped.
// Then:   npx vitest run tests/unit/bank.test.js   (the curation lint)
//         node scripts/eval-log.js <week>

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const week = Number(args[0]);
if (!Number.isInteger(week) || week < 1) die('Usage: node scripts/promote.js <week-number> [--ids a,b,c] [--title "…"] [--publish] [--force]');

const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ww = String(week).padStart(2, '0');
const candidatesPath = join('content/questions', `week-${ww}.candidates.yaml`);
const weekPath = join('content/questions', `week-${ww}.yaml`);
if (!existsSync(candidatesPath)) die(`${candidatesPath} not found.`);

const cand = yaml.load(readFileSync(candidatesPath, 'utf8'));
const stillOpen = (cand.questions ?? []).filter((q) => q.status === 'candidate').map((q) => q.id);
if (stillOpen.length) die(`${stillOpen.length} question(s) still "candidate" (${stillOpen.join(', ')}) — finish curating first.`);

const promotable = (q) => ['accepted', 'edited'].includes(q.status);
let chosen;
const idsArg = value('--ids');
if (idsArg) {
  const byId = new Map((cand.questions ?? []).map((q) => [q.id, q]));
  chosen = idsArg.split(',').map((s) => s.trim()).filter(Boolean).map((id) => {
    const q = byId.get(id);
    if (!q) die(`${id} is not in ${candidatesPath}.`);
    if (!promotable(q)) die(`${id} has status "${q.status}" — only accepted/edited questions can be promoted.`);
    return q;
  });
} else {
  chosen = (cand.questions ?? []).filter(promotable);
}
if (!chosen.length) die('Nothing to promote.');

const exists = existsSync(weekPath);
const existing = exists ? yaml.load(readFileSync(weekPath, 'utf8')) : null;
if (exists && !flag('--force')) {
  die(`${weekPath} already exists (${(existing.questions ?? []).length} questions, promptVersion ${existing.questions?.[0]?.promptVersion ?? '?'}). Re-run with --force to replace it.`);
}
const title = value('--title') ?? existing?.title;
if (!title) die('No title: pass --title "…" (the week file does not exist yet).');

const questions = chosen.map((q, i) => {
  const { note, rejectNote, promotedAs, ...rest } = q;
  return { ...rest, id: `w${ww}-q${String(i + 1).padStart(2, '0')}` };
});

const today = new Date().toISOString().slice(0, 10);
const accepted = (cand.questions ?? []).filter(promotable).length;
const header = [
  `week: ${week}`,
  `# Provenance: promptVersion ${cand.promptVersion ?? '?'} · model ${cand.model ?? '?'} · promoted ${today} (${questions.length} of ${accepted} accepted candidates)`,
  `published: ${flag('--publish') ? 'true' : 'false'}`,
  `title: ${JSON.stringify(title)}`,
  '',
].join('\n');
writeFileSync(weekPath, header + yaml.dump({ questions }, { lineWidth: 100 }));

// Record what shipped back on the candidates so the file is a complete log.
const shipped = new Map(chosen.map((q, i) => [q.id, questions[i].id]));
for (const q of cand.questions ?? []) {
  if (shipped.has(q.id)) q.promotedAs = shipped.get(q.id);
  else delete q.promotedAs;
}
writeFileSync(candidatesPath, yaml.dump(cand, { lineWidth: 100 }));

console.log(`Wrote ${weekPath}: ${questions.length} questions (${questions[0].id}…${questions[questions.length - 1].id}), published: ${flag('--publish')}, title "${title}".`);
console.log(`Stamped promotedAs on ${shipped.size} candidates in ${candidatesPath}.`);
console.log(`Next: npx vitest run tests/unit/bank.test.js && node scripts/eval-log.js ${week}`);
