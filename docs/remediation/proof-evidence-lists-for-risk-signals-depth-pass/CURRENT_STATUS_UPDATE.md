# Current Status Update — Per-Proof Evidence Lists for Risk Signals

- **Base:** `origin/main` @ `9985f87f` (Adjudication Suppression Across All Sources, PR #122, merged).
- **Branch:** `claude/proof-evidence-lists-for-risk-signals-depth-pass`.
- **Classification:** `PROOF_EVIDENCE_LISTS_FOR_RISK_SIGNALS_REAL_AND_OWNER_VISIBLE`
  (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## Which signal types gained proof evidence
- **Anti-gaming**: SELF_REVIEW_ATTEMPT, MANAGER_RUBBER_STAMP, REPEATED_WEAK_PROOF, REPEATED_REJECTED_PROOF,
  REUSED_PROOF_PATTERN (dup path), LATE_COMPLETION_PATTERN, OWNER_REVIEW_BURDEN_CREATED_BY_STAFF.
- **Credibility**: SELF_REVIEW_BLOCKED_OR_ATTEMPTED, REVIEW_QUALITY_CONCERN, UNRELIABLE_SUBMITTER_PATTERN,
  REPEATED_OWNER_REVIEW_BURDEN, WEAK_PROOF_NEEDS_REVIEW (proof-type).
Each now carries `supportingProofIds` + `sourceCompleteness = COMPLETE` and is adjudication-suppressible.
**No schema change** (proof rows already carry `id`).

## Which signal types remain blocked and why
- `SUSPICIOUS_FAST_COMPLETION` — no persisted completion timestamps + expected-duration baselines → BLOCKED_BY_DATA.
- `MANAGER_IGNORES_ESCALATION` — no persisted escalation ack/resolution timing wired here → BLOCKED_BY_DATA.
- Contradiction-count-only concerns (bad-outcome/complaint/rework, attributed per submitter but not
  per-proof) stay fail-visible until per-proof linkage exists.
These stay visible with a missing-source explanation (`sourceCompleteness = BLOCKED_BY_DATA`).

## What the owner can use now
When OpsIQ flags a self-review, rubber-stamp, weak-proof, reused, or reviewer-quality risk, the now-view
shows the exact supporting proofs (count + representative refs). The owner can adjudicate it via
`POST /api/proof-risk/adjudicate` — dismiss to cut noise (suppresses exactly those proofs), or
confirm/require-fresh to keep it active; a new supporting proof re-surfaces a cleared risk.

## SLO impact
`ANTI_GAMING_RISK` / `EVIDENCE_CREDIBILITY_RISK` ease only when a proof-backed active signal is cleared
and no newer supporting proof exists; they stay FAIL/WARN on confirm or on new evidence. Fail-visible
BLOCKED_BY_DATA signals are never hidden to make an SLO pass.

## Remaining restrictions
No fraud/theft label; no hidden score; no fabricated proof IDs (absent source → BLOCKED_BY_DATA); no UI.

## Next safest implementation order
1. Persist completion timestamps / escalation acknowledgement so SUSPICIOUS_FAST_COMPLETION /
   MANAGER_IGNORES_ESCALATION can gain evidence.
2. A minimal owner UI for the adjudication queue.
3. Then Process Intelligence over the full proof → risk → adjudication chains.

## Out of scope (per instructions)
Owner UI; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff scores.
