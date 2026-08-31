# PAL 9000 — Practice And Learn

Practice-quiz site for **CIS 9000: IT Strategy** (Baruch College). Weekly scenario-question sets that mirror the exam's case-based reasoning, plus a spaced review queue for missed questions. A HAL 9000 backronym — but PAL is on your side.

Built on **Groundwork**: a grounded generate → curate → measure pipeline for LLM-authored practice questions.

## How it works

- **Students** open a link — no account needed. Weekly sets of ~10 questions with immediate per-distractor feedback and self-explanation prompts. Missed questions come due again after 1, 3, then 7 days (SM-2-lite; ts-fsrs is the upgrade path). Weeks are grouped into two **sets**, each closing at a checkpoint (Test 1, then the final): finish a week and it's stamped with a short completion code tied to the name entered on the device, and you hand in the whole set's log once from the `/systems/` page instead of screenshotting every week. Progress lives in localStorage only, with self-serve backup/restore. The site is an installable PWA built for subway commutes: the full app shell precaches on first visit, sets keep working offline, and an interrupted quiz resumes where it left off.
- **The instructor** drops each week's materials into `content/sources/week-NN/` (gitignored — course/publisher content never enters git), runs `npm run generate <week>`, and curates the over-generated candidates into `content/questions/week-NN.yaml`. Accept/reject stats per prompt version are logged in `docs/EVAL-LOG.md` — the eval loop is the point.

## Commands

```sh
npm run dev            # local dev server
npm run build          # build to _site/
npm test               # vitest (schema lint + scheduler + built-site checks)
npm run generate 5     # generate week-05 candidates from content/sources/week-05/
npm run verify logs.txt  # check pasted completion logs in bulk (--set N, --csv)
```

Generation runs locally only (Claude API; needs `ANTHROPIC_API_KEY` or an `ant auth login` profile). Sources: `.md`/`.txt` read as text, `.pdf` sent natively — export PPTX decks to PDF first.

## Question lifecycle

`candidate` → curated to `accepted` / `edited` / `rejected: <reason>` (`hallucination` | `leakage` | `trivia` | `ambiguous` | `duplicate`). Only accepted/edited questions build into the site; the schema lint in `tests/unit/bank.test.js` enforces citations, per-distractor feedback, and self-explanation prompts.

## Deploying

Netlify, gated: production builds run only when the commit subject contains `[deploy]` (see `netlify.toml`).

## Status

Live at [pal9000.netlify.app](https://pal9000.netlify.app) (August 2026): app, scheduler, pipeline, offline/PWA support, storage management, per-set checkpoints with name-bound completion codes, and tests are built and deployed. Question content is still hand-authored **sample material** (`promptVersion: sample-v0`) pending the first real generation run against fall course materials.

Completion codes are tamper-*evidence*, not proof — the salt ships in public source, and there's no backend to check against. The bar is "harder than doing the set"; participation points stay honor-system. Names never leave the browser except when a student pastes their own log into the LMS.

Testing tip: to exercise the review queue without waiting a day, temporarily shrink `INTERVALS_DAYS` in `src/assets/js/scheduler.js`.

## License

Code is [MIT](LICENSE). The question content under `content/` is **not** MIT — see [content/LICENSE](content/LICENSE) (all rights reserved; instructors interested in reuse, get in touch).

Full spec: [docs/SPEC.md](docs/SPEC.md).
