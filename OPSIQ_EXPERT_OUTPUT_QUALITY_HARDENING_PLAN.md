# OpsIQ Expert Output Quality Hardening — Plan

Branch: `claude/opsiq-jarvis-360-audit-m8jro7` · Base HEAD: `9a80c90` · Do NOT merge.

Builds on the behavioral-validation subsystem (`src/behavioral-validation/`). Each slice = real tested
code, committed after its tests pass. New modules live under `src/behavioral-validation/expert/`.

## Slices

| # | Slice | New files | Tests | Status |
|---|---|---|---|---|
| 3 | Gold-standard expert answers | `expert/gold-answers.ts` | `gold-answers.test.ts` | pending |
| 4 | Business-math validator | `expert/business-math.ts` | `business-math.test.ts` | pending |
| 5 | Multi-turn owner simulations | `expert/multi-turn.ts` | `multi-turn.test.ts` | pending |
| 6 | Counterfactual case testing | `expert/counterfactuals.ts` | `counterfactuals.test.ts` | pending |
| 7 | Expert adjudication queue | `expert/adjudication.ts` | `adjudication.test.ts` | pending |
| 8 | Owner-goal alignment | `expert/owner-goal.ts` | `owner-goal.test.ts` | pending |
| 9 | Actionability score | `expert/actionability.ts` | `actionability.test.ts` | pending |
| 10 | Temporal outcome validation | `expert/temporal-outcome.ts` | `temporal-outcome.test.ts` | pending |
| 11 | Expert output contract | `expert/output-contract.ts` | `output-contract.test.ts` | pending |
| 12 | Benchmark ratchet | `expert/ratchet.ts` + `OPSIQ_EXPERT_BENCHMARK.json` | `ratchet.test.ts` | pending |
| 14 | Report | `OPSIQ_EXPERT_OUTPUT_QUALITY_HARDENING_REPORT.md` | — | pending |

Commit hashes recorded in the final report (§5/§16), not pre-filled here.

## Design principles (honesty)

- Gold answers are formalised from the seed cases' existing expert encodings (hiddenRootCause,
  correctExpertDecision, opsiqShouldBlock, proofRequired, reassessmentTrigger, learningRuleIfFails)
  — these were authored as expert answers; we expose them as a typed Gold contract, not fabricate new ones.
- Business-math validator computes real formulas and fails advice whose financial direction is wrong,
  independent of wording.
- Multi-turn / counterfactual / temporal slices test that OpsIQ's advice CHANGES with material facts
  and does NOT change on emotional-only pressure.
- Nothing claims READY unless every §13 gate passes. Expect an intermediate classification.

## Prohibitions

No public SaaS / billing / launch surface. No merge. Record any command that cannot run.
