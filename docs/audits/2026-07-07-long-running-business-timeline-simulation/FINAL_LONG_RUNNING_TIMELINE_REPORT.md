# FINAL — Long-Running Business Timeline Simulation (PASS 47)

**Date:** 2026-07-07 · **Branch:** `claude/long-running-business-timeline-simulation`
**Base main:** `ac87780e` (contains PASS 45 #177, PASS 46 #178)
**Classification:** `LONG_RUNNING_BUSINESS_TIMELINE_ELITE_ACCEPTED`

## Objective
Stop adding isolated features and prove OpsIQ stays **coherent, safe, useful and execution-based** across an
evolving multi-week business timeline — repeated events, changing conditions, failed and successful
corrections, owner refusals, recurring missing data, a growth temptation during instability, regression,
and gated recovery — while **remembering** what already happened and **not repeating failed advice**.

## What was built
- **`src/domain/execution/business-timeline-simulation.ts`** — a PURE scenario driver. It holds one evolving
  business state and, per event, DELEGATES every decision to existing engines: `planBusinessSurvivalRecovery`
  (survival top action + severity ladder + gates), `assessGrowthReadiness` → `evaluateProgressionRecommendation`
  (fail-closed growth gate), `evaluateConditionTransition` (adaptive re-assessment trigger), `evaluateDoNotRepeat`
  (decision memory). Growth signals and crisis inputs are **derived from one state**, so finance and growth
  cannot contradict. No new gating logic; no duplicate engine.
- **`src/domain/execution/business-timeline-fixture.ts`** — the canonical **8-week / 32-event / 7-reassessment**
  laundry timeline as data (placeholders only, no PII).
- **Tests** — unit `business-timeline-simulation.test.ts` (**14/14**) and DB `long-running-business-timeline.db.test.ts`
  (**8/8** on real Postgres), wired into **LANE_B and LANE_A** explicit lists in `db-verification.yml`.
- **Artifacts** — `docs/real-world-data/long-running-business-timeline/` (fixtures, expectations, event ledger,
  privacy notes, run report) + this audit folder (decision/memory/safety matrices, evidence ledger, deferred gaps).

## Required minimums (met)
8 weeks · 32 events (≥30) · 7 reassessment cycles (≥6) · owner decisions: approve, decline-marketing,
decline-tender, approve-growth-experiment (≥5) · staff/manager tasks (≥5) · failed/blocked actions: failed ops
fix, blocked repeat, blocked growth, regression, blocked owner-rejected resuggest (≥3) · evidence-backed
completions (≥3) · growth temptations: tender + growth (≥2) · a regression after improvement (e24) · a clean
control that fabricates nothing (e32).

## The 20 DB-sim proofs — all satisfied
1 chronological load · 2 top action changes with facts · 3 no repeat of a failed rec without new evidence
(persisted `ownerDoNotRepeatRule` + `evaluateDoNotRepeat` + audit) · 4 owner rejection remembered · 5
missing-data never a fake fact (`markFactUnknown` → `newValue = null`, unconfirmed intake) · 6 completion
requires ACCEPTED evidence (`ProofRequirement` gates `evaluateProofClearance`) · 7 reassessment after
completion · 8 failed reassessment loops back (e24→e26 returns to customer recovery) · 9 positive signal does
not close without evidence (weak proof e25) · 10 growth blocked during instability · 11 stabilization gate
opens only with proof (e28 recover) · 12 thrive gate opens only after stabilization proof (e30) · 13 one
cockpit top action · 14 clean control fabricates nothing · 15 workspace isolation (memory rule invisible
cross-workspace) · 16 no fake money/ROI/win-probability · 17 no unsafe growth action (scale always blocked) ·
18 no hidden score (transparent 0–100 condition score only) · 19 no staff blame/discipline/payroll · 20 no
autonomous external action (auto-contact/send/spend/submit always blocked).

## Gates (local)
prisma validate ✓ · tsc ✓ · governance:scan:strict 31-frozen/0-new ✓ · lint:ratchet PASS (0 new) ✓ · unit
14/14 ✓ · DB sim 8/8 on real Postgres ✓ (logs `LANE_B_TIMELINE_DB_SIM_EXECUTED`) · recovery-milestone +
cockpit regression suites 24/24 ✓ · next build ✓.

## LANE_B verification
`long-running-business-timeline.db.test.ts` is added to both the LANE_B and LANE_A explicit file lists in
`db-verification.yml`; the LANE_B job runs it against a throwaway `postgres:16` and prints
`✅ LANE_B_DB_VERIFIED` on success.

## Classification justification
The DB simulation runs in LANE_B and proves the full timeline, decision memory, the survive→stabilize→
recover→grow gates, safety (no fabrication / no unsafe / no autonomous action / no staff blame), workspace
isolation, and the clean control — all against real Postgres with real services and the real engines. →
`LONG_RUNNING_BUSINESS_TIMELINE_ELITE_ACCEPTED`.
