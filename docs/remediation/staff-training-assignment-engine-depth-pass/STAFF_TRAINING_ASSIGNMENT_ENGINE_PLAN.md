# Staff Training Assignment Engine — PLAN

## Objective
Convert process/correction findings into governed, evidence-backed staff/manager TRAINING REVIEW
recommendations — coaching and review, never punishment. Smallest owner-usable surface; no HR tooling.

## Approach (derived, backfill-safe)
`processIntelligence`, `processCorrections`, and `sopChecklistCorrections` are already computed in
`getOwnerNowView`. A pure `buildTrainingAssignments(analysis, routing, sop, workspaceId)` proposes the
training each breakdown warrants (18-field shape). No new query, **no schema** (proposals need no
lifecycle). Surfaced as `trainingAssignments` on the now-view + a `TrainingAssignmentsPanel` on
`/owner/process-intelligence` ("Training & review").

## Routing (finding → training type)
- PROOF_QUALITY_BREAKDOWN → PROOF_QUALITY_REVIEW (operator)
- STAFF_TRAINING_GAP / REWORK_LOOP / QUALITY_FAILURE_LOOP → PROCESS_STEP_RETRAINING (operator)
- MANAGER_REVIEW_GAP → MANAGER_REVIEW_QUALITY (reviewer)
- ESCALATION_RESPONSE_BREAKDOWN → ESCALATION_RESPONSE_REVIEW (manager)
- DELIVERY_HANDOFF_DELAY → DELIVERY_HANDOFF_REVIEW (delivery team)
- DATA_INSUFFICIENT → DATA_COLLECTION_BRIEFING (NEEDS_DATA)
- each real checklist SOP draft → CHECKLIST_CHANGE_BRIEFING (staff), linked via relatedSopChecklistCorrectionKey
- cleared/dismissed (suppressed upstream → no finding) → no training; confirmed/require-fresh may create it
- REVIEW_BOTTLENECK / OWNER_APPROVAL_BOTTLENECK → no training (capacity/process)

## Governance
Every recommendation is PROPOSED/NEEDS_DATA — never auto-assigned/auto-completed. assignedByRole is
system-proposed; owner/manager approval explicit. Targets are real ids or a role — never fabricated.
No firing/payroll/discipline, no fraud/negligence labels, no hidden staff score.

## Tests
Domain (13), component (4), page (2), laundry DB simulation (wired into db-verification LANE_B/LANE_A).

## Out of scope
SOP/training effectiveness loop; External Opportunity Intelligence; public SaaS; billing; persistence.
STOP after this pass.
