# Current Status Update — Governed Proof Dispute Surface

- **Base:** `origin/main` @ `ab4d1baa` (Proof↔Outcome Linkage, PR #114, merged).
- **Branch:** `claude/governed-proof-dispute-surface-depth-pass`.
- **Classification:** `GOVERNED_PROOF_DISPUTE_REAL_AND_OWNER_VISIBLE`.

## Live ACCEPTED → DISPUTED flow exists
Yes. `disputeAcceptedProof` service + `POST /api/proof/dispute` route: an owner or authorized reviewer
disputes a previously-accepted proof (category + reason required), which reverses the proof, writes
atomic `proof.reviewed` + `proof.disputed` audits, and creates a governed idempotent reassessment
keyed to the proof. The gap from PR #114 ("no live surface creates ACCEPTED→DISPUTED") is closed.

## What the owner can use now
`POST /api/proof/dispute { proofId, category, reason, override?, businessId? }` — dispute or (owner-only)
override accepted proof. Results appear in the now-view: `PROOF_OUTCOME_INTEGRITY` SLO, the
`ACCEPTED_PROOF_WITH_BAD_OUTCOME` credibility concern, and `proofOutcomeLinkage`.

## SLO / integration impact
- `PROOF_OUTCOME_INTEGRITY` now updates from a **live** dispute (not just seeded data).
- Credibility raises the contradiction concern for the operator whose accepted proof was reversed.
- Reassessment latency remains measurable (each dispute creates a real reassessment).

## What remains missing
- Per-event customer complaint / rework models (still period-aggregate only) — `relatedComplaintId`/
  `relatedReworkId` recorded as missing-source, never faked.
- No UI (owner-callable route/service only); browser E2E unproven.
- Anti-gaming / profit-leak / constraint linkage *by dispute category* is not yet wired (the core
  credibility + SLO path is; category-specific profit/constraint contribution is future work).

## Remaining restrictions
Dispute requires the workspace to resolve to an owner-mode ClientAccount for the reassessment (else
the dispute + linkage stand with `reassessmentEventId: null`, reported honestly).

## Next safest implementation order
1. Wire dispute category → Profit-Leak Radar (REWORK/QUALITY) and Constraint Engine (repeated QUALITY/STAFF).
2. Minimal per-event complaint linkage (the last missing proof→outcome edge).
3. Then begin Process Intelligence on these now-live, trustworthy event chains.

## Out of scope (per instructions)
Process Intelligence; public SaaS / Product Hunt / billing; broad complaint management; UI redesign.
