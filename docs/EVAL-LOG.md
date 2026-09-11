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
