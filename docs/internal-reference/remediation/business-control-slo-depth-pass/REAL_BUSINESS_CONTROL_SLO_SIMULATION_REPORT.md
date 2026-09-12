# Real-Business Control-SLO Simulation Report

**Test:** `src/__tests__/owner-mode/business-control-slo-simulation.db.test.ts` (DB-backed, no mocks).

## Scenario — "Sparkle Laundry"
Seeded owner workload/review pressure: 5 overdue weak (NEEDS_HUMAN_REVIEW) proofs from one operator +
a manager self-review (reviewer == submitter).

## Result (graded via the live Owner Now View)
- **Mix, no always-green:** at least one **PASS**, at least one **WARN/FAIL**, at least one
  **NOT_MEASURABLE** — proven.
- `WEAK_PROOF_REVIEW_RATE` → **FAIL** (5/6 weak) with a real measured value ("83% (5/6)").
- `ANTI_GAMING_RISK` → **FAIL** (self-review) linked to the gaming signal.
- `REASSESSMENT_LATENCY` → **NOT_MEASURABLE** with the exact missing source (trigger↔reassessment
  timestamp linkage) — no fabricated metric.
- `overallStatus` = FAIL; `topControlRisk` is a real WARN/FAIL with a specific corrective action.
- Owner-callable `getBusinessControlHealth` returns the same graded health.
- Deterministic across two live reads.
- A clean workspace grades with **0 fabricated failures** (weak-proof rate NOT_MEASURABLE — no proofs);
  the laundry's weak proofs do not bleed in (workspace isolation).

## Asserted
Control health graded · top control risk owner-visible with corrective action · measured values where
real · NOT_MEASURABLE with exact missing source · no fake metrics · determinism · workspace isolation.
