# SOP / Checklist Correction Engine — PLAN

## Objective
Turn routed process corrections (Bottleneck → Correction Routing) into governed DRAFT SOP/checklist
changes that reduce repeated operational failures — the smallest owner-usable surface, no full document
management, no training engine, no policy change.

## Approach (derived, backfill-safe)
`processCorrections` is already computed inside `getOwnerNowView`. So:
1. **`buildSopChecklistCorrections(analysis, routing, workspaceId)`** — pure engine. For each correction
   of an applicable type, emit a 22-field draft (area, proposed change, reason, evidence, approval,
   success metric, review cadence, status). No new query, **no schema** (proposals need no lifecycle).
2. **Now-view** — `sopChecklistCorrections` block, null when the corrections are null.
3. **UI** — `SopChecklistCorrectionsPanel` on `/owner/process-intelligence` ("SOP & checklist changes").

## Routing rules (correction type → draft)
- UPDATE_CHECKLIST → acceptance/quality (or delivery hand-off) checklist draft.
- REVIEW_PROCESS_STEP → process-step review draft (delivery stage → hand-off checklist).
- REQUIRE_FRESH_PROOF → proof-requirement checklist draft.
- COLLECT_MISSING_DATA → data-capture checklist draft (NEEDS_DATA).
- ASSIGN_TRAINING_REVIEW → training handoff placeholder (no training assignment built here).
- NO_ACTION_DATA_INSUFFICIENT → NEEDS_DATA note only.
- ESCALATE_TO_MANAGER/OWNER, RESOLVE_OPERATIONAL_EVENT → no SOP draft (not checklist changes).

## Governance
Every draft is DRAFT/PROPOSED/NEEDS_DATA — never APPROVED, never auto-applied. Approval inherited from
the correction (owner/manager), never weakened. No HR/discipline action, no staff policy change, no
training assignment, no long SOP documents. No fabricated evidence, no fraud/negligence label, no score.

## Tests
Domain (13), component (4), page (2), laundry DB simulation (wired into db-verification LANE_B/LANE_A).

## Out of scope
Training assignment engine (Pass 2); SOP effectiveness loop; document management; persistence/approval
workflow; anything beyond a proposal surface.
