# FINAL — Recovery Execution & Milestone-Proof Simulation (PASS 33)

**Date:** 2026-07-07
**Branch:** `claude/recovery-execution-milestone-proof-simulation`
**Classification target:** `RECOVERY_EXECUTION_MILESTONE_PROOF_ELITE_ACCEPTED`

## Objective
Prove OpsIQ can **execute** a survival/recovery plan over multiple governed
cycles, advancing milestones **only** when evidence + reassessment prove
readiness — with no milestone skipping, no fake completion, no premature growth,
and no fake recovery for an unrecoverable business.

## What was built
- **`src/domain/owner-mode/recovery-milestone-execution.ts`** — a conservative,
  deterministic recovery state machine (21 states) that consumes a PASS 32
  `SurvivalRecoveryPlan` plus the real `ProcessExecutionTask` milestone outcomes
  and computes the current recovery view. Pure (no Date/random/IO). Zod schema
  (`recoveryExecutionViewSchema`) enforces every gate fail-closed.
- **`src/__tests__/owner-mode/recovery-milestone-execution.test.ts`** — 17 unit
  tests (all passing).
- **`src/__tests__/execution/recovery-execution-milestone-proof.db.test.ts`** —
  11 DB tests (`TEST_WITH_DB=true`, all passing) driving the plan → governed
  ProcessCorrections → the already-proven execution bridge → real evidence-gated
  completion → the recovery state machine across 9 archetypes + regression +
  unrecoverable + clean control.
- CI wiring: the DB sim is added to **LANE_B (required)** and **LANE_A** in
  `.github/workflows/db-verification.yml`.
- Fixtures + audit artifacts under
  `docs/real-world-data/recovery-execution-milestone-proof/` and this directory.

## The four dimensions (held at all times)
1. **Consulting lifecycle stage** — recovery execution phase, gated by proof.
2. **Business condition** — crisis → stabilization → thrive, only on evidence.
3. **Intervention mode/phase** — milestone ladder (stop-loss → cash → quality →
   operations → workload → stabilization), reassessment-gated.
4. **Human execution reality** — owner overload/delegation, follow-through via
   evidence, owner approval gates; staff→training, never blame.

## Hard rules — proven
| Rule | How it is enforced | Test |
|------|--------------------|------|
| No milestone skipped | next = first not-proven, in order | unit #17, DB #7/8 |
| No completion without evidence | bridge `EVIDENCE_REQUIRED` + `executed&&evidenceProvided` | DB #2+3+4+5, unit #1 |
| Correction/stabilization need passing reassessment | `NEEDS_REASSESSMENT={3,4,6}` require `IMPROVED` | unit #4/5/7 |
| Stabilization gate opens only when all proven | `blockedMilestones.length===0` (schema refine) | unit #8, DB #7+8 |
| Thrive blocked until stabilization | schema refine `thrive!==ELIGIBLE \|\| stab===OPEN` | unit #8, DB #9 |
| Failed reassessment loops back | `WORSENED` → `RECOVERY_REGRESSED` | unit #10, DB #10 |
| Unrecoverable stays restructure/shutdown | first-branch return, thrive+stab BLOCKED (schema refine) | unit #11, DB #11 |
| No fabricated money/ROI/win-prob | `NO_MONEY` schema refine | unit #14, DB summaries |
| No hidden score | key walk assertion | unit #16 |
| Owner approval never auto | `ownerApprovalRequired` on thrive-eligible | unit #9/12, DB #6/9 |
| Clean fabricates nothing | null plan → null view | unit #15, DB #14 |

## Gates run (local)
- `npx tsc --noEmit` — clean.
- Unit suite — 17 passed.
- DB sim — 11 passed (`TEST_WITH_DB=true`, throwaway Postgres 16).
- Lint ratchet — `LINT_RATCHET_PASS` (0 new errors, 0 new warnings).

## CI acceptance requirement
Before merge, LANE_B logs must show
`recovery-execution-milestone-proof.db.test.ts` executed and
`✅ LANE_B_DB_VERIFIED`. A generic green DB lane is not accepted.
