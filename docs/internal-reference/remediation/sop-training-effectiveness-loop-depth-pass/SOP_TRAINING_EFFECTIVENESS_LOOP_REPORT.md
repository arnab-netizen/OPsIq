# SOP / Training Effectiveness Loop — REPORT

## A. Files created
- `src/domain/owner-mode/sop-training-effectiveness-loop.ts` — pure engine (25-field evaluation, direction logic, honest INSUFFICIENT_DATA gates).
- `src/__tests__/owner-mode/sop-training-effectiveness-loop.test.ts` — 14 domain tests.
- `src/__tests__/components/effectiveness-panel.test.tsx` — 4 component tests.
- `src/__tests__/execution/sop-training-effectiveness-simulation.db.test.ts` — laundry DB simulation (baseline → improvement → IMPROVED).
- `docs/remediation/sop-training-effectiveness-loop-depth-pass/` — this pack.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `sopTrainingEffectiveness` block + `deriveEffectivenessItems` helper + interface.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `EffectivenessPanel` + views.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — render "Did the fixes work?".
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — assert the effectiveness panel renders.
- `.github/workflows/db-verification.yml` — LANE_B/LANE_A run the effectiveness DB simulation.

## C. Schema changes
**None.** The before/after comparison reuses the already-persisted `ownerGuidanceSnapshot` history (the
service already fetches the previous snapshot). No migration (backfill-safe).

## D. Backend logic implemented
`buildEffectivenessEvaluations(items, workspaceId, at)` — pure + deterministic. For each finding with a
routed correction whose targeted problem maps to a snapshot metric (QUALITY_FAILURE_LOOP→complaints,
REWORK_LOOP→rework, PROOF_QUALITY_BREAKDOWN→overdue proof), `deriveEffectivenessItems` compares the
previous snapshot (baseline) against the current state and the engine returns IMPROVED / WORSENED /
UNCHANGED / INSUFFICIENT_DATA with a recommended next action. Honest INSUFFICIENT_DATA when there is no
baseline, the window has not elapsed, or the minimum-data threshold is not met. Wired into `getOwnerNowView`
as `sopTrainingEffectiveness`.

## E. Frontend logic implemented
`EffectivenessPanel` (prop-driven; no business logic) renders each evaluation: targeted problem, direction,
baseline→current metric, plain-language summary, recommended next action, required approval, and missing
data; honest empty + INSUFFICIENT_DATA states; a standing note that it never claims improvement without a
prior measurement and never estimates a money figure. Surfaced on `/owner/process-intelligence`.

## F. Acceptance criteria checklist
- [x] Effectiveness evaluation logic + before/after comparison exist.
- [x] Missing data handled honestly (no baseline / window not elapsed / below threshold → INSUFFICIENT_DATA).
- [x] Owner-visible block + page integration.
- [x] Recommended next action per evaluation (KEEP/MODIFY/ESCALATE/RETRAIN/COLLECT_MORE_DATA/DISMISS).
- [x] Proposal-only (not active) correction not scored as implemented.
- [x] No fake financial impact; no fraud/negligence labels; no hidden score.
- [x] 14 domain + 4 component + 2 page tests; laundry DB simulation (CI LANE_B); tsc 0; governance 31/0; ratchet clean.

## G. Known limitations
- Baseline is the previous owner-guidance snapshot; a business with only one review has no baseline (INSUFFICIENT_DATA), by design.
- Three targeted-problem metrics are wired (quality complaints, rework, weak proof) — the ones with a persisted snapshot metric.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Classification
`SOP_TRAINING_EFFECTIVENESS_LOOP_REAL_AND_OWNER_VISIBLE`.

## J. Evaluation types supported
SOP_CHECKLIST_EFFECTIVENESS, TRAINING_EFFECTIVENESS, CORRECTION_EFFECTIVENESS, DATA_INSUFFICIENT.

## K. Events emitted
None — read-model derivation on the now-view read path; no mutation, so no audit event required.

## L. Automated tests added
14 domain + 4 component + 2 page (jsdom) + 2 laundry DB-simulation cases.
