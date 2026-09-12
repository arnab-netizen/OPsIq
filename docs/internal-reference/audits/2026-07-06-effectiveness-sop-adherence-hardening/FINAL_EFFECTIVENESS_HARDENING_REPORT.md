# Effectiveness / SOP-Adherence Classification Hardening

**Date:** 2026-07-06
**Branch:** `claude/effectiveness-sop-adherence-classification-hardening`
**Base main HEAD:** `6bb628d6355c8901a2e5f1260a93830d1ec25094` (developed on the PASS 25 tip; rebased onto main before the PR)
**Restriction targeted:** remaining **R3** caution around SOP-adherence re-check / effectiveness classification
**Classification:** **`EFFECTIVENESS_SOP_ADHERENCE_HARDENING_PROVEN`** · **R3 → REMOVED**

## The problem found
The effectiveness engine literally emitted *"…after the correction — it appears to be working"* whenever a metric improved, **without ever checking that the correction was executed**. That is correlation reported as causation — the exact false attribution R3 warns against.

## What changed — first-class attribution
A new pure module `effectiveness-attribution.ts` separates three facts that were conflated:

1. **execution** — was the correction/SOP/training actually carried out, with evidence? (`CorrectionExecutionState`)
2. **outcome** — did the targeted metric change, measured **after** execution?
3. **attribution** — can the outcome honestly be attributed to the action? (`EffectivenessAttributionState`)

OpsIQ may call a fix effective **only** when execution is evidenced **and** a post-execution reassessment shows improvement. The gate order in `classifyEffectivenessAttribution` makes a `VERIFIED_*` / monitor-only state unreachable otherwise.

Four first-class state families were added and are **used in logic, tests, and UI** (not dead enums):
- `CorrectionExecutionState` — PROPOSED / ASSIGNED / IN_PROGRESS / EXECUTED_WITH_EVIDENCE / EXECUTED_WITH_WEAK_EVIDENCE / NOT_EXECUTED / BLOCKED / CANCELLED / UNKNOWN.
- `SopAdherenceState` — SOP **adopted** (change made) is distinct from SOP **adherence-verified** (people follow it); verification needs a post-adoption re-check with evidence, else `NEEDS_RECHECK`.
- `TrainingEffectivenessState` — training **assigned** ≠ **completed** ≠ **effective**; effectiveness needs a post-training reassessment.
- `EffectivenessAttributionState` — the single verdict that decides whether a fix may be called effective.

## Wiring (execution-linked, no new schema)
- **`owner-now-view`** now derives each correction's real `CorrectionExecutionState` from its persisted `pc:<correctionId>` task (COMPLETED-with-evidence ⇒ executed) and feeds it to the effectiveness engine. `active` (scored as implemented) is true **only** when execution is proven — closing the gap the C1 comment described.
- **`sop-training-effectiveness-loop`** computes the raw metric direction independently of `active`, classifies attribution, sets a first-class `attributionState`, and replaces the false "appears to be working" line with attribution-honest wording (verified vs unattributed).
- **`process-execution-bridge-expansion`** routes the effectiveness family by `attributionState` via a single-source `ROUTE_FOR_ATTRIBUTION` map: verified improvement → `MONITOR_ONLY` (not completable); executed-but-unmeasured / unchanged → reassessment; improved-but-not-executed / weak → an execution-evidence request (**not** attributed); worsened-after-execution → owner escalation; unknown → data task.
- **`EffectivenessPanel`** renders an `eff-item-attribution` badge with the honest verdict.

## Owner-visible language
Allowed, precise wording now flows through (e.g. *"Correction executed with evidence; reassessment shows improvement after execution."* and *"The issue improved, but OpsIQ cannot attribute the improvement to this correction because execution evidence is missing."*). The disallowed *"appears to be working"* is gone from the engine, and the panel test fixture was updated to honest wording. No fabricated percentage / money / ROI appears anywhere.

## Tests
- `effectiveness-attribution.test.ts` — **24** pure cases across every execution × outcome combination plus the SOP-adherence and training-effectiveness classifiers, and a no-fabrication sweep.
- `effectiveness-sop-adherence-classification.db.test.ts` — **12** real-Postgres cases driving attribution from the **persisted** execution state: proposed-not-executed cannot report improved; executed-without-measurement → reassessment; executed-with-improvement → verified monitor-only; improvement-without-execution not attributed; worsened-after-execution → owner escalation; monitor-only route is **not completable**; SOP adopted-vs-followed; training completed-vs-effective; isolation; clean-workspace no-fabrication. Wired into LANE_B / LANE_A.
- Updated the PASS 23 bridge tests + the effectiveness panel test to the attribution model.

## Verification (local)
`prisma validate` ✓ · `tsc --noEmit` ✓ · `governance:scan:strict` ✓ (0 new) · `lint:ratchet` ✓ · broad suite **168 files / 1438 tests** green (execution + owner-mode + components) · `next build` ✓. Commands run: git status, git rev-parse, prisma validate/generate, tsc, governance, lint:ratchet, effectiveness/SOP/training/process-execution/owner-cockpit tests, the DB sim, next build. None failed or were blocked.

## R3 status
**REMOVED.** SOP-adherence and effectiveness classifications are now first-class, execution-linked, and proven: false attribution is impossible in the tested logic; proposed/assigned/executed/verified are distinct; SOP adopted ≠ followed; training assigned ≠ completed ≠ effective; improvement without execution proof is not attributed; execution without outcome proof requires reassessment; worsened/unchanged create follow-up routes; a verified improvement is safe monitor-only and non-completable; owner wording is precise; the DB sim runs in CI; workspace isolation holds.

## Remaining restrictions
- **R6 — exhaustive read/audit proofs:** `RETAINED_SAFELY` (non-blocking proof-scope; covered incrementally by per-pass DB sims + CI).

## Next safest pass
A consolidated **whole-corpus read/audit proof (R6)** in a dedicated audit-only pass, or extending the interactive execution surface to opportunity-execution — both outside this loop and neither gating current behaviour.
