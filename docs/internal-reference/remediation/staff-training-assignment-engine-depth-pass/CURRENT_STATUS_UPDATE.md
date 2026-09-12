# Staff Training Assignment Engine — STATUS UPDATE

**Status:** implemented, locally green, CI-gated (opened after Pass 1 merged).

## What shipped
Process/correction findings now become governed, evidence-backed training/review recommendations on the
Owner Now View (`trainingAssignments`) and the `/owner/process-intelligence` page ("Training & review").
Seven training types, an 18-field shape, a success metric + review cadence per recommendation, a linked
SOP-correction key, and an owner-visible panel.

## Governance posture
- Every recommendation is PROPOSED/NEEDS_DATA — never auto-assigned/auto-completed.
- assignedByRole is system-proposed; owner/manager approval explicit; targets are real ids or a role.
- Coaching/review only — no firing/payroll/discipline, no fraud/negligence labels, no hidden score.
- No schema change.

## Classification
`STAFF_TRAINING_ASSIGNMENT_ENGINE_REAL_AND_OWNER_VISIBLE`.
