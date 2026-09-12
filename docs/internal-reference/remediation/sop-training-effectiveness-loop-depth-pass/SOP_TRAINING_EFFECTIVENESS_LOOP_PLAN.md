# SOP / Training Effectiveness Loop — PLAN

## Objective
Answer "did the correction or training work?" — the minimum effectiveness loop, no broad analytics, no LMS,
no HR discipline. Compare the targeted problem's metric before vs after the correction window.

## Approach (derived, backfill-safe)
The now-view already persists `ownerGuidanceSnapshot` history and fetches the previous snapshot. So the
baseline is the previous snapshot's metric and the current value is this snapshot's — a genuine before/after
with **no new schema**. A pure `buildEffectivenessEvaluations` computes the direction; the service's
`deriveEffectivenessItems` maps each finding-with-a-correction to its snapshot metric. Surfaced as
`sopTrainingEffectiveness` + an `EffectivenessPanel` on `/owner/process-intelligence`.

## Direction rules
- current < baseline → IMPROVED (KEEP); current > baseline → WORSENED (ESCALATE/RETRAIN); equal → UNCHANGED (MODIFY).
- no baseline / window not elapsed / below min-data threshold / correction not active → INSUFFICIENT_DATA (COLLECT_MORE_DATA).

## Governance
No improvement claimed without before/after + min-data. Proposal-only corrections are not scored as
implemented. No fake financial impact, no fraud/negligence labels, no hidden score.

## Tests
Domain (14), component (4), page (2), laundry DB simulation (wired into db-verification LANE_B/LANE_A).

## Out of scope
Owner Workload Reduction v2 (next pass); approval-threshold policy; broad analytics; LMS; persistence.
