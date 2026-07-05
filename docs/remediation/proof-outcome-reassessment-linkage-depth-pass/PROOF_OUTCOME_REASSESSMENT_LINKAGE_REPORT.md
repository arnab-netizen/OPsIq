# Proof ↔ Outcome Linkage + Reassessment Event Creation — REPORT

**Classification:** `PROOF_OUTCOME_REASSESSMENT_LINKAGE_REAL_AND_OWNER_VISIBLE`
(+ `PROOF_TO_OUTCOME_SLO_MEASURABILITY_IMPROVED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`)
**Branch:** `claude/proof-outcome-reassessment-linkage-depth-pass` · **Base:** `origin/main` @ `26a52182`

## A. Files created
- `src/domain/owner-mode/proof-outcome-linkage.ts` — pure linkage domain (accepted→contradicted +
  rework, full link shape, honest NOT_MEASURABLE for complaint/recommendation-outcome).
- `src/services/owner-mode/proof-outcome-linkage.service.ts` — DB-backed `getProofOutcomeLinkage`
  (proof.reviewed audit trail + proofs, 90-day workspace-scoped window).
- `src/services/owner-mode/reassessment-event.service.ts` — `createReassessmentEvent` (atomic +
  audit + idempotent).
- `prisma/migrations/20260705120000_reassessment_source_proof/migration.sql`.
- `src/__tests__/owner-mode/proof-outcome-linkage.test.ts` (9 unit),
  `reassessment-event.service.test.ts` (4 unit),
  `proof-outcome-linkage-simulation.db.test.ts` (4 DB).
- The six docs in this folder.

## B. Files changed
- `prisma/schema.prisma` — `OwnerReassessmentEvent.sourceProofId String? @db.Uuid` + index.
- `src/domain/constants/audit-events.ts` — `OWNER_REASSESSMENT_CREATED`.
- `src/domain/owner-mode/evidence-credibility-graph.ts` — consume per-submitter contradictions →
  `ACCEPTED_PROOF_WITH_BAD_OUTCOME`; caveat/strengthen `RELIABLE_SUBMITTER_PATTERN`.
- `src/domain/owner-mode/business-control-slo.ts` — new `PROOF_OUTCOME_INTEGRITY` SLO.
- `src/services/owner-guidance/owner-now-view.service.ts` — optional `proofOutcome` dep; feed
  contradictions into credibility + the SLO; `proofOutcomeLinkage` on the payload.
- `src/__tests__/owner-mode/business-control-slo.test.ts`, `evidence-credibility-graph.test.ts` —
  new cases.
- `docs/CURRENT_OPSIQ_STATUS.md`.

## C. Schema changes
One additive, backfill-safe, non-destructive column: `owner_reassessment_events.sourceProofId UUID`
(nullable) + `(workspaceId, sourceProofId)` index. Existing rows stay NULL. No drop/type change.

## D. Backend logic
- Contradiction: from the `proof.reviewed` audit trail, a `fromStatus=ACCEPTED → {DISPUTED,
  OVERRIDDEN_NOT_VERIFIED}` transition is a LINKED bad-result link; latency = contradiction
  `occurredAt` − ACCEPTED `occurredAt`; attributed to the submitter.
- Rework: `Proof.resubmissionOfId` → a keyed rework link.
- Reassessment creation: atomic row + `OWNER_REASSESSMENT_CREATED` audit, idempotent by open
  (workspace, trigger, source) key, keyed to `sourceProofId` / `outcomeId`.

## E. Frontend logic
None (server/domain pass). Surfaced verbatim on `/api/owner/now-view` (`proofOutcomeLinkage`,
`businessControlHealth.PROOF_OUTCOME_INTEGRITY`, `topCredibilityConcern`).

## F. Acceptance criteria
- [x] accepted proof links to a later bad result (contradiction) — real, keyed, DB-backed.
- [x] credibility graph consumes the linkage (`ACCEPTED_PROOF_WITH_BAD_OUTCOME`, reliable caveat).
- [x] business-control SLO consumes it (`PROOF_OUTCOME_INTEGRITY`, measured).
- [x] reassessment created through a real app service, keyed + idempotent + audited.
- [x] owner-visible via the now-view.
- [x] tests pass; realistic simulation passes.
- [x] honest missing-data (complaint/recommendation-outcome NOT_MEASURABLE with exact model).
- [x] cross-workspace isolation tested; no fake outcomes/timestamps.

## G. Known limitations
- `PROOF_TO_COMPLAINT_LINK` stays NOT_MEASURABLE — no per-event/per-proof complaint model
  (`ownerMetricSnapshot` is period-aggregate only).
- `PROOF_TO_OUTCOME_LINK` (recommendation/action `OwnerActionOutcome`) stays NOT_MEASURABLE —
  disjoint entity trees, no join key.
- No app path yet *produces* an ACCEPTED→DISPUTED transition in normal flow, so on live data the
  contradiction link is honestly NOT_MEASURABLE until a dispute/override surface uses it; the
  capability reads real data and the simulation proves it end-to-end.
- `OwnerReassessmentEvent.workspaceId` references the owner-mode ClientAccount id (owner-mode
  convention) — callers must pass an owner workspace that resolves to that account.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
proof accept → `proof.reviewed(ACCEPTED)`; later dispute/override → `proof.reviewed(→DISPUTED/
OVERRIDDEN)` = contradiction. Contradiction / bad outcome → `createReassessmentEvent` →
`OWNER_REASSESSMENT_CREATED` + reassessment row (keyed by `sourceProofId`/`outcomeId`). Now-view
read → linkage + credibility + integrity SLO.

## J. Failure modes covered
No accepted proof (NOT_MEASURABLE), accepted-never-reversed (PASS, no fake failure), DISPUTED not
from ACCEPTED (not counted), duplicate reassessment trigger (idempotent reuse), missing predecessor
(MISSING_SOURCE), cross-workspace bleed (isolated), absent optional table (P2021 → empty).

## K. Events emitted
New: `owner.reassessment_created`. Reused: `proof.reviewed` (read-only, as the linkage source).

## L. Automated tests added
9 linkage unit + 4 reassessment-service unit + 3 SLO cases + 2 credibility cases + 4 DB simulation
scenarios = **22 new tests**.
