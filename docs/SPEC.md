---
type: plan
status: Reviewed — all decisions locked 2026-07-25; ready to build
date_created: 2026-07-24
related: "[[CIS 9000 Study Tool]]"
---

# CIS 9000 Study Tool — Slim MVP Spec (Draft)

**One-liner:** A static practice-quiz site for CIS 9000, fed by an AI question-generation pipeline that Ian curates. The app is deliberately boring; the pipeline is the portfolio piece.

## Goals

1. **Students:** zero-friction retrieval practice matched to the exam format (scenario MCQs + definitional recall), available from a link on any device.
2. **Ian (career):** a documented eval loop — grounded generation → over-generate → curate → measure accept rate per prompt version — as a "PM for non-deterministic systems" build story and blog-post fuel.
3. **Ian (teaching):** content authored week-by-week alongside the fall syllabus; ~30–60 min/week of curation, no big upfront lift.

## Non-goals (MVP)

- **No chat tutor / free-form AI.** Curated question bank only (Wharton guardrails finding; avoids hallucination liability with students).
- **No accounts, no backend, no server-side data.** Progress lives in localStorage.
- **No FSRS, no gamification, no leaderboards.** SM-2-style review is enough at MVP; ts-fsrs is the documented upgrade path.
- **No Anki deck at MVP.** The question schema keeps it a one-afternoon export later (genanki) if students ask.

## Users & core flows

**Student**
1. Opens link → picks a week (or "Review missed") → answers ~8–12 questions.
2. Each answer gets immediate elaborative feedback: why right, why each distractor is wrong, plus a one-line self-explanation prompt ("Which concept from the case made B wrong?").
3. Missed questions enter a local review queue, resurfaced on a simple spaced schedule.
4. Progress (streak-free, judgment-free): per-week completion and review-queue count.

**Ian (author loop, per week of the syllabus)**
1. Drop that week's source material (slides/notes/case text) into `content/sources/week-NN/`.
2. Run the generation script: Claude over-generates ~3× target questions, **grounded only in the provided material**, each with a source citation back to the slide/passage.
3. Curate in a plain markdown/YAML review file: accept / edit / reject each question, with a one-word reject reason (hallucination, leakage, trivia, ambiguous, duplicate).
4. Build step compiles accepted questions to static JSON; deploy via the standard `[deploy]` Netlify gate.
5. Pipeline logs accept/reject stats per prompt version → `docs/EVAL-LOG.md`. This is the artifact.

## Question types (two only)

| Type | Purpose | Evidence anchor |
|---|---|---|
| Scenario MCQ (context-rich stem, 4 options, distractors from real misconceptions) | Transfer to case-based exam reasoning | Pan & Rickard 2018; context-rich MCQ literature |
| Definitional card (term → concept check, rendered as MCQ or reveal) | Vocabulary substrate (KTLO, end-of-support, lock-in…) | Dunlosky 2013 practice testing |

Both share one schema: `{id, week, type, stem, options[], answer, feedback{correct, per-distractor}, selfExplainPrompt?, source{doc, loc}, promptVersion, status}`.

## Sample questions (format definition)

Three samples defining the curation-file format (YAML, one file per week, one doc per candidate). Statuses: `candidate` → `accepted` / `edited` / `rejected: <reason>`. Reject reasons vocabulary: `hallucination`, `leakage`, `trivia`, `ambiguous`, `duplicate`. Content below is illustrative — real questions come from actual week materials.

**1. Scenario MCQ (the workhorse) — accepted**

```yaml
id: w05-q03
week: 5
type: scenario-mcq
status: accepted
promptVersion: gen-v1
stem: >
  Your ERP vendor announces that support for your current version ends in
  18 months. Your CIO tells the board: "Nothing changes on day one — the
  software keeps running." Which statement best captures the organization's
  risk position after the end-of-support date?
options:
  - key: A
    text: The system stops functioning and must be replaced before the deadline.
  - key: B
    text: >
      The system keeps running, but vendor patches and fixes stop — the
      organization must manage security and defects in-house or via third parties.
  - key: C
    text: The vendor remains obligated to ship critical security patches indefinitely.
  - key: D
    text: Continued use after end-of-support violates the license terms.
answer: B
feedback:
  correct: >
    End-of-support ends the vendor's obligations, not the software's function.
    The risk shifts to the customer: unpatched vulnerabilities, no defect fixes,
    shrinking third-party expertise — and a growing KTLO burden.
  A: Conflates end of *support* with end of *function* — the CIO is right that it keeps running.
  C: Backwards — ending exactly these obligations is what "end of support" means.
  D: End-of-support doesn't terminate the license; using it is legal, just increasingly risky.
selfExplainPrompt: >
  What happens to this company's KTLO share of IT budget in the three years
  after the end-of-support date — and why does that constrain new investment?
source: { doc: week-05-vendor-lifecycle.pptx, loc: slides 12-15 }
```

**2. Definitional card — accepted (rendered as MCQ or tap-to-reveal)**

```yaml
id: w02-q01
week: 2
type: definitional
status: accepted
promptVersion: gen-v1
stem: In IT budgeting, "KTLO" spending refers to…
options:
  - { key: A, text: Spending that keeps existing systems and operations running, as opposed to new capability }
  - { key: B, text: The innovation budget reserved for emerging-technology pilots }
  - { key: C, text: Disaster-recovery and business-continuity reserves only }
  - { key: D, text: Data-center power and facilities costs }
answer: A
feedback:
  correct: >
    "Keep The Lights On" — run-the-business spend (maintenance, licenses, ops).
    Strategically it matters as a ratio: every KTLO dollar is a dollar not
    funding change-the-business work.
  B: That's the opposite bucket — change/innovation spend.
  C: DR is one line item within KTLO, not the definition.
  D: Literal lights are a rounding error; the term is a metaphor for all run-cost.
source: { doc: week-02-it-budgeting-notes.md, loc: "IT spend categories" }
```

**3. Rejected candidate — defines the curation/eval loop**

```yaml
id: w02-q07
week: 2
type: definitional
status: "rejected: leakage"
promptVersion: gen-v1
stem: What does the acronym KTLO ("Keep The Lights On") stand for in IT budgeting?
# Reject note: stem contains the answer. Also trivia-level — tests acronym
# expansion, not the run-vs-change budget concept. Counted against gen-v1
# accept rate in docs/EVAL-LOG.md.
```

**Authoring conventions** (enforced in the generation prompt, checked at curation):
- Scenario stems are context-rich — a named situation with a decision, mirroring exam reasoning; never "Which of the following is true?"
- Distractors encode real misconceptions (each `feedback` entry names the misconception), not filler.
- Every question carries a `source` citation into that week's materials; no citation → auto-reject as `hallucination` risk.
- `selfExplainPrompt` required on scenario MCQs, optional on definitional cards.

## Tech shape

- **Stack:** Eleventy static build + vanilla JS + CSS custom properties. Question bank = static JSON per week. localStorage for progress. No framework, no backend.
- **Generation script:** Node CLI calling the Claude API; input = week's source files; output = candidates YAML for curation. Runs locally, never in CI.
- **Tests:** Vitest — unit for the scheduler + schema validation, integration (cheerio) for rendered quiz pages.
- **Hosting:** Netlify free tier, `[deploy]` commit-gate per house convention. Domain TBD (a `*.netlify.app` URL is fine for semester 1; students don't care).
- **Analytics:** Plausible, page-level only. **No per-student tracking** — sidesteps FERPA questions entirely at MVP.

## Adoption plan (the part evidence says matters most)

Optional tools get ~15% usage. Levers, in Ian's control as instructor, strongest first:
1. Reference the weekly set in class + a recurring LMS announcement (reminders are the cheapest proven lever).
2. If Baruch course policy allows: a few low-stakes points for completing weekly sets (self-reported or screenshot — no backend needed).
3. Seed exam-review sessions with questions drawn from the bank so the tool visibly mirrors the exam.

## MVP cut line

**In:** 2 question types · weekly sets · missed-question review queue · localStorage · eval log · weeks 1–3 content at launch.
**Out (backlog):** FSRS, Anki export, per-item difficulty stats from anonymized telemetry, question flagging by students, second course reuse, chat anything.

## Effort estimate

- App + build pipeline: ~1–2 weekends with Claude Code.
- Generation prompt + curation format: ~1 evening to v1, then iterate weekly.
- Ongoing: ~30–60 min/week curation during the semester.

## Decisions (reviewed with Ian, 2026-07-25)

1. **Low-stakes graded.** A few participation points for completing weekly sets, self-reported/screenshot — no backend. Adoption plan lever #2 is the plan of record.
2. **Sources are mixed:** PPTX decks, PDFs, Obsidian/markdown notes, plus publisher/case materials. Ingestion step needs PPTX and PDF text extraction (markdown is pass-through). Publisher/case content is grounding input only and must never enter git.
3. **~10 curated questions/week** (≈150/semester); over-generate ~30, expect ~2/3 rejects.
4. **Two-tier naming (decided 2026-07-25):** the reusable framework/pipeline is **Groundwork** (grounded generation + foundational study; potential standalone productization later). The CIS 9000 course instance is **PAL 9000** — "Practice And Learn," a HAL 9000 backronym riffing on the course number (HAL turned on his crew; PAL is on your side). Tagline shape: "PAL 9000, built on Groundwork."
5. **Public repo + gitignored `content/sources/`** from day 1; pipeline code and EVAL-LOG public, all course/publisher material excluded.
