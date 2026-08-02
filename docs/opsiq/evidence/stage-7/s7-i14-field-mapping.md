# S7-I14 — Feedback and Learning-Loop Capture: Field Mapping Annex

**Authority:** owner decision **D-6, option (a)**, approved 2026-08-02 — *accept the
mapping; the existing schema is sufficient; no new persisted fields are required.*
**Applied in:** PR-1A (governance only — no schema change, no migration, no code change).
**Binds:** invariant S7-I14 in `docs/opsiq/bundles/factory-stage-7-closure.yaml`.

## What S7-I14 requires

> The pilot must record: whether advice was accepted; why accepted or rejected;
> execution status; actual result; owner usefulness score; accuracy score;
> missing-context feedback; and correction made if any. The system must preserve this
> feedback for future improvement without silently rewriting historical evidence.

## Mapping

All references are to `prisma/schema.prisma` on main SHA `4fe42fa8`.

| # | Required field | Bound to | Status |
|---|---|---|---|
| 1 | whether advice was accepted | `Recommendation.status`, `.approvedBy`, `.approvedAt` (:811); `OwnerApprovalRequest.status`, `.decidedById`, `.decidedAt` (:6312) | **DEDICATED COLUMN** |
| 2 | why accepted or rejected | `OwnerApprovalRequest.rationale` (:6312, `@db.Text`); `ControlledLearningRejection.rejectionReason` + `.rejectionCode` (:4567), written via `POST /api/owner/learning-rejections` | **DEDICATED COLUMN** |
| 3 | execution status | `OwnerActionOutcome.verificationStatus` (:4388); `OperatorItem.executionStatus`, `.startedAt`, `.completedAt` (:673) | **DEDICATED COLUMN** |
| 4 | actual result | `OwnerActionOutcome.afterValue`, `.absoluteChange`, `.percentageChange`, `.verificationClassification`, `.ownerReportedResult` (:4388) | **DEDICATED COLUMN** |
| 5 | owner usefulness score | *no dedicated column* — recorded as a leading `USEFULNESS: <1-5>` line in `OwnerActionOutcome.ownerReportedResult` (:4388, `@db.Text`) | **CONVENTION** |
| 6 | accuracy score | *no dedicated column* — recorded as a leading `ACCURACY: <1-5>` line in `OwnerActionOutcome.ownerReportedResult`; corroborated by `.evidenceQuality` (`strong\|moderate\|weak\|anecdotal\|none`) and `.verificationClassification` (:4388) | **CONVENTION** |
| 7 | missing-context feedback | *no dedicated column* — recorded in `OwnerActionOutcome.verificationNotes` (:4388, `@db.Text`) | **CONVENTION** |
| 8 | correction made if any | `OwnerActionOutcome.outcomeStatus = "executed_differently"`, `.sideEffects`, `.verificationNotes` (:4388); `OwnerReassessmentEvent` (:4434) | **DEDICATED COLUMN** |

**Five of eight fields bind to dedicated columns. Three (5, 6, 7) have no dedicated
column and are satisfied by the documented free-text convention above.**

## Limitation the owner accepted

Option (a) was chosen over option (b) (add `usefulness_score` and `missing_context`
columns) to avoid introducing a schema migration into a stage that otherwise requires
none. The consequence, recorded here so it is not rediscovered later:

- Fields 5, 6 and 7 are **not queryable, not typed, and not range-validated**. They are
  prose inside `@db.Text` columns.
- Aggregate analysis of usefulness or accuracy across pilot cycles is **not possible**
  without a later migration.
- An S7-I14 artifact must therefore quote the relevant free-text values verbatim in
  `raw_observation`. A structured query cannot substitute for that.

If the owner later requires trend analysis over usefulness or accuracy, that is a
follow-on schema change under a separate authorization — not a Stage 7 item.

## Non-silent-rewrite requirement

S7-I14 also requires that feedback be preserved "without silently rewriting historical
evidence." `OwnerActionOutcome` carries `createdAt` and `updatedAt` (:4388) but is not
append-only at the schema level. The S7-I14 artifact must therefore include a
**re-inspection observation**: the record read a second time, at a later timestamp,
showing the historical values unchanged. This is required by the invariant's own
`executable_evidence` clause and is not an addition to it.

## Observation recorded during mapping (not in PR-1A scope)

`POST /api/decisions/[decisionId]/record-outcome` accepts `decisionAccuracy` in its Zod
schema (`src/app/api/decisions/[decisionId]/record-outcome/route.ts`), and
`recordDecisionOutcome` spreads the request body into a Prisma update
(`src/services/decisions/decision-lifecycle.service.ts:356`,
`const updateData: any = { ...outcomeData }`). **No `decisionAccuracy` or
`decision_accuracy` column exists anywhere in `prisma/schema.prisma` or the generated
client.** A request supplying that field would reach Prisma with an unknown argument.

This is recorded as an observation only. It is a runtime concern, PR-1A is a governance
change, and no code is modified here. It is why field 6 above is bound to the free-text
convention rather than to `decisionAccuracy`.
