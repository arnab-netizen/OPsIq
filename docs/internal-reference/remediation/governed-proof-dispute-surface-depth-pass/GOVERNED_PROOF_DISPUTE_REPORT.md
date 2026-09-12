# Governed Proof Dispute / Override Surface — REPORT

**Classification:** `GOVERNED_PROOF_DISPUTE_REAL_AND_OWNER_VISIBLE`
(+ `PROOF_OUTCOME_INTEGRITY_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`)
**Branch:** `claude/governed-proof-dispute-surface-depth-pass` · **Base:** `origin/main` @ `ab4d1baa`

## A. Files created
- `src/domain/execution/proof-dispute.ts` — pure dispute rules (categories, trigger map, validation, target status, record shape).
- `src/services/execution/proof-dispute.service.ts` — `disputeAcceptedProof` (governed, atomic, idempotent, fail-closed).
- `src/app/api/proof/dispute/route.ts` — owner-callable API (canonical enforcement + permission + sanitized errors).
- `src/__tests__/execution/proof-dispute.test.ts` (5 unit), `proof-dispute.service.test.ts` (8 unit), `proof-dispute-simulation.db.test.ts` (5 DB).
- The six docs in this folder.

## B. Files changed
- `src/domain/constants/audit-events.ts` — `PROOF_DISPUTED` constant.
- `docs/CURRENT_OPSIQ_STATUS.md`.

## C. Schema changes
**None.** The dispute reuses `Proof.status/reviewedByUserId/reviewedAt/reviewReason` and persists the
full dispute record as a `proof.disputed` audit event. No migration.

## D. Backend logic
- Validate (reason + category required; owner-only override) → plan (target status + trigger).
- Load proof server-side (workspace-scoped) → fail closed if missing.
- Idempotent no-op if already at a contradiction state; ACCEPTED-only otherwise; SoD blocks self-dispute.
- FSM authority via `planProofTransition` (OVERRIDDEN is owner-only).
- Atomic transaction: reverse proof + `proof.reviewed(ACCEPTED→target)` audit + `proof.disputed` record audit.
- Then `createReassessmentEvent` (idempotent, keyed `sourceProofId`); a reassessment failure never rolls back the committed dispute.

## E. Frontend logic
None (no UI redesign). Owner-callable via `POST /api/proof/dispute`. Owner-visible results flow through the existing now-view (`proofOutcomeLinkage`, `businessControlHealth.PROOF_OUTCOME_INTEGRITY`, `topCredibilityConcern`).

## F. Acceptance criteria
- [x] real service + API; accepted proof disputable through the live flow.
- [x] authorization + workspace checks (server-side capability gate; cross-workspace fails closed).
- [x] reason + category required (fail closed).
- [x] reassessment created/linked (idempotent, keyed to proof).
- [x] proof-outcome contradiction linkage created (via the proof.reviewed audit the reader consumes).
- [x] credibility consumes it (`ACCEPTED_PROOF_WITH_BAD_OUTCOME`).
- [x] business-control SLO consumes it (`PROOF_OUTCOME_INTEGRITY`).
- [x] owner now-view exposes the implication.
- [x] tests + realistic simulation pass; atomic audit; SoD; idempotent.
- [x] no fake complaint/rework/outcome record invented.

## G. Known limitations
- No per-event complaint/rework model — `relatedComplaintId`/`relatedReworkId` recorded as missing-source.
- No UI; owner-callable route/service only (browser E2E unchanged).
- The reassessment requires the workspace to resolve to an owner-mode ClientAccount (owner-mode convention); if absent, the dispute + linkage still stand and `reassessmentEventId` is null (reported honestly).

## H. Manual verification
```
POST /api/proof/dispute  { proofId, category, reason, override?, businessId? }
```
See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
dispute → proof ACCEPTED→DISPUTED (or owner override → OVERRIDDEN_NOT_VERIFIED) + `proof.reviewed` + `proof.disputed` audits → `createReassessmentEvent` (keyed sourceProofId) → next now-view read: linkage + credibility + PROOF_OUTCOME_INTEGRITY.

## J. Failure modes covered
Missing/blank reason, invalid category, proof not found, wrong workspace, non-accepted proof, self-dispute (SoD), repeated dispute (idempotent), lost race (safe no-op), reassessment failure (dispute stands), non-owner override (rejected), P2021 (sanitized).

## K. Events emitted
New: `proof.disputed`. Reused: `proof.reviewed` (the linkage-reader source), `owner.reassessment_created`.

## L. Automated tests added
5 domain + 8 service + 5 DB simulation = **18 new tests**.
