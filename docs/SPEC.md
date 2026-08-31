---
type: plan
status: MVP built 2026-07-26 (sample content) — this repo copy is canonical; vault plan.md is an archive
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
- **Analytics:** self-hosted Umami, page-level only. **No per-student tracking** — sidesteps FERPA questions entirely at MVP.

## Adoption plan (the part evidence says matters most)

Optional tools get ~15% usage. Levers, in Ian's control as instructor, strongest first:
1. Reference the weekly set in class + a recurring LMS announcement (reminders are the cheapest proven lever).
2. If Baruch course policy allows: a few low-stakes points for completing weekly sets ~~(self-reported or screenshot — no backend needed)~~.
   *Amended 2026-08-31:* **extra credit, not participation** — PAL stays off the syllabus; up to 5 points on each test (Set 1: 1 per verified week; Set 2: 5 for any 5 of 7), added after any curve. The website never mentions grades or points; that lives in the LMS announcement.
   *Amended 2026-08-30:* still no backend, but hand-in is **two per-set checkpoints**, not weekly. Weeks group into sets (1–5 before Test 1, 6–12 before the final); students paste one signed completion log per set into a Brightspace assignment. 79 students × 2 submissions instead of × 12. See "As built (2026-08-30)".
3. Seed exam-review sessions with questions drawn from the bank so the tool visibly mirrors the exam.

## MVP cut line

**In:** 2 question types · weekly sets · missed-question review queue · localStorage · eval log · weeks 1–3 content at launch.
**Out (backlog):** FSRS, Anki export, per-item difficulty stats from anonymized telemetry, question flagging by students, second course reuse, chat anything.

## As built (2026-07-26) — deltas from the plan

MVP implemented and smoke-tested with sample-v0 content (30 hand-authored questions, weeks 1–3). Deviations and decisions made during the build:

- **Candidates workflow:** `npm run generate <week>` writes `content/questions/week-NN.candidates.yaml` (every question `status: candidate`); curation moves accepted/edited questions into `week-NN.yaml`. Candidates files are gitignored — only curated files are committed.
- **Ingestion:** `.md`/`.txt` read as text; **PDFs are sent natively to the Claude API** (no extraction step needed); PPTX is not parsed — export decks to PDF first. A real PPTX extraction step moved to backlog.
- **Generation model:** Claude Opus 4.8, adaptive thinking, structured outputs (JSON schema) — over-generates 3× target with mandatory per-question source citations.
- **Build detail:** Eleventy data files need a sole default export (named exports break pagination), so the bank loader lives in `src/lib/bank.js`; custom `pad2` Nunjucks filter replaces the nonexistent `format` filter.
- **Curation lint is executable:** `tests/unit/bank.test.js` enforces the schema (citations, per-distractor feedback, self-explain on scenario MCQs, valid statuses) across every committed question; integration tests verify rejected/candidate content never reaches the built site.
- **Design:** "friendly HAL" cockpit console — dark, amber PAL-eye accent, Michroma display + IBM Plex body/mono (the IBM/HAL letter-shift joke), HAL-red reserved for wrong answers. Microcopy: "AFFIRMATIVE." / "I'M SORRY — THAT'S NOT IT." Fonts are self-hosted (no third-party requests).
- **Review-hardening pass (2026-07-26):** three-perspective review (code, UX/a11y/pedagogy, ops) drove these changes: XSS-safe JSON embeds (`embedJson` filter); modifier-key guard and double-click guard in the engine; answer state carries ✓/✗ glyphs + screen-reader text + "CORRECT: X" prefix (not color-only); persistent aria-live regions with stem-focus between questions; local-time, completion-only self-report stamp, recoverable from the week page, with best-of progress; network-failure fallback text in the quiz container. **Pedagogy upgrades:** spacing now covers *all* items (first-try-correct enters the queue at the 7-day rung — successive relearning, not just error remediation); in-session misses are re-asked once at the end (last retrieval is never a failure; score counts first attempts only); NEXT is gated ~2.5s behind the self-explanation prompt; all distractor misconceptions render (chosen one inline, others in a disclosure); review mode shuffles and re-letters options to defeat position memory.

- **SYSTEMS page (2026-08-01):** `/systems/`, linked from every page's footer — the student-facing storage panel. One-line status strip (weeks complete / review-queue size / last activity); screenshot-friendly completion-log block listing every week's stamp (incomplete weeks dimmed) with COPY AS TEXT; backup/restore via `pal9000-backup-v1` JSON files (`src/assets/js/backup.js`: format-version stamp for future ts-fsrs migration, strict shape validation, unknown fields stripped, **replace** semantics with a confirm showing the backup's contents); two reset granularities (clear queue vs. full reset) with inline confirm panels — the full-reset dialog names the exact weeks whose completion records will be deleted and offers a backup download inline. Completion log framed as convenience, not verification: localStorage and imports are editable, points stay honor-system.

- **Offline support (2026-08-03):** service worker + web app manifest, built for NYC-commute connectivity (students start a set on the train and keep working as signal comes and goes). Full app shell precached on first visit (every page + all assets — pages carry their questions inline, so a cached page is a fully working quiz). Navigations are network-first with a 3.5s abort so fresh content wins when online but a hanging tunnel request falls back to cache instantly; assets are stale-while-revalidate. The cache name is build-stamped (`buildStamp` global data), so each deploy fully replaces the precache on the next online visit — no stale-week risk. `sw.js` is generated by Eleventy from the bank, so new weeks join the precache automatically; an integration test asserts every precached URL exists in the build (a typo'd path would reject `cache.addAll` and silently kill offline). Manifest + PNG icons (PAL eye, maskable-safe) make it installable to a phone home screen. Verified in Playwright: offline navigation, quiz interaction, scheduler writes, and online recovery.

- **Mobile hardening (2026-08-03):** from a phone-emulation audit against the subway use case. (1) In-session resume: quiz position, first-attempt score, and the retry queue persist under `pal9000.session:<pathname>`, so the eviction-reload iOS does to backgrounded tabs resumes mid-set instead of restarting; answered-but-not-advanced resumes at the next question so scheduler callbacks never double-fire; strict id validation discards stale sessions; full reset clears these too. (2) Touch: `touch-action: manipulation`, transparent tap highlight, 44px targets (theme toggle, COPY AS TEXT via invisible hit-area expansion), `-webkit-text-size-adjust`. (3) The header status line is now a connectivity readout — flips to "OFFLINE — RUNNING FROM MEMORY" in accent color, shown on phones on its own header row. (4) `viewport-fit=cover` + safe-area insets for notch/home-indicator clearance in installed mode.
- **Research-driven hardening (2026-08-03):** a best-practices research pass (WebKit/MDN/web.dev/NN/g, 2025–26 sources) drove a second wave. Storage: session resume moved from sessionStorage to **localStorage** (v2 schema with saved-at timestamp, 24h expiry) because iOS destroys sessionStorage when it kills a standalone home-screen app — the exact subway scenario; `navigator.storage.persist()` requested (iOS 17+/Chromium; installed home-screen apps are also exempt from Safari's 7-day script-storage eviction, which is why install matters). Service worker: per-URL precache with core-vs-optional split (a failed core entry rejects install loudly; only the manifest is optional), `cache: 'reload'` precache requests, icons dropped from precache (~216 KB), stale-while-revalidate returns a real 504 instead of `undefined` when uncached offline, real `/offline/` fallback page instead of silently serving `/` at the wrong URL, navigation preload sharing the 3.5s timeout budget. A11y: connectivity readout is a `role="status"` live region, never aria-hidden (clip-hidden on phones when online), text-only mutations, 2s settle window against connectivity flapping. Transfer: clipboard backup transport on SYSTEMS (COPY BACKUP / PASTE BACKUP…, same `pal9000-backup-v1` format and shared validation+confirm flow as file transfer) because blob downloads are unreliable in iOS standalone apps and **iOS isolates localStorage between Safari and the installed app** — the clipboard bridges the silo. Install: manifest `id`/`lang`/`dir`/`description`/shortcut-to-review; dismissible home-page install hint shown only to students with progress who aren't already installed, with the iOS backup-first warning. `100svh` replaces `100vh`.

- **Analytics live (2026-08-13):** page-level, cookieless, self-hosted per the standard stack; snippet scoped via `data-domains` to the production hostname so dev/preview traffic never records; CSP opened for the stats origin only (script-src + connect-src). Site copy adjusted to stay literally true (SYSTEMS: "your answers and scores are never sent anywhere"); no vendor named in shipped copy; no consent banner needed (no cookies, no personal data). FERPA stance unchanged: aggregate page counts only.

- **Sets + per-set checkpoints (2026-08-30):** weeks group into **sets**, each closing at an in-class test — set 1 = weeks 1–5 before Test 1 (Oct 6), set 2 = weeks 6–12 before the final (Dec 1). Students hand in one completion log per set instead of a screenshot per week; 79 students × 2 submissions is a gradebook that fits in an evening. `src/assets/js/sets.js` is the single source of truth (weeks, checkpoint names, dates) — it ships to the browser and is imported by the Eleventy data file `src/_data/sets.js`, the tests, and `scripts/verify.js`; a second course instance edits that one file. Home page renders set headings with a per-set tally and **locked placeholder rows** for weeks not yet released, so the shape of the semester is visible from week 1. Weekly publish cadence unchanged: each week's set still deploys after that week's class. New Nunjucks filters `findWeek` / `setOf` (Nunjucks can't bind a variable inside a nested loop).

- **Name-bound completion codes (2026-08-30):** a batched hand-in needs the log to be worth more than a retyped list, so every completion is now signed. Students enter their name once (gate on the first week page, editable on `/systems/`; `pal9000.name.v1`); each record is `{score, total, at, name, code}` where `code` = Crockford-base32 of the completion minute + `-` + 30 bits of `SHA-256(SALT|week|minute|score|total|normalized-name)` (`src/assets/js/completion.js`). Change the week, minute, score, or name and the code stops verifying; copy a classmate's log and it carries their name. A record signed under a different name than the device's current one prints as `AS "name"` rather than being silently rewritten, and a lower retake keeps the earlier record *and its code*. **Threat model: tamper-evidence, not proof** — the salt ships in public source, so a student who reads it can forge a code; the bar is "more work than doing the 10-question set," which is the right bar for a participation sliver. Points stay honor-system, as decided.
  `npm run verify <file>` (`scripts/verify.js`) parses many pasted logs at once — Brightspace text submissions concatenated — and prints per-student verified-week counts per set plus flags: invalid code, unsigned, name mismatch, a code appearing in two logs, completion dated after that set's checkpoint. `--set N` and `--csv` supported.
  **FERPA/no-backend stance intact:** still no accounts, no server, no per-student telemetry. The name is stored in localStorage and mixed into a local hash; it leaves the browser only when the student themself pastes their own log into Brightspace. Nothing about codes or names is transmitted by the site.

- **Backup format v2 (2026-08-30):** `pal9000-backup-v2` carries the top-level name plus per-record `name` + `code`. `pal9000-backup-v1` files still import (their records come through unsigned, and the device's existing name is kept rather than wiped) — the format stamp exists for exactly this.

## Effort estimate

- App + build pipeline: ~1–2 weekends with Claude Code.
- Generation prompt + curation format: ~1 evening to v1, then iterate weekly.
- Ongoing: ~30–60 min/week curation during the semester.

## Decisions (reviewed with Ian, 2026-07-25)

1. **Low-stakes graded.** A few participation points for completing weekly sets, ~~self-reported/screenshot~~ — no backend. Adoption plan lever #2 is the plan of record.
   *Amended 2026-08-31:* it's **extra credit on the two tests** (up to 5 points each), not participation, and not on the syllabus.
   *Amended 2026-08-30 (reviewed with Ian):* the cadence is per-set, not weekly, and the log is signed rather than merely screenshotted. Weekly *publishing* is unchanged — each week's set still deploys after that week's class; only the hand-in is batched. Points stay honor-system: the codes make tampering visible, they don't prove anything.
2. **Sources are mixed:** PPTX decks, PDFs, Obsidian/markdown notes, plus publisher/case materials. Ingestion step needs PPTX and PDF text extraction (markdown is pass-through). Publisher/case content is grounding input only and must never enter git.
3. **~10 curated questions/week** (≈150/semester); over-generate ~30, expect ~2/3 rejects.
4. **Two-tier naming (decided 2026-07-25):** the reusable framework/pipeline is **Groundwork** (grounded generation + foundational study; potential standalone productization later). The CIS 9000 course instance is **PAL 9000** — "Practice And Learn," a HAL 9000 backronym riffing on the course number (HAL turned on his crew; PAL is on your side). Tagline shape: "PAL 9000, built on Groundwork."
5. **Public repo + gitignored `content/sources/`** from day 1; pipeline code and EVAL-LOG public, all course/publisher material excluded.
