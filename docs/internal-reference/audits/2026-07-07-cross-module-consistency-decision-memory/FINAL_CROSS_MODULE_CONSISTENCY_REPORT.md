# FINAL — Cross-Module Consistency + Decision Memory (PASS 48)

**Date:** 2026-07-07 · **Branch:** `claude/cross-module-consistency-decision-memory-proof`
**Base main:** `a14fae15` (contains PASS 47 #179)
**Classification:** `CROSS_MODULE_CONSISTENCY_MEMORY_ELITE_ACCEPTED`

## Objective
Prove OpsIQ's modules speak with **one coherent business voice** and do not contradict each other after
multiple events and decisions — finance vs opportunity, recovery vs growth, public signal vs internal
evidence, SOP/training vs repeat, owner-declined vs re-suggestion, tender urgency vs eligibility, capability
gap vs automation, and a single coherent owner cockpit top action.

## Approach — compose the real engines, prove they agree
No new engine. Each conflict is set up as a scenario and the resolution is computed by the existing engines:
`planBusinessSurvivalRecovery`/`planAndValidateSurvival`, `assessGrowthReadiness` → `evaluateProgressionRecommendation`,
`evaluateDoNotRepeat` + `recordDoNotRepeat`, `interpretRawPublicSignal`, `prioritisePublicSignals` →
`explainOwnerCockpitDecision`, and `getPhaseAllowedTransitions`.

## Required behaviours — all proven
1. **Cash protection overrides growth** when cash is missing/weak (`weak_cash_runway` blocks the move; a cash
   crisis keeps the top action on cash and blocks scale).
2. **Recovery gates override opportunity gates** (an unproven SOP/manager layer and a capability blocker
   block scale; the phase machine cannot jump `triage`/`stabilization` → `growth`).
3. **Internal evidence overrides weak public signal** (`financialClaimAccepted` is always false; a public
   "all resolved / guaranteed £5000" claim never closes the issue and still needs internal validation).
4. **Public signal stays validation-needed** and never overrides a completed internal reassessment.
5. **A failed SOP/training correction is not recommended again unchanged** (persisted do-not-repeat memory;
   override requires a changed-context reason).
6. **An owner-declined action is not re-suggested** without changed conditions (persisted memory).
7. **A repeated missing-data condition stays explicitly blocked/uncertain** — never a fabricated figure.
8. **Tender urgency does not bypass eligibility/cost/capacity/EMD** (auto-submit + auto-EMD blocked; owner-gated).
9. **A capability gap blocks automation/growth** (capability blocker becomes the top action).
10. **The owner cockpit shows ONE coherent top action** (topic `quality`), with growth subordinated
    (`whyNotGrowthYet` present) and **secondary actions grouped** (2 groups), ranked on a **transparent
    priority tier, not an opaque score**.

## The 15 DB-sim proofs — all satisfied
finance/recovery/capability each block growth (1,2,9) · internal evidence beats weak public signal (3) ·
public stays validation-needed (4) · failed correction not repeated unchanged (5) · owner rejection
remembered (6) · missing-data loop not converted to certainty (7) · tender urgency does not override gates
(8) · one cockpit top action (10) · secondaries grouped (11) · clean control fabricates nothing (12) ·
workspace isolation holds (13) · no fake money/ROI/win-probability (14) · no unsafe/autonomous action path
(15). Persisted memory (`recordDoNotRepeat` → `ownerDoNotRepeatRule` + audit event) and isolation are
exercised on real Postgres.

## Gates (local)
prisma validate ✓ · tsc ✓ · governance:scan:strict 31-frozen/0-new ✓ · lint:ratchet PASS (0 new) ✓ · unit
17/17 ✓ · DB sim 6/6 on real Postgres ✓ (logs `LANE_B_CROSS_MODULE_DB_SIM_EXECUTED`) · next build ✓.

## LANE_B verification
`cross-module-consistency-decision-memory.db.test.ts` is added to the LANE_B and LANE_A explicit file lists
in `db-verification.yml`; the LANE_B job runs it against a throwaway `postgres:16` and prints
`✅ LANE_B_DB_VERIFIED` on success.

## Classification justification
All required module conflicts are tested; decision memory is proven and persisted; stale/owner-declined
recommendations are blocked; the cockpit remains coherent (one top action, grouped secondaries); the DB sim
runs in LANE_B; required CI is green. → `CROSS_MODULE_CONSISTENCY_MEMORY_ELITE_ACCEPTED`.
