# Per-Proof Evidence Lists for Remaining Gaming / Credibility Signals — PLAN

## Objective
Attach per-proof evidence lists to the anti-gaming and credibility signals that currently **fail
visible** because they lack proof IDs — so owner adjudication can fairly suppress or confirm the exact
source evidence, and a new supporting proof re-surfaces the risk.

OpsIQ answers: *"Which exact proof records support this anti-gaming or credibility signal?"*

## Signal families upgraded (where proof-level data exists)
- **Anti-gaming**: `SELF_REVIEW_ATTEMPT`, `MANAGER_RUBBER_STAMP`, `REPEATED_WEAK_PROOF`,
  `REPEATED_REJECTED_PROOF`, `REUSED_PROOF_PATTERN` (duplicate-flag path), `LATE_COMPLETION_PATTERN`,
  `OWNER_REVIEW_BURDEN_CREATED_BY_STAFF` (plus the fake/tamper/manager/reused branches already carrying IDs).
- **Credibility**: `SELF_REVIEW_BLOCKED_OR_ATTEMPTED`, `REVIEW_QUALITY_CONCERN`,
  `UNRELIABLE_SUBMITTER_PATTERN`, `REPEATED_OWNER_REVIEW_BURDEN`, `WEAK_PROOF_NEEDS_REVIEW` (proof-type).

## Signal evidence shape (added)
- `supportingProofIds` — the exact proofs backing the signal (already the suppression key).
- `sourceCompleteness` — `COMPLETE` (proof IDs identify the basis; adjudication-suppressible),
  `PARTIAL`, or `BLOCKED_BY_DATA` (no persisted proof-level source → fail-visible with a missing-source
  note; never suppressed).
- `evidence` strings include representative `proof refs` (concise, not a raw dump).

## Approach
- Add proof-id arrays to the aggregation stats (`ActorProofStats` / `ReviewerStats` for anti-gaming,
  `SubmitterCredStats` / `ReviewerCredStats` / `ProofTypeCredStats` for credibility).
- `aggregateProofEvents` / `aggregateCredibility` collect the proof IDs per category (the proof rows
  already carry `id` on the live path — no schema change).
- Each signal branch attaches its ids via a `withEvidence(ids)` helper: present → COMPLETE + ids;
  absent → BLOCKED_BY_DATA + missing-source note. **No fabricated proof IDs.**

## Blocked-by-data (honest, unchanged)
- `SUSPICIOUS_FAST_COMPLETION` — needs persisted completion timestamps + expected-duration baselines
  (not persisted) → BLOCKED_BY_DATA (signal not emitted).
- `MANAGER_IGNORES_ESCALATION` — needs persisted escalation acknowledgement/resolution timing (not
  wired to this signal) → BLOCKED_BY_DATA (signal not emitted).
- Aggregate concerns with no per-proof basis (e.g. contradiction-count-only) stay fail-visible.

## Adjudication + now-view
Because the signals now carry `supportingProofIds`, the existing per-source adjudication suppression
(previous pass) applies unchanged: clearing suppresses the exact evidence set; a new supporting proof
re-surfaces it; confirm/require-fresh/training stay visible. The now-view exposes the supporting proof
count + representative refs + `sourceCompleteness`.

## Out of scope
Owner UI; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff scores.
