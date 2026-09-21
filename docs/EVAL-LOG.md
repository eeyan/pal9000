# EVAL-LOG

Accept/reject stats per prompt version for the PAL 9000 question bank. This is
the artifact: it measures how a given generation prompt performs against
curation, batch by batch.

Accept rate = accepted / generated. Reject reasons use the SPEC vocabulary:
`hallucination`, `leakage`, `trivia`, `ambiguous`, `duplicate`.

## sample-v0 — hand-authored baseline (2026-07-26)

| Date | promptVersion | Week | Generated | Accepted | Rejected | Accept rate | Reject reasons |
|---|---|---|---|---|---|---|---|
| 2026-07-26 | sample-v0 (hand-authored) | 1 — IT Strategy & Alignment | 11 | 10 | 1 | 91% | leakage ×1 |
| 2026-07-26 | sample-v0 (hand-authored) | 2 — IT Spend: Run vs. Change | 11 | 10 | 1 | 91% | trivia ×1 |
| 2026-07-26 | sample-v0 (hand-authored) | 3 — Build vs. Buy vs. SaaS | 11 | 10 | 1 | 91% | ambiguous ×1 |
| **Total** | sample-v0 | 1–3 | **33** | **30** | **3** | **91%** | leakage ×1, trivia ×1, ambiguous ×1 |

Note: sample-v0 is hand-authored baseline content — it defines the target
schema, quality bar, and curation-file format, so its ~91% accept rate is not a
measure of any generation prompt. The one rejection per week is an intentional
worked example of each reject reason. The first real Claude-generated batch will
be logged as **gen-v1**, where the accept rate becomes a genuine signal (the SPEC
plans over-generating ~3x and expecting ~2/3 rejects, so gen-v1's rate is
expected to start far below this baseline).

From gen-v1 on, rows also carry a **Model** column (the model is not pinned —
see SPEC). Week 1 of Fall 2026 was generated in an interactive Claude Code
session on Claude Fable 5.1 rather than via `npm run generate`; the row is
logged the same way from the candidates file.

## gen-v1

| Date | promptVersion | Model | Week | Generated | Accepted | Rejected | Accept rate | Reject reasons |
|---|---|---|---|---|---|---|---|---|
| 2026-09-08 | gen-v1 | claude-fable-5-1 | 1 | 30 | 25 | 5 | 83% | ambiguous ×3, leakage ×1, trivia ×1 |

Week 1 notes (gen-v1, in-session): the 83% accept rate is per generated candidate; only 12 of the 25
accepted were promoted after a duplicate-topic trim, so the effective yield was 12/30. Two batch-level
defects to fix in gen-v2: (1) the correct option was the longest option in 28 of 30 candidates — a
length-balancing edit pass on 22 questions brought it to 1 of 25, and the prompt should demand parallel
option lengths; (2) stems of the form "which reasoning best matches/applies…" with yes/no option sets
were rejected as ambiguous (c05, c06) — stems should ask a direct question that has a decision as its
answer. Independent curator and generator reviews agreed on 20 of 30 statuses; the generator's own
review was the more lenient one. The curator singled out the cross-source question (a real incident
diagnosed with the textbook's four-component model) as the best item — generate these when natural.

## gen-v2

| Date | promptVersion | Model | Week | Generated | Accepted | Rejected | Accept rate | Reject reasons |
|---|---|---|---|---|---|---|---|---|
| 2026-09-11 | gen-v2 | claude-fable-5-1 | 2 | 30 | 23 | 7 | 77% | trivia ×6, hallucination ×1 |

Week 2 notes (gen-v2, in-session): 23 of 30 kept, 15 promoted (yield 15/30, up from 12/30). The batch
was reviewed twice — by the curator on the review page and by a fresh-context model reviewer that had not
seen the batch being written — and the two agreed on keep-vs-reject for 24 of 30 and on exact status for
14 of 30; the disagreements were resolved in discussion (three trivia calls went the curator's way, one
hallucination the reviewer's). gen-v2's parallelism rule worked: the correct option was the longest in 2 of
30, both by term length. New defects for gen-v3: (1) 8 of 30 stems said "the chapter" / "the essay" or used
bare acronyms (TPS/DSS/EIS, ERP, CRM) — the prompt now requires naming the source and expanding acronyms;
(2) "reversal distractors" — option sets made of one source claim plus three negations of it, answerable
from the direction of the author's thesis alone (c15, c20, c23, c28, c30) — distractors must now be real
source claims that don't fit the scenario; (3) coverage skew — five Carr items, one on the back half of the
slide deck — the prompt now asks for proportional coverage; (4) one hallucination (c30) misread the news
source. Process changes from this batch: `scripts/build-candidates.js` makes the in-session path a command,
`scripts/diff-decisions.js` compares two reviews, and the review page now shows lint warnings per question.


## gen-v3

| Date | promptVersion | Model | Week | Generated | Accepted | Rejected | Accept rate | Reject reasons |
|---|---|---|---|---|---|---|---|---|
| 2026-09-21 | gen-v3 | claude-opus-5[1m] | 3 | 30 | 29 | 1 | 97% | trivia ×1 |

Week 3 notes (gen-v3, in-session): 29 of 30 kept by the curator, 15 promoted, capped at 15 and split
about evenly across the four sources (textbook chapters 7–8, *The Adventures of an IT Leader* chapters 2–3,
the FreshDirect case, the Netflix article). The batch was written in a session running Opus 5, then re-checked
on Fable 5.1 before curation (one factual slip in a stem, four answer leaks, three unsupported feedback
lines fixed). The 97% accept rate overstates quality: the fresh-context reviewer kept 21 of 30 and wanted
edits on 15 of those; the two reviews agreed on keep-vs-reject for 20 of 30 and on exact status for 6 of 30.
gen-v3's rules held where lint can see them — zero lint warnings, every stem named its source, no bare
acronyms, coverage proportional. What lint cannot see, for gen-v4: (1) **shortest-option tell** — the
"correct must not be longest" rule overcorrected, and the correct option was the shortest in 14 of 30; the
correct option should sit mid-pack, and lint should warn on shortest as well as longest; (2) **stem-to-key
word echo** — five stems carried the distinctive word of the keyed option (warehouses → logistics, new
carriers → new entrants); (3) **self-defining options** — option sets that restate a framework's cell
definitions let the scenario be pattern-matched without knowing the framework; options should be the bare
terms; (4) **feedback drift** — feedback lines asserting links the source does not make ("precisely
because…"), or describing the reverse of the distractor they belong to; feedback needs the same grounding
check as the stem; (5) reversal distractors survived in two items despite the gen-v3 rule — replace with
true source claims that do not answer the question. Source prep: exhibits in the IT Leader ebook and
several slide figures are images, invisible to text extraction; they were transcribed or viewed by hand.
