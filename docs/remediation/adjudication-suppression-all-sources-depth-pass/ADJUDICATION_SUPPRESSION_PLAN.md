# Adjudication Suppression Across All Proof-Risk Sources — PLAN

## Objective
Make owner adjudication decisions **consistently** reduce noise across all 4 proof-risk source types
without hiding confirmed or unresolved risk — and re-surface risk when NEW evidence appears.

OpsIQ answers: *"Has the owner already reviewed this proof-risk issue, and should it still appear as
an active risk?"*

## Source types covered
`REUSED_HASH_FINDING`, `ANTI_GAMING_SIGNAL`, `CREDIBILITY_CONCERN`, `PROOF_DISPUTE`.

## Core design — suppress by supporting proof IDs (per source)
Every proof-risk signal that can be adjudicated is tagged with the **proof IDs backing it**
(`supportingProofIds` on the gaming signal + credibility finding; the proofId on a reused-hash finding
/ a dispute). An adjudication clears a set of proof IDs **for its own source type only**. The now-view
suppresses a signal iff **every** supporting proof is cleared for that source — so:
- a cleared finding stops surfacing (owner noise drops),
- a **new** supporting proof (new evidence) is not in the cleared set → the risk **re-surfaces**,
- clearing one source never eases a different source.

## Clearing vs active outcomes (refined this pass)
- **Clearing** (suppress): `ACCEPT_AS_VALID`, `DISMISS_FALSE_POSITIVE`.
- **Active-risk** (stay visible): `REQUIRE_FRESH_PROOF`, `CONFIRM_SUSPICIOUS_PATTERN`,
  `ESCALATE_FOR_TRAINING`, `ESCALATE_FOR_OWNER_REVIEW`, `MARK_INCONCLUSIVE_NEEDS_DATA`.
  (Training is now an action item that stays visible — not a clearing decision.)

## Per-source behavior
- **REUSED_HASH_FINDING** — existing behavior preserved (cleared proofIds filtered from findings + the
  anti-gaming/credibility feed); a new reused proof re-surfaces.
- **ANTI_GAMING_SIGNAL** — a cleared signal is dropped from `topGamingSignal`; confirm/require-fresh
  stay; a new supporting proof re-surfaces.
- **CREDIBILITY_CONCERN** — a cleared concern is dropped from `topCredibilityConcern`; confirm/inconclusive stay.
- **PROOF_DISPUTE** — a cleared dispute is dropped from the dispute-derived profit/constraint signals
  (reduces owner-review burden), but the `proof.disputed` audit + `PROOF_OUTCOME_INTEGRITY` are
  audit-derived and **never erased** (bad proof is never marked good).

## Owner Now View
Adds a `proofRiskAdjudicationSummary` (active / cleared / inconclusive counts, latest decisions, top
active action). `topGamingSignal`, `topCredibilityConcern`, `reusedProofFindings` all respect
suppression; `businessControlHealth` (ANTI_GAMING_RISK / EVIDENCE_CREDIBILITY_RISK) eases only when the
active risk was cleared and no other evidence exists; `PROOF_OUTCOME_INTEGRITY` stays audit-derived.

## Out of scope
Owner UI; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff scores.
