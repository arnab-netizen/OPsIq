# OpsIQ Expert Output Quality Hardening — Report

## 1. Branch
`claude/opsiq-jarvis-360-audit-m8jro7`

## 2. Base HEAD
`9a80c90` (behavioral-validation subsystem)

## 3. Final HEAD
`a01a855` (slice 12) — report commit appended on top.

## 4. Working tree status
Clean after each slice; all work committed. Do NOT merge.

## 5. Files changed
24 files, +2332 / -1. New module dir `src/behavioral-validation/expert/` (10 modules) + 10 test
files + `OPSIQ_EXPERT_BENCHMARK.json` + plan/report. Touched: `schema.ts` (+`calculationTrace`,
`riskAnalysis`, `learningMemoryNote`), `advisor.ts` (calculation trace, SOP/responsibility line,
FMEA, learning note, fallback for all high-risk, staff/multi-branch blocks).

Slice commits:
- 3 gold answers `80457e1` · 4 business-math `5967dd5` · 5 multi-turn `31345d7` · 6 counterfactual `ffd7f09`
- 7 adjudication `387855c` · 8 owner-goal `cc140e2` · 9 actionability `05691f9` · 10 temporal-outcome `3e4f5e7`
- 11 output-contract `11a550f` · 12 ratchet `a01a855`

## 6. Gold-answer coverage
Typed 12-field Gold contract (`expert/gold-answers.ts`) derived from each case's authored expert
encoding. **All 31 seed cases → REQUIRED gold** (schema-valid, minimum-gold satisfied). Generated
variants → PARTIAL with the minimum fields (root cause, blocked action, proof, reassessment).
`canEnterExpertValidation` blocks cases lacking minimum gold. Gold comparison fails generic answers
and wrong-root-cause answers even when the action sounds reasonable.

## 7. Business-math validator status
Implemented (`expert/business-math.ts`): 20 pure calculators + `validateBusinessMath`. Fails
financially wrong advice regardless of wording — below-margin contract accepted, spend in cash
crisis, net-ROAS<1 scaling, growth over capacity, back-loaded-terms acceptance, irreversible action
on missing data, missing calculation trace. Advisor emits a calculation trace for finance-material
cases. Base advisor: **0 violations** across all seeds.

## 8. Multi-turn simulation status
Implemented (`expert/multi-turn.ts`): 10 scripted owner behaviours. `runSimulation` verifies unsafe
pushback stays blocked, recommendation changes on material new data, stance holds (and confidence
does not rise) on emotional-only pressure, missing data is requested, reasoning stays consistent.

## 9. Counterfactual testing status
Implemented (`expert/counterfactuals.ts`): 10 pairs. Same-symptom/different-root-cause, different
payment terms, different net margin, and different location all produce materially different advice
on the declared dimension (calculation trace, recommendation, capacity/compliance handling, local
adaptation, cash block).

## 10. Expert adjudication queue status
Implemented (`expert/adjudication.ts`): 10 triggers route uncertain/high-stakes/disputed cases away
from auto-learning into a full-evidence queue. Approval persists+approves+optionally promotes the
artifact via the governed store; rejection never saves it.

## 11. Owner-goal alignment status
Implemented (`expert/owner-goal.ts`): 12 structured goals. `assessGoalAlignment` challenges unsafe
goals, lists blocking constraints, refuses unsafe growth, proposes a staged path, avoids vanity
revenue, protects staff and owner workload, surfaces tradeoffs. `adviseForGoal` makes the goal
genuinely change the output.

## 12. Actionability score status
Implemented (`expert/actionability.ts`): 10 executable components → 0–100. Generic and diagnosis-only
outputs fail; owner+staff+proof+deadline+metric+stop outputs pass. Base advisor produces actionable
output (responsibility + deadline + stop present).

## 13. Temporal outcome validation status
Implemented (`expert/temporal-outcome.ts`): 7/14/30/60/90-day checkpoints with all 8 fields.
Success reinforces the playbook; failure produces an AAR + a persisted learning artifact (read by
the advisor so the FUTURE recommendation changes) + a per-workspace do-not-repeat suppression.

## 14. Expert output contract status
Implemented (`expert/output-contract.ts`): 22 sections, relevance-gated requirements. Missing root
cause / what-not-to-do (high-risk) / calculation trace (finance) / proof (operational) /
reassessment (high-risk) / professional review (compliance) all fail. Base advisor satisfies the
contract on **100%** of relevant seed cases.

## 15. Benchmark ratchet status
Implemented (`expert/ratchet.ts`) + `OPSIQ_EXPERT_BENCHMARK.json`. Fails any regression: unsafe must
never increase, critical domains hold floor+tolerance, holdout within tolerance, zero regression
failures, both green guards green; minor non-critical dip needs a written explanation. A test asserts
the **live system still meets** the accepted benchmark.

## 16. Tests run
`tsc --noEmit` (clean for new code) · `eslint` on all changed files (0 problems) ·
`vitest run src/__tests__/behavioral-validation/` → **133 passed, 3 skipped ([db]-gated)** ·
smoke validation CLI. Per-slice suites: gold 6, business-math 12, multi-turn 6, counterfactual 6,
adjudication 6, owner-goal 6, actionability 6, temporal-outcome 6, output-contract 9, ratchet 8.

## 17. Scores before/after
| Metric | Before this work | After |
|---|---|---|
| Overall (core, learned) | 76.2 | **77.8** |
| Holdout | — | **77.3** |
| Adversarial (hostile) | 77.9 | **79.1** |
| Unsafe outputs | 0 | **0** |
| Regression failures | — | **0** |

## 18. Unsafe output count
**0** after learning across the 310-case core run (and 0 in holdout/adversarial).

## 19. Numerically wrong output catches
`validateBusinessMath` catches 7 classes of financially-wrong advice; unit-tested that
expert-sounding wording does not rescue a below-margin/loss-making/over-capacity recommendation.

## 20. Generic advice catches
Gold comparison + scorer + actionability all fail generic/filler advice; `genericAnswerFailsGreen`
guard is part of the ratchet and is **green**.

## 21. Weakest domains
`owner_workload` (1.39/6) — the known sub-threshold residual (the failure loop rarely makes it the
primary failure). Next: `learning_reassessment` and `decision_quality`.

## 22. Weakest locations
`India|tier3` (lowest learned average) — thin-margin, low-data contexts.

## 23. Weakest business types
`logistics_delivery_fleet`.

## 24. Learning artifacts used
Core run: 67 artifacts from base failures, **130/310 cases apply ≥1 artifact** (provenance recorded).
Outcome failures and adjudication approvals also produce/promote artifacts.

## 25. Outcome-learning proof
Test `temporal-outcome`: a failed checkpoint persists an artifact that the advisor then reads, so the
next recommendation for the same case demonstrably changes (`learningNotesApplied` non-empty, output
differs), and the failed action is suppressed per workspace.

## 26. Remaining gaps
- Overall expert score **77.8 < 90** — `owner_workload` offload remains a sub-threshold residual.
- Validation still runs against the **deterministic harness advisor**, not a unified production
  owner-advice runtime (§11 limitation carried forward from the behavioral-validation report).
- Holdout/adversarial in the high-70s, not yet expert-grade.

## 27. Final classification
**`EXPERT_OUTPUT_CORE_READY`**

All ten expert-output-quality mechanisms are implemented, enforced, and green; every §13 component
gate passes at the harness level (gold for all seeds, business-math validator, multi-turn,
counterfactual, adjudication, owner-goal, actionability, temporal outcome, output contract, ratchet;
generic/numerically-wrong/unsafe/overconfident advice all fail; FMEA on high-risk; future
recommendations use stored learning; failed outcomes change future recommendations; critical domains
above floor; holdout/adversarial/regression pass; no cross-business leakage).

It is deliberately **NOT** promoted to `READY_FOR_REAL_WORLD_CASE_TRAINING` because the overall
expert score (77.8) is below the 90 expert bar and validation runs against the harness advisor rather
than a unified production owner-advice runtime. Those two items are the gate to the top rung.
