# OPSIQ POST-HARDENING (PRE-TRAINING) BASELINE

Re-measurement of the **same** realistic scenario after fixing captured product defects — **no training,
no new advisory intelligence, no rubric change, no seed tuning**. Same scenario, seed, Playwright path,
and 100-point rubric as `OPSIQ_PRE_TRAINING_REALISTIC_SCENARIO_BASELINE.md` (which is left unchanged).

- **Branch:** `claude/pretraining-baseline-hardening` (from `main` `a4241a9`).
- **HEAD:** `6bb1003`.
- **Rerun (Playwright, real backend):** `owner-baseline.yml` run **`28348545590`** — success ("1 passed");
  the spec additionally asserts the approval route is **not** a 500.

## 1. Original score
**61 / 100** (PARTIAL_OWNER_GUIDANCE).

## 2. New score
**70 / 100** (PARTIAL_OWNER_GUIDANCE) — **+9**.

## 3. Delta by rubric category
| Dimension | Max | Before | After | Δ | Why |
|---|---|---|---|---|---|
| Diagnosis | 15 | 11 | 11 | — | unchanged |
| Finance/cash/margin | 15 | 9 | 9 | — | margin/discount trap still not surfaced (D2 deferred) |
| Operational realism | 10 | 7 | 7 | — | unchanged |
| Decision quality | 10 | 4 | **7** | +3 | risky-approval decision path now works (200 needs_owner_approval), no crash |
| Execution guidance | 10 | 7 | 7 | — | unchanged |
| Marketing/opportunity | 10 | 4 | **6** | +2 | the discount/B2B decision now routes to the owner (not 500, not auto-accepted) |
| Risk/compliance | 8 | 6 | **7** | +1 | critical reliability defect resolved; controlled decision |
| Data sufficiency | 8 | 7 | 7 | — | unchanged |
| Owner workload reduction | 6 | 2 | 2 | — | handledByOpsIQ still 0 (D4 deferred) |
| Reassessment/learning | 8 | 4 | **7** | +3 | adaptive 7-day urgent cadence with a visible reason |
| **Total** | **100** | **61** | **70** | **+9** | |

## 4. Unsafe outputs before / after
- **Critical reliability defect: 1 → 0.** The risky-approval route no longer returns HTTP 500; it returns a
  controlled `200 needs_owner_approval` (and does **not** auto-accept the below-margin discount/B2B).
- **Strict 10-item unsafe outputs: 1 → 1 (unchanged).** "Quality complaint not elevated in command-center
  guidance" remains (Defect 3 deferred — see §6).

## 5. Defects fixed
- **Defect 1 — risky-approval HTTP 500 (critical).** Root cause: `audit_events.entity_id` was typed `uuid`,
  but it is a generic identifier and many audit paths legitimately write non-uuid keys
  (`"approval.owner_decision_required"`, `"scope:hash"`, `"system-run"`, `"queue"`, …) → P2007 500 on a whole
  class of audit writes. **Fix:** widen `entity_id` to `text`
  (migration `20260629000000_audit_entity_id_text` + schema). The owner approval-resolution flow now returns
  `200 {outcome: needs_owner_approval, ownerActionRequired: true, handledByOpsIQ: false}`; server
  enforcement, override-reason handling and audit recording are unchanged. Proven by a `[db]` test
  (`approval-resolution-no-500.db.test.ts`) and by the rerun (approval status 200, asserted ≠ 500).
- **Defect 5 — reassessment cadence too generic.** The cadence was a fixed 30 days regardless of condition,
  contrary to CLAUDE.md's mandatory adaptive review-cadence rule. **Fix:** `computeReassessmentCadence`
  adapts to the diagnosed condition (survival/execution risk ≥70 → **7-day** weekly, ≥40 → 14-day, else
  30-day), with a visible reason in the command center. Pure unit test
  (`reassessment-cadence.test.ts`, 5 cases). Rerun shows `reassessmentCadenceDays: 7` + reason for the
  survival-risk-77 scenario.

## 6. Remaining weaknesses (intentionally deferred to behavioral validation, not faked or hidden)
These were **not** changed here because fixing them requires inventing new guidance thresholds / automation,
which is exactly the "new advisory intelligence / tuning" this pre-training phase forbids. Each has a precise
wiring point for the training phase:
- **Defect 2 — margin/discount trap not surfaced** (`financeBlocked: 0`; no "don't discount below margin"
  what-not-to-do). The control center's `financeBlocked`/finance what-not-to-do is **event-driven** (counts
  `MarginSafetyGateError`/`MARGIN_SAFETY_BLOCKED` audit blocks over 30 days). The scenario's discount lives in
  the finance *diagnosis*, never passed through the margin gate, so no block event exists. Surfacing the
  *diagnosed* margin risk (or routing the discount approval through the margin gate) is a guidance-policy
  decision for behavioral validation (`owner-block-metrics.service.ts` + `buildOwnerControlCenter`).
- **Defect 3 — quality complaint not elevated.** The operations domain *is* diagnosed (28 complaints surface
  in the operations domain score) but the control center has no complaint channel; elevating it (and
  cautioning aggressive marketing until a recovery action exists) needs a new threshold/signal — training
  scope (`owner-control-center.ts` inputs).
- **Defect 4 — owner workload reduction 0** (`handledByOpsIQ: 0`, `approvalsAvoided: 0`). OpsIQ auto-handles an
  approval only via a standing instruction / approval memory; "prepare an item" (draft recovery checklist /
  reassessment reminder) is new automation behavior — training scope.

## 7. May behavioral validation now start?
**Yes.** Both clearly-scoped product defects (the critical 500 and the CLAUDE.md adaptive-cadence violation)
are fixed and CI-proven. The remaining gaps (D2/D3/D4) are precisely the guidance-quality items behavioral
validation/training is meant to develop, with their exact wiring points identified above.

## 8. Is this still pre-training?
**Yes.** No model training and no tuning of recommendation/scoring content occurred. The changes are a
database-column type fix and a deterministic, rule-mandated adaptive cadence — infrastructure/condition
wiring, not advice generation. The original baseline report and rubric are unchanged.

## Comparison protocol used
Same scenario (`seed-baseline-laundry.ts`), same spec (`owner-realistic-baseline.spec.ts`), same rubric
(§20 of the pre-training report). Artifacts: pre-training `28347587097`; post-hardening `28348545590`
(structured extract: `artifacts/post-hardening-baseline/laundry-kolkata-posthardening.summary.json`).
