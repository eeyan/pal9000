# PAL 9000 — Practice And Learn

Practice-quiz site for **CIS 9000: IT Strategy** (Baruch College). Weekly scenario-question sets that mirror the exam's case-based reasoning, plus a spaced review queue for missed questions. A HAL 9000 backronym — but PAL is on your side.

Built on **Groundwork**: a grounded generate → curate → measure pipeline for LLM-authored practice questions.

## How it works

- **Students** open a link — no install, no account. Weekly sets of ~10 questions with immediate per-distractor feedback and self-explanation prompts. Missed questions come due again after 1, 3, then 7 days (SM-2-lite; ts-fsrs is the upgrade path). Progress lives in localStorage only.
- **The instructor** drops each week's materials into `content/sources/week-NN/` (gitignored — course/publisher content never enters git), runs `npm run generate <week>`, and curates the over-generated candidates into `content/questions/week-NN.yaml`. Accept/reject stats per prompt version are logged in `docs/EVAL-LOG.md` — the eval loop is the point.

## Commands

```sh
npm run dev            # local dev server
npm run build          # build to _site/
npm test               # vitest (schema lint + scheduler + built-site checks)
npm run generate 5     # generate week-05 candidates from content/sources/week-05/
```

Generation runs locally only (Claude API; needs `ANTHROPIC_API_KEY` or an `ant auth login` profile). Sources: `.md`/`.txt` read as text, `.pdf` sent natively — export PPTX decks to PDF first.

## Question lifecycle

`candidate` → curated to `accepted` / `edited` / `rejected: <reason>` (`hallucination` | `leakage` | `trivia` | `ambiguous` | `duplicate`). Only accepted/edited questions build into the site; the schema lint in `tests/unit/bank.test.js` enforces citations, per-distractor feedback, and self-explanation prompts.

## Deploying

Netlify, gated: production builds run only when the commit subject contains `[deploy]` (see `netlify.toml`).

Full spec: [docs/SPEC.md](docs/SPEC.md).
