# Phase 3 — Item 2: Prove `diagnoseBusiness` DB workspace isolation

**Date:** 2026-07-08
**Branch:** `claude/phase-3-diagnoseBusiness-db-workspace-isolation`
**Commit subject:** `Phase 3: prove diagnoseBusiness DB workspace isolation`
**Classification:** Coverage gap closed — required-lane real-DB proof added. **No source defect reproduced; no source fix required** (Global Rule 10). The transaction is already correctly workspace-isolated on the exercised owner path; the Phase 2 G5 report's speculated "further isolation gaps" do not exist there.

---

## A. Files created
- `src/services/__tests__/diagnoseBusiness-db-workspace-isolation.db.test.ts` — required-lane real-DB workspace-isolation proof (2 tests).
- `docs/audits/2026-07-08-phase-3-diagnoseBusiness-db-workspace-isolation/FINAL_REPORT.md` — this report.
- `docs/audits/2026-07-08-phase-3-diagnoseBusiness-db-workspace-isolation/EVIDENCE_LEDGER.json` — evidence ledger.

## B. Files changed
None. No source change was needed (see §G / Global Rule 10).

## C. Schema changes
None.

## D. Backend logic implemented
None. This item adds proof, not behavior. Investigation of `src/services/diagnosis.ts :: diagnoseBusiness` established that the transaction is already correctly workspace-isolated:

- The global tenant backstop (`src/lib/prisma-workspace-enforcement.ts`, wired via `$extends` in `src/lib/db.ts`, verified live in the test client) throws `WORKSPACE ISOLATION VIOLATION` on any `create`/`createMany` of a **workspace-owned** model whose row data omits `workspaceId`.
- The workspace-owned models `diagnoseBusiness` writes — `Engagement`, `Recommendation`, and (via `assessCondition`) `BusinessConditionProfile` / `CanonicalEvent` — **all supply `workspaceId`** already. The G5 fix corrected the `BusinessConditionProfile` case; the Engagement and Recommendation creates already carried `validatedWorkspaceId`.
- The remaining records the transaction writes — `Evidence`, `Finding`, `Action`, `ClientAccount` — are **not** workspace-owned models in the backstop set and have **no direct `workspaceId` column**; their tenancy is via `engagementId → engagement.workspaceId`, which is correct and does not require (and cannot carry) a `workspaceId` field.
- The client lookup is workspace-scoped: `db.clientAccount.findFirst({ where: { name, workspaceId: validatedWorkspaceId } })` — no cross-tenant read/reuse.

Because the backstop is fail-closed and live, the new test is a genuine **regression guard**: if a future edit drops `workspaceId` from any workspace-owned create in this path, `diagnoseBusiness` throws and the test fails.

## E. Frontend logic implemented
None.

## F. Acceptance criteria checklist
- [x] Real-DB test drives `diagnoseBusiness` through current service conventions in the required lane (`*.db.test.ts`, `TEST_WITH_DB=true`, not `*.integration.test.ts`, not quarantined).
- [x] Diagnosis creates/persists the expected records (engagement, client, condition profile, findings, evidence, recommendations, actions).
- [x] `workspaceId` supplied everywhere the tenant backstop requires it (no `WORKSPACE ISOLATION VIOLATION` thrown — proven live).
- [x] Every persisted record belongs to the correct workspace.
- [x] Cross-workspace data is neither read nor written: a second workspace diagnosing the SAME business name creates its own client (no cross-tenant reuse) and its records never leak into the first workspace.
- [x] No owner-facing 500 from missing workspace isolation.
- [x] Phase 1 diagnostic tests still pass (`diagnosis-value-path.test.ts`, `diagnosis-error-visibility.test.ts`).
- [x] Phase 2 owner-journey tests still pass (`owner-journey-smoke.db.test.ts`).
- [x] `tsc --noEmit` and `eslint` clean.

## G. Known limitations
- **No source fix was made** because the tested owner path exposed no workspace-isolation defect (Global Rule 10). The Phase 2 G5 report explicitly speculated the `diagnoseBusiness` transaction "may carry further workspace-isolation gaps of the same class"; this item drove the full transaction against a real DB with the live tenant backstop and found none on the exercised owner path — the speculation is now disproven for that path and replaced by a fail-closed regression guard.
- The test exercises the two most common `mainIssue` categories indirectly (a `high_costs` / critical-severity input driving the `cost_control` value chain). Other category branches reuse the identical create shapes in the same transaction, so the isolation invariant they rely on (the tenant backstop) is the same; a per-category sweep was out of the minimal scope for this item.
- The proof drives the `diagnoseBusiness` service directly (the exact call behind `POST /api/diagnosis`), consistent with the established repo DB-test conventions (G5, Wave-3). It does not spin up the HTTP route handler; the transaction and its isolation live entirely in the service.

## H. Manual verification steps
1. Start Postgres, `npx prisma migrate deploy`, `npx prisma generate`.
2. `TEST_WITH_DB=true npx vitest run src/services/__tests__/diagnoseBusiness-db-workspace-isolation.db.test.ts` → 2 passed (~25s; runs the real diagnosis engines + transaction twice).
3. Confirm the backstop is live: `src/lib/db.ts` applies `createWorkspaceEnforcementMiddleware()` via `$extends`; temporarily removing `workspaceId` from the `Recommendation` create in `diagnoseBusiness` makes the first test fail with `WORKSPACE ISOLATION VIOLATION: create on Recommendation requires workspaceId in data` (guard demonstration; revert).
4. `TEST_WITH_DB=true npx vitest run src/__tests__/services/diagnosis-value-path.test.ts src/services/__tests__/owner-journey-smoke.db.test.ts src/__tests__/api/diagnosis-error-visibility.test.ts` → 26 passed.

## I. Trigger map
Owner submits a business problem → `POST /api/diagnosis` → `diagnoseBusiness(input, authContext, workspaceId)` → engines (pure) → `assessCondition` (persists workspace-scoped `BusinessConditionProfile`) → `db.$transaction` (Evidence → Finding → Recommendation → Action) + audit events. All workspace-owned creates carry `workspaceId`; client lookup is workspace-scoped.

## J. Failure modes covered
- Owner-facing 500 from a workspace-owned create missing `workspaceId` in the diagnosis transaction — now guarded (fail-closed backstop + assertion that the full path returns without throwing).
- Cross-tenant client collapse (two workspaces sharing a same-named client) — asserted impossible (two distinct clients, one per workspace).
- Cross-tenant leak of engagements/recommendations across workspaces — asserted absent.

## K. Events emitted
None added. `diagnoseBusiness` already emits `FINDING_CREATED`, `RECOMMENDATION_CREATED`, `ACTION_CREATED`, and `DIAGNOSIS_COMPLETED` audit events (workspace-scoped); this item does not change them.

## L. Automated tests added
- `src/services/__tests__/diagnoseBusiness-db-workspace-isolation.db.test.ts` (2 tests), DB-backed, required `build-and-test` lane.
