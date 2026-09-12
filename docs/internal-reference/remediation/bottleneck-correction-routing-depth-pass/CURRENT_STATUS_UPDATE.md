# Bottleneck → Correction Routing — STATUS UPDATE

**Status:** implemented, locally green, CI-gated.

## What shipped
Process Intelligence findings are now routed into proposed, trackable **correction actions** on the
Owner Now View (`processCorrections`) and surfaced on the `/owner/process-intelligence` page under
"What to do about it". Nine governed correction types, a 22-field correction shape, a routing rule per
finding type, and an owner-visible corrections panel.

## Governance posture
- Every correction is **PROPOSED**; nothing is auto-approved. Only the `NO_ACTION_DATA_INSUFFICIENT`
  no-op is `autoExecutable`.
- Required approval is the **stronger** of the finding's approval and the correction-type floor — it can
  only escalate, never weaken, the owner/manager gate. `requiresOwnerApproval` is shown explicitly.
- No fabricated assignments (targets are real ids or null). No fraud/negligence labels. No hidden score.
- No schema change (pure derivation) → backfill-safe.

## Verification
- tsc 0 · governance strict 31 frozen / 0 new · lint ratchet clean.
- 15 domain + 4 component + 2 page (jsdom) tests green; laundry DB simulation green with a DB;
  browser corrections assertion wired into `owner-pilot-e2e`.

## Classification
`BOTTLENECK_CORRECTION_ROUTING_REAL_AND_OWNER_VISIBLE`.

## Scope stop
Per the pass constraints, work stops here: no SOP/training engine, no external opportunity intelligence,
no public SaaS, no billing.
