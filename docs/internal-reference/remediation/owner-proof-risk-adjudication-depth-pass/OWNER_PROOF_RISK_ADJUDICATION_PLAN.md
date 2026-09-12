# Owner Proof-Risk Adjudication Surface — PLAN

## Objective
Give the owner/authorized reviewer a **governed, audited, fair** way to decide what to do with a
flagged reused/fake/suspicious proof finding — **without** unfair accusations, hidden scores, or
unaudited state changes. It records a decision about the FINDING; it is **not** HR discipline tooling
and never rewrites proof status (that stays in the governed dispute flow).

## Adjudication outcomes (7)
`REQUIRE_FRESH_PROOF`, `ACCEPT_AS_VALID`, `DISMISS_FALSE_POSITIVE`, `CONFIRM_SUSPICIOUS_PATTERN`,
`ESCALATE_FOR_TRAINING`, `ESCALATE_FOR_OWNER_REVIEW`, `MARK_INCONCLUSIVE_NEEDS_DATA`.

## Adjudicatable source types (4)
`REUSED_HASH_FINDING`, `ANTI_GAMING_SIGNAL`, `CREDIBILITY_CONCERN`, `PROOF_DISPUTE`.

## Schema (minimal, additive)
New `proof_risk_adjudications` table: `id`, `workspaceId`, `idempotencyKey` (unique per workspace),
`sourceType`, `sourceRef`, `proofIds[]`, `actorIds[]`, `adjudicatedByUserId`, `adjudicatedByRole`,
`outcome`, `reason`, `ownerActionRequired`, `recommendedNextAction`, `status`, timestamps. Migration
`20260705160000_proof_risk_adjudication` — additive, backfill-safe, non-destructive.

## Domain (`proof-risk-adjudication.ts`, pure)
`planAdjudication` fail-closed: outcome + sourceRef + a reason are always required; the reason may not
assert fraud/theft. Per-outcome effect map → `status` / `ownerActionRequired` / `keepsRisk` /
`triggersReassessment` / `recommendedNextAction`. `clearsFinding()` marks the noise-reducing outcomes
(accept / dismiss / training).

## Service + API
- `adjudicateProofRiskFinding` — workspace-scoped, authorization-gated (`PROOF_REVIEW_LOW_RISK`),
  proofIds verified in-workspace, atomic record + audit (`proof_risk.adjudicated`), idempotent on
  `(workspaceId, idempotencyKey)` (identical resubmit = no-op; changed outcome = governed update +
  fresh audit). REQUIRE_FRESH_PROOF / CONFIRM_SUSPICIOUS_PATTERN maintain a governed reassessment.
- `getProofRiskAdjudications` — owner-visible read.
- `POST /api/proof-risk/adjudicate` — canonical enforcement + sanitized errors.

## Adjudication effects (conservative)
- REQUIRE_FRESH_PROOF → risk stays active, owner action required, reassessment maintained.
- ACCEPT_AS_VALID / DISMISS_FALSE_POSITIVE → CLEARED (finding suppressed from re-surfacing), evidence
  + audit retained.
- CONFIRM_SUSPICIOUS_PATTERN → risk stays (CONFIRMED), owner action required, no fraud language.
- ESCALATE_FOR_TRAINING → training/process recommendation (not punishment), cleared from live risk.
- ESCALATE_FOR_OWNER_REVIEW → owner action required.
- MARK_INCONCLUSIVE_NEEDS_DATA → conservative status kept; missing data noted.

## Integration
Owner Now View exposes a `proofRiskAdjudications` block; a CLEARING decision suppresses the reused-hash
finding from re-surfacing (and from the anti-gaming/credibility feed) so owner noise drops — while
CONFIRM / REQUIRE_FRESH keep the finding visible, so `ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK`
stay elevated until resolved. No evidence deleted; no proof status rewritten.

## Out of scope
Full Process Intelligence; public SaaS / Product Hunt / billing; broad HR discipline tooling;
payroll/termination recommendations; hidden staff scores; UI redesign.
