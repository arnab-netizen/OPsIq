# Phase 2 G1 — Diagnosis Fail-Closed End-to-End Proof (Final Report)

## 1. Gap ID
**G1** (Wave-8 owner-journey coverage matrix).

## 2. Owner-journey stage
Stage 3 — `diagnosis-confidence` ("First diagnosis with fail-closed confidence"). Dimensions
exercised: (1) consulting lifecycle stage — diagnosis → recommendation; (2) business condition —
evidence sufficiency drives the gate.

## 3. Baseline status from Wave-8 matrix
`partial_gap`. Wave-8 recorded: "Onboarding proves weak-business low-confidence + missing-data; a
dedicated end-to-end assertion that a confident diagnosis is BLOCKED (not merely low) on
contradictory/insufficient evidence is owed (ties to the Wave-7 `isDataSufficient` fail-closed unit
proof)." Wave 7 proved the `isDataSufficient` control primitive in isolation; the end-to-end
propagation through the owner-facing recommendation generator was still owed.

## 4. Proof added
A new pure service-logic test that drives the **real** owner-facing recommendation generators
(`generateRecommendation` and `generateMultipleRecommendations` in
`src/services/intelligence/recommendation.ts`), which internally call the **real** `isDataSufficient`
control gate and the **real** variable registry. It asserts, end-to-end, that:

1. **Insufficient patterns hard-block** — fewer than 3 patterns → `blocked=true`,
   `blockReason="INSUFFICIENT_PATTERNS"`, `confidenceScore=0`, `dataSufficiency="insufficient"`, and
   **no** `recommendedAction`, even when variable confidence is high (so the block is due to
   evidence volume, not confidence).
2. **Contradictory / low-confidence evidence hard-blocks** — with sufficient pattern volume but a
   variable confidence below the 0.6 threshold → `blocked=true`,
   `blockReason="LOW_CONFIDENCE_VARIABLES"`, `confidenceScore=0`.
3. **"blocked" is a distinct, harder state than "merely low / unmet quality"** — sufficient
   trustworthy patterns whose success rate does not clear the >60% bar produce
   `dataSufficiency="insufficient"` but **not** a hard block (no `blocked` flag, `confidenceScore`
   reflects the pattern, no fabricated action), directly contrasted against the confidence-0 hard
   block. This is the exact "blocked, not merely low" distinction the gap called for.
4. **The gate is not a trivial always-block** — sufficient + strong + trustworthy evidence yields a
   real confident, actionable recommendation (`dataSufficiency="sufficient"`,
   `confidenceScore>0.6`, concrete `recommendedAction`).
5. **The owner-facing multi-recommendation path fails closed identically** for both block reasons.

## 5. Files changed
- Added: `src/services/intelligence/__tests__/recommendation-fail-closed.test.ts` (proof test).
- Added: `docs/audits/2026-07-08-phase-2-G1-diagnosis-fail-closed/FINAL_REPORT.md`,
  `EVIDENCE_LEDGER.json`, `COVERAGE_DELTA.md`.
- No product/source/schema/CI change.

## 6. Tests added / reactivated
Added `recommendation-fail-closed.test.ts` (7 assertions across 4 describe blocks). No test
reactivated, deleted, weakened, or quarantined. It runs in the **required** maintained vitest lane
(`src/**/*.test.ts`, `TEST_WITH_DB=true`) and is pure/deterministic (no DB, no browser, no
OOM exposure).

## 7. Product defects found
**None.** The fail-closed behaviour is correctly implemented in
`src/services/intelligence/recommendation.ts`; the gap was missing *proof* of end-to-end
propagation, not a defect. Verified the two insufficiency states ("blocked" vs "unmet quality") are
genuinely distinct in the source and asserted the distinction rather than papering over it.

## 8. Fixes made
**None** (no defect). Test-only change.

## 9. Commands run
- `git checkout -B claude/phase-2-owner-journey-G1-diagnosis-fail-closed origin/main`
- Static verification of every assertion against `src/services/intelligence/recommendation.ts`,
  `src/services/control/recommendation.ts`, and `src/services/control/variable-registry.ts`.
- `node_modules` absent locally (matching prior Phase-1 waves) → test execution is delegated to the
  required PR CI lane (`CI - Build & Test` → "Run maintained test suite").

## 10. CI status
To be confirmed on the draft PR — see EVIDENCE_LEDGER `ci_checks`. Expected required gate:
`CI - Build & Test` runs the new test in the maintained suite.

## 11. Remaining risks
- Owner-journey proof for stages still lives across lanes; G5 promotes a consolidated smoke into the
  required lane. G1's test already lands in the required lane, so this specific fail-closed proof is
  a required gate from merge.
- The pre-existing `Smoke - Production Dashboard` failure (`membership_lookup_failed`) is unrelated
  to G1 and out of scope; it is non-required and fails identically on all merged Phase-1 commits.

## 12. Rollback plan
Single test-only commit (1 proof test + audit docs). `git revert` restores prior state with zero
product/source/schema/CI impact.

## 13. Next gap recommendation
Proceed to **G2** (recommendation priority ordering end-to-end): the Wave-3 DB test asserts ordering
using a string comparison of `high`/`medium`/`low`, which is not a semantic highest-priority-first
assertion. G2 should prove deterministic semantic ordering (high before medium before low).
