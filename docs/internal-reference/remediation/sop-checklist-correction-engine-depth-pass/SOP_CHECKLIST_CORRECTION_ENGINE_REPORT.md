# SOP / Checklist Correction Engine — REPORT

## A. Files created
- `src/domain/owner-mode/sop-checklist-correction-engine.ts` — pure engine (22-field draft, routing, governance).
- `src/__tests__/owner-mode/sop-checklist-correction-engine.test.ts` — 13 domain tests.
- `src/__tests__/components/sop-checklist-corrections-panel.test.tsx` — 4 component tests.
- `src/__tests__/execution/sop-checklist-correction-simulation.db.test.ts` — laundry DB simulation.
- `docs/remediation/sop-checklist-correction-engine-depth-pass/` — this pack.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `sopChecklistCorrections` block + interface.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `SopChecklistCorrectionsPanel` + views.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — render the SOP drafts.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — assert the SOP panel renders.
- `.github/workflows/db-verification.yml` — LANE_B/LANE_A run the SOP DB simulation.

## C. Schema changes
**None.** The drafts are a pure derivation over `processCorrections` + `processIntelligence`. A proposal
surface needs no persisted lifecycle, so no migration is introduced (backfill-safe).

## D. Backend logic implemented
`buildSopChecklistCorrections(analysis, routing, workspaceId)` — pure + deterministic. For each routed
correction of an applicable type it emits a governed draft (22 fields) carrying the SOP/checklist area,
the proposed change, the reason, inherited evidence + approval, a success metric, and a review cadence.
Drafts are ordered by correction priority with NEEDS_DATA last. Wired into `getOwnerNowView` as
`sopChecklistCorrections` (null on the fake-DI path).

## E. Frontend logic implemented
`SopChecklistCorrectionsPanel` (prop-driven; no business logic) renders each draft: title, area, status,
reason, evidence count, required approval, success metric, review cadence, and missing data; honest empty
state; a standing note that drafts are proposals awaiting owner/manager approval and nothing is auto-
applied. Surfaced on `/owner/process-intelligence` under "SOP & checklist changes".

## F. Acceptance criteria checklist
- [x] Draft logic exists and supports ≥4 correction situations (UPDATE_CHECKLIST, REVIEW_PROCESS_STEP,
  REQUIRE_FRESH_PROOF, COLLECT_MISSING_DATA; plus training-handoff placeholder + NEEDS_DATA no-op).
- [x] 22-field draft shape.
- [x] Owner-visible block/page integration.
- [x] Evidence links preserved; approval level clear; success metric present; review cadence present.
- [x] Training NOT built here (handoff placeholder only); no HR/discipline action; no policy change.
- [x] DATA_INSUFFICIENT → NEEDS_DATA only; clean workspace fabricates no real draft.
- [x] No fake financial impact; no fraud/negligence labels; no hidden score.
- [x] 13 domain + 4 component + 2 page tests; laundry DB simulation; tsc 0; governance 31/0; ratchet clean.

## G. Known limitations
- Drafts are proposals (no persisted approval/lifecycle) — matches the pass's "prefer derived" rule.
- One draft per applicable correction; ESCALATE_*/RESOLVE_OPERATIONAL_EVENT do not yield SOP drafts.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Classification
`SOP_CHECKLIST_CORRECTION_ENGINE_REAL_AND_OWNER_VISIBLE`.

## J. Draft correction types supported
UPDATE_CHECKLIST, REVIEW_PROCESS_STEP (incl. delivery hand-off), REQUIRE_FRESH_PROOF, COLLECT_MISSING_DATA,
ASSIGN_TRAINING_REVIEW (handoff placeholder), NO_ACTION_DATA_INSUFFICIENT (NEEDS_DATA note).

## K. Events emitted
None — read-model derivation on the now-view read path; no mutation, so no audit event required.

## L. Automated tests added
13 domain + 4 component + 2 page (jsdom) + 2 laundry DB-simulation cases.
