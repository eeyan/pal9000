# PAL 9000

Practice-quiz site for CIS 9000 (IT Strategy, Baruch) with a spaced review queue, built on the Groundwork generate→curate question pipeline. Canonical spec: `docs/SPEC.md`.

# Commands

- `npm run dev` — Eleventy dev server
- `npm run build` — build to `_site/`
- `npm test` — Vitest (run single files: `npx vitest run tests/unit/scheduler.test.js`)
- `npm run generate <week> [target]` — Groundwork candidate generation (local only, needs Claude API auth; writes `content/questions/week-NN.candidates.yaml`)
- `npm run verify <file>` — bulk-check pasted completion logs (`--set N`, `--csv`; stdin if no file)

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
- All student state is client-side only — no accounts, no per-student tracking (FERPA stance in SPEC). localStorage keys: `pal9000.review.v1` (spaced-review ladder), `pal9000.progress.v1` (completion records: `{score,total,at,name,code}`), `pal9000.name.v1` (student's name, plain string not JSON — never sent anywhere), `pal9000.session:<pathname>` (mid-quiz resume, 24h expiry — localStorage not sessionStorage because iOS destroys sessionStorage when killing a standalone app), `pal9000.theme`, `pal9000.installHint.v1`. `/systems/` is the student-facing storage panel (backup/restore via file AND clipboard — iOS isolates storage between Safari and the installed app; the clipboard bridges it)
- Sets: `src/assets/js/sets.js` is the single source of truth for the week→set grouping and checkpoint dates — imported by the browser, `src/_data/sets.js`, tests, and `scripts/verify.js`. A new semester edits that one file (keep it dependency- and side-effect-free). Templates use the `findWeek` / `setOf` filters; weeks in a set with no YAML yet render as locked placeholder rows on the home page. Weekly publish cadence is unchanged — only the hand-in is batched into two per-set checkpoints
- Completion codes (`src/assets/js/completion.js`): each completion is signed with a code bound to week/minute/score/normalized-name. **Tamper-evidence, not proof** — the salt is public and points stay honor-system; don't let anyone "harden" this into a claim it can't make. The module is shared by browser, tests, and `scripts/verify.js`, so keep it DOM-free and Node-free (Web Crypto only). The completion-log text format is a parsing contract between `buildLog`/`recordLine` and `parseLog`/`verify.js` — change both together, and the integration tests
- Backup format is `pal9000-backup-v2` (top-level name, per-record name + code); v1 files still import unsigned and keep the device's existing name — don't drop that path
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
- The name inputs carry `autocomplete="name"`, which triggers password-manager overlays (1Password) that can sit on top of the field and break browser-automation screenshots — drive the name gate with JS in tests rather than synthetic typing
- Public-copy privacy claims are load-bearing: the SYSTEMS lede promises answers/scores never leave the browser — anything that sends data must not falsify it (and never name analytics/hosting vendors in shipped copy)

# Repository Conventions

- Production deploys are opt-in: Netlify builds only when the commit subject contains `[deploy]` (`netlify.toml`)
- Don't push or amend unless asked; commit messages short, focused on "why"
- After each curation batch, add a row to `docs/EVAL-LOG.md` (date, promptVersion, generated/accepted/rejected, reject-reason breakdown)
