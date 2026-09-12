# SOP / Checklist Correction Engine — STATUS UPDATE

**Status:** implemented, rebased onto latest main (after #130 merged), locally green, CI-gated.

## What shipped
Routed process corrections are now turned into governed DRAFT SOP/checklist changes on the Owner Now View
(`sopChecklistCorrections`) and the `/owner/process-intelligence` page ("SOP & checklist changes"). Six
draft situations, a 22-field draft shape, a success metric + review cadence per draft, and an owner-
visible panel.

## Governance posture
- Every draft is DRAFT/PROPOSED/NEEDS_DATA — never APPROVED, never auto-applied.
- Approval inherited from the correction (owner/manager), never weakened; owner approval shown explicitly.
- Training is NOT built here (handoff placeholder only). No HR/discipline action, no policy change.
- No fabricated evidence/amounts, no fraud/negligence labels, no hidden score. No schema change.

## Verification
- tsc 0 · governance strict 31 frozen / 0 new · lint ratchet clean.
- 13 domain + 4 component + 2 page tests green; laundry DB simulation wired into CI LANE_B/LANE_A.

## Classification
`SOP_CHECKLIST_CORRECTION_ENGINE_REAL_AND_OWNER_VISIBLE`.
