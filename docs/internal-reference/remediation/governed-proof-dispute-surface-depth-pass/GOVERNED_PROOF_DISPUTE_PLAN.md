# Governed Proof Dispute / Override Surface — PLAN

**Branch:** `claude/governed-proof-dispute-surface-depth-pass`
**Base:** `origin/main` @ `ab4d1baa` (Proof↔Outcome Linkage, PR #114, merged).

## Objective
Build the minimum safe governed live flow so an owner or authorized reviewer can dispute a
previously-ACCEPTED proof when later reality contradicts it — creating the contradiction, triggering
reassessment, updating credibility/SLOs, and preserving atomic audit. This is the live *writer* for
the ACCEPTED→DISPUTED contradiction whose *reader* (Proof↔Outcome Linkage) shipped in PR #114.

## The key reuse (no orphan path)
The dispute writes a `proof.reviewed(fromStatus=ACCEPTED → DISPUTED)` audit — exactly the record the
Proof↔Outcome Linkage service already consumes. So credibility (`ACCEPTED_PROOF_WITH_BAD_OUTCOME`),
the `PROOF_OUTCOME_INTEGRITY` SLO, and the Owner Now View update automatically on the next read. No
new integration wiring, no orphan service.

## No new schema (minimal)
The dispute reuses existing fields (`Proof.status`, `reviewedByUserId`, `reviewedAt`, `reviewReason`)
and captures the full governed dispute record as a `proof.disputed` audit event payload — the
persisted, queryable dispute record. Only additive code: the `proof.disputed` audit constant. No
migration; the category is governed metadata, never a faked CustomerComplaint/Rework row.

## Layering
1. `src/domain/execution/proof-dispute.ts` — pure: 8 categories, category→reassessment-trigger map,
   request validation (reason + category required; owner-only override), target status, record shape.
2. `src/services/execution/proof-dispute.service.ts` — `disputeAcceptedProof`: server-authoritative
   load, status/SoD checks, atomic transition + dual audit, `createReassessmentEvent`, idempotent.
3. `src/app/api/proof/dispute/route.ts` — canonical enforcement + `requirePermission` (PROOF_REVIEW,
   or owner-only VERIFY_FINAL_OUTCOME for override) + server-resolved actor + sanitized errors.

## Dispute categories → reassessment trigger
CUSTOMER_COMPLAINT→disputed_outcome · REWORK_REQUIRED/BAD_OUTCOME/QUALITY_FAILURE→failed_outcome ·
WRONG_OR_INSUFFICIENT_PROOF/SUSPECTED_FAKE_OR_REUSED_PROOF/MANAGER_REVIEW_ERROR→evidence_retraction ·
OTHER→new_contradicting_evidence.

## Safety (fail-closed)
Only owner/authorized reviewer (server capability gate); SoD blocks disputing your own proof; wrong
workspace / missing proof / missing reason / missing category all fail closed; ACCEPTED-only; a
repeated dispute is an idempotent no-op; the reversal + both audits are one transaction (AUDIT-01);
the reassessment is idempotent, keyed to the proof (`sourceProofId`). No client-supplied role,
workspace, status, or risk level is trusted.

## Honest limits
No per-event complaint/rework model exists — `relatedComplaintId`/`relatedReworkId` are recorded as
missing-source, never faked. Owner-only override (→OVERRIDDEN_NOT_VERIFIED) requires the non-delegable
VERIFY_FINAL_OUTCOME permission. No UI redesign; the owner-callable route + service is the surface.
