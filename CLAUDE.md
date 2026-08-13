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
- All student state is client-side only — no accounts, no per-student tracking (FERPA stance in SPEC). localStorage keys: `pal9000.review.v1` (spaced-review ladder), `pal9000.progress.v1` (completion records), `pal9000.session:<pathname>` (mid-quiz resume, 24h expiry — localStorage not sessionStorage because iOS destroys sessionStorage when killing a standalone app), `pal9000.theme`, `pal9000.installHint.v1`. `/systems/` is the student-facing storage panel (backup/restore via file AND clipboard — iOS isolates storage between Safari and the installed app; the clipboard bridges it)
- Scheduler is SM-2-lite (1/3/7-day ladder, `src/assets/js/scheduler.js`), pure functions with injectable `now`; ts-fsrs is the documented upgrade path
- Offline/PWA: `src/sw.njk` templates the service worker (precache list generated from the bank, build-stamped cache name via `buildStamp` global data); navigations are network-first with a 3.5s timeout, assets stale-while-revalidate, uncached-offline navigations get `/offline/`. Manifest in `src/manifest.njk`
- Analytics: self-hosted, cookieless, page-level only; the snippet in `layout.njk` is scoped with `data-domains` so localhost/dev/previews never record. The stats origin is allow-listed in `netlify.toml`'s CSP — touch both together or neither
- Two-tier naming: **Groundwork** = reusable pipeline (may productize separately); **PAL 9000** = this course instance

# Gotchas

- Eleventy data files (`src/_data/*.js`) must have ONLY a default export — a named export alongside it breaks pagination data resolution (that's why `loadBank` lives in `src/lib/bank.js`)
- Nunjucks has no `format` filter — use the custom `pad2` filter from `eleventy.config.js`
- `content/sources/` is gitignored on purpose (publisher/case copyright) — never force-add anything from it
- `*.candidates.yaml` files are gitignored pre-curation working output — don't commit them
- Generation script accepts `.md`/`.txt`/`.pdf` only; PPTX must be exported to PDF first
- The service worker registers on any origin, including localhost — if a stale build seems to be serving during local testing, it's the SW cache; unregister it in devtools (Application → Service Workers) or use a different port. `npm run dev` and one-off `python3 -m http.server` ports cross-contaminate this way
- Public-copy privacy claims are load-bearing: the SYSTEMS lede promises answers/scores never leave the browser — anything that sends data must not falsify it (and never name analytics/hosting vendors in shipped copy)

# Repository Conventions

- Production deploys are opt-in: Netlify builds only when the commit subject contains `[deploy]` (`netlify.toml`)
- Don't push or amend unless asked; commit messages short, focused on "why"
- After each curation batch, add a row to `docs/EVAL-LOG.md` (date, promptVersion, generated/accepted/rejected, reject-reason breakdown)
