# Current Status Update — Proof ↔ Outcome Linkage + Reassessment Creation

- **Base:** `origin/main` @ `26a52182` (Runtime Control Correlation, PR #113, merged).
- **Branch:** `claude/proof-outcome-reassessment-linkage-depth-pass`.
- **Classification:** `PROOF_OUTCOME_REASSESSMENT_LINKAGE_REAL_AND_OWNER_VISIBLE`.

## Linkages now real + measured
- `PROOF_TO_BAD_RESULT_LINK` — accepted proof → later DISPUTED/OVERRIDDEN (from `proof.reviewed` audit trail).
- `PROOF_TO_REWORK_LINK` — proof → its resubmission (`resubmissionOfId`).
- `OUTCOME_TO_REASSESSMENT_LINK` — via the new reassessment-event creation service (`sourceProofId`/`outcomeId`).

## Credibility strengthened
- `ACCEPTED_PROOF_WITH_BAD_OUTCOME` now fires from real contradictions.
- A contradicted submitter is no longer `RELIABLE_SUBMITTER_PATTERN`; a checked-clean submitter is HIGH-confidence reliable.

## SLOs
- **Became measurable:** `PROOF_OUTCOME_INTEGRITY` (was absent/NOT_MEASURABLE) — PASS/WARN/FAIL from the contradiction rate. `REASSESSMENT_LATENCY` gains real events to measure via the creation service.
- **Still NOT_MEASURABLE:** `PROOF_TO_COMPLAINT_LINK` (period-aggregate complaints only); `PROOF_TO_OUTCOME_LINK` to recommendation/action `OwnerActionOutcome` (disjoint trees); audit durability for non-shock classes; runtime cross-workspace isolation metering; startup completeness.

## New capability persisted
- `OwnerReassessmentEvent.sourceProofId` (backfill-safe column + index) — proof→reassessment is queryable.
- App service `createReassessmentEvent` (atomic + audited + idempotent) — the previously-missing reassessment creation path.

## Missing source data (still)
- Per-event customer complaint records; a persisted proof↔recommendation-outcome join key.

## Verification
tsc 0 · prisma valid · governance strict 0-new · changed-area 89 files/734 tests green · 22 new tests.

## Next safest depth pass
Wire a governed proof-dispute/override surface (so ACCEPTED→DISPUTED is produced in live flow, not
only readable), then a minimal per-event complaint linkage — the last missing proof→outcome edge —
before starting Process Intelligence on these now-trustworthy event chains.

## Out of scope (per instructions)
Process Intelligence; public SaaS / Product Hunt / billing; broad report cleanup; authenticated browser E2E.
