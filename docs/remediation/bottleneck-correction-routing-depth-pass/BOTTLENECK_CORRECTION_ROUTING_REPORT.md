# Bottleneck → Correction Routing — REPORT

## A. Files created
- `src/domain/owner-mode/bottleneck-correction-routing.ts` — pure routing (9 correction types, 22-field
  shape, routing rules, approval escalation, governance).
- `src/__tests__/owner-mode/bottleneck-correction-routing.test.ts` — 15 domain tests.
- `src/__tests__/components/process-corrections-panel.test.tsx` — 4 component tests.
- `src/__tests__/execution/bottleneck-correction-routing-simulation.db.test.ts` — real-business laundry
  DB simulation (2 cases: routed corrections + clean-workspace DATA_INSUFFICIENT/isolation).
- `docs/remediation/bottleneck-correction-routing-depth-pass/` — this pack (6 docs).

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `processCorrections` block on the payload +
  interface field, derived from `processIntelligence`.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `ProcessCorrectionsPanel` component + views.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — render the corrections under the panel.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — assert the corrections render.
- `tests/browser/44-owner-process-intelligence.spec.ts` — browser assertion for the corrections panel.

## C. Schema changes
**None.** Corrections are a pure derivation over the existing `processIntelligence` findings. The pass
rule ("add minimal additive schema only if status tracking is needed") does not trigger: a proposal
surface needs no persisted lifecycle, so nothing is migrated (backfill-safe).

## D. Backend logic implemented
`buildProcessCorrections(analysis, workspaceId)` — pure + deterministic. Routes each finding to its
correction specs (primary + guarded secondaries), copies evidence + real targets, computes the required
approval as the stronger of finding-approval and correction-floor, marks `requiresOwnerApproval` /
`autoExecutable`, assigns a contiguous `priorityRank` (severity-first, owner-gated above manager within a
severity, DATA_INSUFFICIENT last), and returns `{ corrections, topCorrection, evaluatedAt }`. Wired into
`getOwnerNowView` as `processCorrections` (null on the fake-DI path).

## E. Frontend logic implemented
`ProcessCorrectionsPanel` (prop-driven; no business logic) renders each proposed correction with its
type, instruction, PROPOSED status, priority, target, and required-approval marker; honest empty state;
a standing note that corrections are proposals and nothing is applied automatically. Surfaced on the
Pass-1 `/owner/process-intelligence` page under "What to do about it".

## F. Acceptance criteria checklist
- [x] All 9 correction types implemented and reachable (domain test 15).
- [x] 22-field correction shape.
- [x] Routing rule for every one of the 10 process finding types.
- [x] `processCorrections` on the Owner Now View payload, derived from `processIntelligence`.
- [x] Owner-visible corrections surface (page + component), browser-asserted.
- [x] Every correction PROPOSED; only the no-op is auto-executable; owner approval never hidden.
- [x] Approval can only escalate (test 12); no fabricated assignments (test 13).
- [x] 15 domain + 4 component + 2 page + laundry DB simulation; tsc 0; governance 31/0; lint ratchet clean.

## G. Known limitations
- Corrections are **proposals** (no persisted approval/lifecycle state) — matches the pass's "prefer
  derived/proposed" rule; a tracked approval workflow is explicitly a later pass.
- Each finding routes a small fixed set of corrections (primary + guarded secondaries), not an open list.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md` and `BROWSER_WALKTHROUGH.md`.

## I. Trigger map
Process Intelligence finding (already adjudication-suppressed) → routing rule → proposed correction(s) →
`processCorrections` on the now-view → `/owner/process-intelligence` "What to do about it".

## J. Failure modes covered
No finding → empty corrections. DATA_INSUFFICIENT → COLLECT_MISSING_DATA or NO_ACTION. No events →
no RESOLVE_OPERATIONAL_EVENT. No actor → no ASSIGN_TRAINING_REVIEW; target stays null (never fabricated).
Cleared adjudication (suppressed upstream) → no correction. Cross-workspace isolation preserved.

## K. Events emitted
None — this is a read-model derivation on the now-view read path (consistent with `processIntelligence`,
which also emits no events). No mutation occurs, so no audit event is required.

## L. Automated tests added
15 domain + 4 component + 2 page (jsdom) + 2 laundry DB-simulation cases + 1 browser assertion.

## Classification
`BOTTLENECK_CORRECTION_ROUTING_REAL_AND_OWNER_VISIBLE` — real derivation from the trusted chain, surfaced
on a real owner page (browser-asserted in the `owner-pilot-e2e` lane), governance-safe (proposals only,
approval never weakened, no fabricated targets, no prohibited labels).
