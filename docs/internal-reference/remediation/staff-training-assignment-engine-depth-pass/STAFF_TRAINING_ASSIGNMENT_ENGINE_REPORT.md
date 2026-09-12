# Staff Training Assignment Engine — REPORT

## A. Files created
- `src/domain/owner-mode/staff-training-assignment-engine.ts` — pure engine (7 training types, 18-field shape, routing, governance).
- `src/__tests__/owner-mode/staff-training-assignment-engine.test.ts` — 13 domain tests.
- `src/__tests__/components/training-assignments-panel.test.tsx` — 4 component tests.
- `src/__tests__/execution/staff-training-assignment-simulation.db.test.ts` — laundry DB simulation.
- `docs/remediation/staff-training-assignment-engine-depth-pass/` — this pack.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `trainingAssignments` block + interface.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `TrainingAssignmentsPanel` + views.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — render the training recommendations.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — assert the training panel renders.
- `.github/workflows/db-verification.yml` — LANE_B/LANE_A run the training DB simulation.

## C. Schema changes
**None.** Assignments are a pure derivation over findings + corrections + SOP drafts. A proposal surface
needs no persisted lifecycle, so no migration (backfill-safe).

## D. Backend logic implemented
`buildTrainingAssignments(analysis, routing, sop, workspaceId)` — pure + deterministic. One recommendation
per training-relevant finding (assigned to the real actor/manager id or a role — never fabricated), plus a
CHECKLIST_CHANGE_BRIEFING per real checklist SOP draft. Each carries evidence, the linked SOP correction
key, the required approval, a success metric, a review cadence, and an owner-visible explanation. Wired
into `getOwnerNowView` as `trainingAssignments` (null on the fake-DI path).

## E. Frontend logic implemented
`TrainingAssignmentsPanel` (prop-driven; no business logic) renders each recommendation: type, who
(person or team), explanation, evidence count, required approval, success metric, review cadence, and a
linked-SOP marker; honest empty state; a standing note that these are coaching/review proposals — not
discipline — and nothing is assigned automatically. Surfaced on `/owner/process-intelligence` under
"Training & review".

## F. Acceptance criteria checklist
- [x] Training logic exists; ≥5 training/review types supported (PROOF_QUALITY_REVIEW,
  PROCESS_STEP_RETRAINING, MANAGER_REVIEW_QUALITY, ESCALATION_RESPONSE_REVIEW, DELIVERY_HANDOFF_REVIEW,
  CHECKLIST_CHANGE_BRIEFING, DATA_COLLECTION_BRIEFING).
- [x] Owner-visible block/page integration.
- [x] Evidence links preserved; approval level clear; success metric present; linked SOP correction key.
- [x] No firing/payroll/discipline; no fraud/negligence labels; no hidden score.
- [x] DATA_INSUFFICIENT → NEEDS_DATA briefing only; clean workspace fabricates no operator training.
- [x] Cleared false-positive (no finding) → no training; confirmed/require-fresh may create training.
- [x] 13 domain + 4 component + 2 page tests; laundry DB simulation; tsc 0; governance 31/0; ratchet clean.

## G. Known limitations
- Recommendations are proposals (no persisted assignment/lifecycle) — matches the "prefer derived" rule.
- REVIEW_BOTTLENECK / OWNER_APPROVAL_BOTTLENECK are capacity/process issues → no training produced.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Classification
`STAFF_TRAINING_ASSIGNMENT_ENGINE_REAL_AND_OWNER_VISIBLE`.

## J. Training types supported
PROOF_QUALITY_REVIEW, PROCESS_STEP_RETRAINING, MANAGER_REVIEW_QUALITY, ESCALATION_RESPONSE_REVIEW,
DELIVERY_HANDOFF_REVIEW, CHECKLIST_CHANGE_BRIEFING, DATA_COLLECTION_BRIEFING.

## K. Events emitted
None — read-model derivation on the now-view read path; no mutation, so no audit event required.

## L. Automated tests added
13 domain + 4 component + 2 page (jsdom) + 2 laundry DB-simulation cases.
