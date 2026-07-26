# PAL 9000

Practice-quiz site for CIS 9000 (IT Strategy, Baruch) with a spaced review queue, built on the Groundwork generate→curate question pipeline. Canonical spec: `docs/SPEC.md`.

# Commands

- `npm run dev` — Eleventy dev server
- `npm run build` — build to `_site/`
- `npm test` — Vitest (run single files: `npx vitest run tests/unit/scheduler.test.js`)
- `npm run generate <week> [target]` — Groundwork candidate generation (local only, needs Claude API auth; writes `content/questions/week-NN.candidates.yaml`)

# Code Style

- Vanilla JS ES modules, no bundler — `src/assets/js/` ships to the browser as-is
- Vanilla CSS with custom properties (`src/assets/css/style.css`); cockpit theme: amber `--amber` accent, HAL-red `--red` only for wrong answers
- No autoformatter

# Testing

- Unit in `tests/unit/`, integration in `tests/integration/` (cheerio over the built site)
- `tests/unit/bank.test.js` doubles as the curation lint — it validates every question in `content/questions/*.yaml` (citations, per-distractor feedback, self-explain prompts, valid statuses)
- Run single tests to validate changes, not the full suite

# Architecture Decisions

- Question bank: YAML per week in `content/questions/`; only `status: accepted|edited` questions build into the site (`src/lib/bank.js` filters)
- Week pages embed their questions as inline JSON; review page embeds the whole bank — no fetch, no backend
- All student progress is localStorage only (`pal9000.review.v1`, `pal9000.progress.v1`) — no accounts, no per-student tracking (FERPA stance in SPEC)
- Scheduler is SM-2-lite (1/3/7-day ladder, `src/assets/js/scheduler.js`), pure functions with injectable `now`; ts-fsrs is the documented upgrade path
- Two-tier naming: **Groundwork** = reusable pipeline (may productize separately); **PAL 9000** = this course instance

# Gotchas

- Eleventy data files (`src/_data/*.js`) must have ONLY a default export — a named export alongside it breaks pagination data resolution (that's why `loadBank` lives in `src/lib/bank.js`)
- Nunjucks has no `format` filter — use the custom `pad2` filter from `eleventy.config.js`
- `content/sources/` is gitignored on purpose (publisher/case copyright) — never force-add anything from it
- `*.candidates.yaml` files are gitignored pre-curation working output — don't commit them
- Generation script accepts `.md`/`.txt`/`.pdf` only; PPTX must be exported to PDF first

# Repository Conventions

- Production deploys are opt-in: Netlify builds only when the commit subject contains `[deploy]` (`netlify.toml`)
- Don't push or amend unless asked; commit messages short, focused on "why"
- After each curation batch, add a row to `docs/EVAL-LOG.md` (date, promptVersion, generated/accepted/rejected, reject-reason breakdown)
