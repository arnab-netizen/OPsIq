# OpsIQ Runtime-Readiness — P0-A Ingestion Unblock Report

> First implementation slice of the runtime-readiness remediation. Objective: make the two previously-unwritable
> CRITICAL ingestion domains reachable by a real owner so a real business is no longer *structurally* trapped at
> `need_more_data` (blocker B1). Scope held tight per "minimum-code, one slice per PR." No gate weakened; no seed
> script used as proof; no fabricated data; no duplicate engine; no public-SaaS/billing/integration work.

## Branch & base
- Branch: `claude/runtime-readiness-p0-ingestion-unblock`
- Base HEAD: `bfa427a2` (main; post-corpus prep #77).

## What was implemented
Two enforced write routes calling the EXISTING (previously caller-less) persistence services:
- `POST/GET /api/owner/operations/businesses/[businessId]/capacity-snapshots` → `saveCapacitySnapshot`
  (`equipment_capacity` / `OwnerCapacitySnapshot`).
- `POST/GET /api/owner/operations/businesses/[businessId]/workload-snapshots` → `saveOwnerWorkloadSnapshot`
  (`owner_workload_memory` / `OwnerWorkloadSnapshot`).

Both mirror the proven owner-route pattern: `withCanonicalEnforcement`, POST=`OWNER_MANAGE`, GET=`OWNER_VIEW`,
`requireWorkspace:true`, `businessId` REQUIRED + uuid-validated in the path (so every snapshot is business-scoped and
therefore visible to the owner whole-business plan — this also closes MINOR-1, the nullable-businessId invisibility).
No service change was needed: the services already enforce workspace ownership via `assertBusinessInWorkspace`.

## Files changed
- NEW `src/app/api/owner/operations/businesses/[businessId]/capacity-snapshots/route.ts`
- NEW `src/app/api/owner/operations/businesses/[businessId]/workload-snapshots/route.ts`
- NEW `src/__tests__/api/owner/operations/capacity-workload-routes.test.ts` (route-enforcement, 6 tests)
- NEW `src/__tests__/api/owner/operations/capacity-workload-ingestion.db.test.ts` (DB integration, 6 tests)
- Updated `OPSIQ_RUNTIME_READINESS_REMEDIATION_TRACKER.md` (B1 → PR_OPEN)

## DB / migration changes
**None.** `OwnerCapacitySnapshot` and `OwnerWorkloadSnapshot` tables already exist; this slice only adds callers.

## API changes
Two additive routes (capacity-snapshots, workload-snapshots). No existing route changed.

## UI changes
**None in this slice** (deferred to P0-B). The routes are the ingestion seam; owner-facing forms + browser/mobile
proof are the next slice.

## Tests / checks run (local)
- Route enforcement (no DB): **6/6 pass**.
- DB integration (Postgres 16, `TEST_WITH_DB=true`): **6/6 pass**:
  1. baseline seeded business → all critical domains real → NOT `need_more_data`;
  2. capacity/workload writers **reject a cross-workspace business** (isolation);
  3. a clean business with no critical data → the literal `need_more_data` wall;
  4. deleting capacity+workload flips `criticalDomainsAllReal=false` and blocks any confident proceed;
  5. **writing capacity+workload via the real service path (what the routes call) restores `criticalDomainsAllReal=true`
     and leaves `need_more_data`** — the B1 unblock;
  6. written snapshots are visible only under the owning workspace.
- No-regression: `tsc --noEmit` ✓ · eslint(new files) 0/0 ✓ · lint:ratchet PASS (2155=2155) · owner-mode +
  services/owner-mode **529 tests pass** (incl. the owner-whole-business-plan DB suite) · browser/mobile lanes are
  CI-gated (unchanged).

## Honest scope note (what this slice did NOT do)
- **CSV intake materialization (B2)** — `confirmDataIntake` still does not materialize into snapshot tables. Deferred
  to **P0-B**.
- **Owner-facing UI forms + browser/mobile proof** for capacity/workload — deferred to **P0-B**.
- The other seven critical domains already had write routes; this slice only closes the two that had none.
- A correctness lesson surfaced and is encoded in the tests: when a business also has a compliance boundary, missing
  critical data resolves to `blocked` (which outranks `need_more_data`), so the literal `need_more_data` wall is
  demonstrated on a clean business — the `criticalDomainsAllReal` flip is demonstrated on the seeded one.

## Classification
**`P0_CRITICAL_DOMAIN_WRITES_READY`.**
- `equipment_capacity` and `owner_workload_memory` are now writable through real, enforced, workspace/business-scoped
  routes — **without seed scripts** — and DB-proven to move a business off the structural `need_more_data` wall.
- NOT `P0_REAL_BUSINESS_INGESTION_UNBLOCKED`: that requires CSV materialization (B2) + owner UI + browser/mobile proof,
  which are P0-B. This slice does not overclaim full ingestion unblock.

## Merge recommendation
Open PR; **do not merge** until CI is green (incl. a CI DB run of the new `.db.test.ts`) and a final hostile re-read.
Then proceed to **P0-B** (CSV materialization + intake UI + browser proof). Do not begin P1 (proof loop) until P0 is
merged or explicitly authorized. Public SaaS / billing / launch / integrations remain blocked.
