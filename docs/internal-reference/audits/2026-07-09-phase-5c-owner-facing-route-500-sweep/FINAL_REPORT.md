# Phase 5C — owner-facing route 500 sweep (defect #1: getPolicyContext drift resilience)

**Date:** 2026-07-09
**Branch:** `claude/phase-5c-owner-facing-route-500-sweep`
**Commit subject:** `Phase 5C: harden getPolicyContext against workspace_memberships schema drift`
**Safety:** no production migration run; no production DB touched; no secrets read/changed. The exact
owner approval phrase `"I approve running the production migration."` was NOT received.

Response format per repo rules (A–L):

## A. Files created
- `src/services/__tests__/getPolicyContext-db-schema-drift.db.test.ts` — required-lane DB proof.
- `docs/audits/2026-07-09-phase-5c-owner-facing-route-500-sweep/ROUTE_500_RISK_INVENTORY.md`
- `docs/audits/2026-07-09-phase-5c-owner-facing-route-500-sweep/FINAL_REPORT.md` (this)
- `docs/audits/2026-07-09-phase-5c-owner-facing-route-500-sweep/EVIDENCE_LEDGER.json`

## B. Files changed
- `src/services/auth.ts` — `getPolicyContext`: narrowed two default-select `workspaceMembership`
  reads to only the consumed columns.

## C. Schema changes
None. No migration authored or run. The fix is purely a Prisma `select` narrowing.

## D. Backend logic implemented
`getPolicyContext` performed two membership reads with a bare/default select (reads EVERY
`workspace_memberships` column). Under production schema drift (deployed DB behind on the additive
`20260625120000_owner_mode_execution_tables`, so newer nullable columns are absent), a default-select
read throws Prisma **P2022** and unwinds as a raw 500 on every owner-facing governed route that
resolves policy. The function only consumes `workspaceId` (default-workspace derivation) and
`isActive` (membership verification), so the reads are now:
- `findFirst(... select: { workspaceId: true })`
- `findUnique(... select: { isActive: true })`

Behavior is preserved (same order, same filters, same downstream logic); auth, membership and tenant
isolation are unchanged (foreign-workspace and no-session paths still return `null`).

## E. Frontend logic implemented
None (service-layer fix).

## F. Acceptance criteria checklist
- [x] Highest-risk owner-facing default-select membership read identified via inventory (#1+#2).
- [x] Behavior-preserving narrow-select fix applied to both reads.
- [x] Required-lane DB test proves the failure class (P2022 on both bare selects) and the fix
      (real `getPolicyContext` survives the dropped column).
- [x] Fail-before/pass-after verified (reverting the source makes the end-to-end assertion fail).
- [x] Auth + tenant isolation preserved (no-session → null; foreign workspace → null).
- [x] `tsc` clean; `lint:ratchet` PASS (0 new); `governance:scan:strict` 0 new findings.
- [x] No production migration; no production DB touched; no secrets.

## G. Known limitations
- Finding #6 (`demo-permission-proof`, internal-only) remains correctly drift-classified (Phase 4);
  it is fully cleared only once the owner-approved production migration is applied — out of scope
  here and blocked on the approval phrase.
- Other owner routes call the canonical wrapper, whose membership reads (#3/#4) are already narrow
  (verified false positives — no change needed).

## H. Manual verification steps
1. Start local Postgres (port 5433, db `opsiq_test`), apply migrations (`prisma migrate deploy`).
2. `TEST_WITH_DB=true npx vitest run src/services/__tests__/getPolicyContext-db-schema-drift.db.test.ts`
   → 4 passed.
3. Regression guard: revert the two `select` additions in `src/services/auth.ts`; re-run → the
   "survives schema drift" test fails (real `getPolicyContext` throws P2022). Restore the fix.

## I. Trigger map
- Owner-facing governed route → canonical wrapper → `getPolicyContextFact` → `getPolicyContext`.
- UI role resolution → `resolveServerRole` → `getPolicyContext`.
- `requirePolicyContext` → `getPolicyContext`.
All three now survive `workspace_memberships` drift on any non-core column.

## J. Failure modes covered
- Schema drift (missing newer nullable membership column) on BOTH membership reads → no longer 500s.
- No session → `null` (unchanged).
- Membership in a foreign workspace → `null` (tenant isolation unchanged).

## K. Events emitted
None (read-only policy resolution path; no mutation).

## L. Automated tests added
- `getPolicyContext-db-schema-drift.db.test.ts` (4 tests; required-lane, real DB): no-session null,
  valid-member non-null context, foreign-workspace null, and the drift failure-class + fix proof.
