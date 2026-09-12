# Real-Business Evidence Credibility Simulation Report

**Test:** `src/__tests__/owner-mode/evidence-credibility-graph-simulation.db.test.ts` (DB-backed, no mocks).

## Scenario — "Sparkle Laundry" (multi-actor)
Owner + manager + two operators. Operator A submits 3 weak (NEEDS_HUMAN_REVIEW) + 2 reused
(duplicate-flagged) proofs; Operator B submits 5 clean manager-accepted proofs; the manager
self-reviews one item (reviewer == submitter).

## Result
- The live Owner Now View built the credibility graph and returned **`SELF_REVIEW_BLOCKED_OR_ATTEMPTED`**
  (manager) as the single highest credibility concern — reason code `SELF_REVIEW`, event evidence,
  **owner action required**, linked to the `SELF_REVIEW_ATTEMPT` anti-gaming signal, with a reassessment
  trigger. No hidden score.
- The owner-callable `getCredibilityGraph` flagged **Operator A** as `UNRELIABLE_SUBMITTER_PATTERN`
  (reason `REPEATED_WEAK_REJECTED_OR_REUSED_PROOF`) and **Operator B** as `RELIABLE_SUBMITTER_PATTERN`
  (POSITIVE) — explicitly disclosing the missing outcome/complaint↔proof linkage rather than claiming
  fully-verified reliability.
- Deterministic across two consecutive live reads.
- A clean workspace returned **`DATA_INSUFFICIENT`** and did not see the laundry's entities (isolation).

## Asserted
Top concern identified · reason codes + evidence (no black-box) · owner vs manager action ·
reliable-with-caveat honesty · reassessment trigger · owner-visible · workspace isolation · no fabricated linkage.
