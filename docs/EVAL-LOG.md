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
