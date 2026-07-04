# OpsIQ Runtime-Readiness — P4-C (M2) Decision Transition TOCTOU + FSM Correctness Report

> Fixes **M2**: the governed decision lifecycle transition (`transitionDecisionState`) had a
> read-then-write **TOCTOU race** — it validated against a status it READ, then `update({ where: { id } })`
> with no status guard, so two concurrent transitions both validated against the same state and the second
> silently clobbered the first. While DB-proving the guard, a second, more severe pre-existing defect
> surfaced: the update wrote **columns that do not exist** (`lastUpdatedBy`, `submittedAt`, `approvedAt`),
> so **every** transition threw `PrismaClientValidationError` — the entire governed decision FSM
> (approve/reject/cancel/execute/close/fail) was dead. Both are fixed here; the transition now works and is
> concurrency-safe. No schema change; no gate weakened; no test deleted.

## The gap (M2)
`transitionDecisionState(decisionId, workspaceId, toState, …)`:
1. `findFirst` → reads `decision.status`; maps to `fromState`.
2. `requireTransitionAllowed(fromState, toState, …)` — validates against that **read**.
3. `db.operatorItem.update({ where: { id: decisionId }, data: updateData })` — writes by **id only**, no
   status guard, no workspace scoping.

Two concurrent transitions (e.g. approve + reject) both pass step 2 from the same `fromState`; both write in
step 3; the later write clobbers the earlier — a governed record silently overwritten (approval replaced by a
reject, or a double-execute).

## Pre-existing FSM breakage found while proving the fix
`updateData` (applied on every transition) set:
- `lastUpdatedBy` — the real column is `lastUpdatedByUserId`;
- `submittedAt` (SUBMITTED) and `approvedAt` (APPROVED) — **no such columns** on `OperatorItem`.

`lastUpdatedBy` is set unconditionally, so **every** `transitionDecisionState` call threw
`PrismaClientValidationError`. The route-wired operations that flow through it
(`/decisions/[id]/{execute,close,fail,record-outcome}`, approve/reject/cancel) were therefore non-functional.
It survived because **no test exercised the FSM transition path** (the only test now is this slice's).

## The fix
1. **Correctness** — write only real columns: `lastUpdatedBy` → `lastUpdatedByUserId`; dropped the
   non-existent `submittedAt`/`approvedAt` writes (SUBMITTED/APPROVED have no dedicated timestamp column).
   `startedAt`/`completedAt`/`executionStatus`/`blockReason` (real columns) are unchanged.
2. **Concurrency safety (M2)** — the write is now
   `updateMany({ where: { id: decisionId, workspaceId, status: <read status> }, data: updateData })` with a
   `count === 1` assertion. A racing transition that already moved the row yields `count === 0` and is
   rejected with a `ValidationError` ("modified concurrently") instead of clobbering. The guard also adds the
   missing `workspaceId` scoping to the write.

The return value now derives from the intended `newStatus` (`updateData.status`) and `decisionId` (unchanged
values; `updateMany` returns no row).

## Files changed
- CHANGED `src/services/decisions/decision-lifecycle.service.ts` (`transitionDecisionState`: valid-column
  writes + `updateMany` status guard + count assert)
- NEW `src/__tests__/decisions/decision-transition-toctou.db.test.ts` (3 DB proofs)
- NEW `OPSIQ_RUNTIME_READINESS_P4C_M2_DECISION_TRANSITION_TOCTOU_REPORT.md`

## DB / migration changes
**None.** No schema change — the fix removes writes to non-existent columns and guards the existing write.
**API:** `transitionDecisionState` now succeeds (previously always threw); on a lost race it returns a 400-class
`ValidationError` instead of silently overwriting. **UI:** none.

## Tests / checks run (local, Postgres 16)
- `tsc --noEmit` ✓.
- `lint:ratchet` **PASS** — errors unchanged at **2086**; `changed_file_lint_errors: 0` (the pre-existing
  `any`/unused findings in the file are untouched, baseline-frozen).
- **Governance scan**: **0 new**. **Auth route scanner**: n/a (service change).
- **New DB proof (3 tests)** driving the real `transitionDecisionState`:
  1. **6 concurrent identical** `APPROVED` transitions → **exactly one succeeds**, the other 5 are rejected;
     final status `approved` (without the guard all 6 would have "succeeded");
  2. **concurrent divergent** approve-vs-reject → exactly one winner, final status equals the winner's — **no
     clobber**;
  3. a **stale** transition whose validated-from status no longer matches is rejected, leaving the decision
     untouched.
- **No-regression: 90 passed** (`src/__tests__/decisions/**` + `api/decisions`).

## Blast-radius assessment
Before this change every `transitionDecisionState` call threw, so no passing path depended on its success;
the fix can only turn a throwing operation into a working, guarded one. The decisions no-regression suite
confirms nothing relied on the previous throw. The full CI corpus is the final confirmation.

## Honest scope
- Fixes the central FSM transition (`transitionDecisionState`) used by submit/approve/reject/cancel/execute/
  close/fail. Two sibling governed-transition services with the same **TOCTOU** pattern —
  `decision-validation/decision-acceptance.service.ts` (`/accept`, `/reject`) and the unused
  `decision/status-management.ts` `changeDecisionStatus` — are **not** touched here; recommended as focused
  follow-ups.
- Does not touch the schema-blocked broken CRUD services (`client-contact`/`user`/`lead`).

## Classification
**`P4_M2_DECISION_TRANSITION_GUARDED`** (tsc + governance + ratchet + 3 concurrency DB proofs + 90
no-regression): the governed decision lifecycle transition now executes with valid columns and is
concurrency-safe via a status-guarded `updateMany` + count assertion.

## Merge recommendation
Open PR; drive CI green. Public SaaS / billing / launch / integrations remain out of scope and blocked.
