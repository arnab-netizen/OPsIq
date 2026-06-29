# OPSIQ POST-HARDENING — MAIN CONFIRMATION

Confirms that the pre-training hardening (Defects 1 & 5) is merged to `main` and that the post-hardening
baseline remains reproducible on `main`'s code. No behavioral validation/training started.

## 1. PR number
**#56** — "Pre-training hardening: approval reliability and adaptive reassessment baseline"
(`claude/pretraining-baseline-hardening` → `main`).

## 2. Merge commit
**`fa1e057`** (`fa1e05768724631fc566b5aed29b3bf65b1fa1cf`). Merge method: merge commit.

## 3. Main HEAD
`fa1e057` — working tree clean. Hardening present on `main`:
- migration `prisma/migrations/20260629000000_audit_entity_id_text/migration.sql` ✓
- `audit_events.entity_id` is `text` (schema) ✓
- `computeReassessmentCadence` in `business-condition.service.ts` ✓
- `OPSIQ_POST_HARDENING_PRE_TRAINING_BASELINE.md` ✓

## 4. CI run IDs
- **`ci.yml` on `main` (merge `fa1e057`):** run **`28349814415`** — lint ✓, tsc ✓, prisma validate ✓,
  **migrate deploy ✓**, build ✓, wrapped-handlers ratchet ✓, maintained suite (final gate). The app/test
  tree is identical to commit `6bb1003`, whose `ci.yml` run **`28348545508`** completed **success** (full
  maintained suite + migration).
- **`ci.yml` on PR head `62cc49e`:** build-and-test **`28348832465`** success; all verify lanes
  (phase-d, p2c, MVP, security, LANE_B, Build+Type+Prisma) success. The only red was the pre-existing,
  non-required "Phase 3 Slice 2 Gates" (a stale `execution.md` doc-classification gate, untouched by this
  branch, identical behavior to PR #55) — not branch-caused.

## 5. Owner-baseline run ID (reproduced on main's code)
**`28349858812`** (branch `claude/main-baseline-confirm`, commit `250b868` — app/migration tree identical to
`main` `fa1e057`; the only diff from `main` is the workflow trigger branch). Conclusion **success** ("1
passed"). Captured on main's code:
- `riskyDiscountApproval` → **`200` `needs_owner_approval`** (was HTTP 500) — Defect 1 fix reproduced.
- `proofGatedCompletion` → **`409` `proof_not_accepted`** — proof gate still enforced.
- `reassessmentCadenceDays: 7` + reason "High survival/execution risk — weekly cash, complaint and capacity
  review until the condition stabilises." — Defect 5 fix reproduced.
- `survivalRiskScore: 77`, `isStaleData: true` — same scenario inputs as the original baseline.
(Full raw artifact: workflow artifact `pre-training-baseline` on run `28349858812`.)

## 6. Baseline score on main
**70 / 100** — unchanged from the post-hardening measurement (same scenario/seed/spec/rubric; the exact
captured outputs match: approval 200, proof 409, cadence 7-day, survival risk 77). No score regression.

## 7. Remaining weaknesses (behavioral-validation scope, unchanged)
- **Defect 2** — margin/discount trap not surfaced (`financeBlocked` is event-driven; discount lives in the diagnosis).
- **Defect 3** — quality complaint not elevated in the command-center guidance.
- **Defect 4** — owner workload reduction still 0 (`handledByOpsIQ: 0`, `approvalsAvoided: 0`).
Each has an identified wiring point; all require new guidance thresholds/automation = behavioral validation.

## 8. Whether behavioral validation may start
**Yes.** Both clearly-scoped product defects are fixed, merged to `main`, and CI-proven; the post-hardening
baseline (70/100, no critical reliability defect) is reproducible on `main`. Behavioral validation/training
should now target Defects 2/3/4 against this same Kolkata baseline (goal: raise the score above 70 without
introducing any new unsafe output). **Behavioral validation has not been started.**
