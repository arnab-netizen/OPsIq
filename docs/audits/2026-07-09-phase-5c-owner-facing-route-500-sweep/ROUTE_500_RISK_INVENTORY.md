# Phase 5C — owner-facing route 500 risk inventory

**Date:** 2026-07-09
**Branch:** `claude/phase-5c-owner-facing-route-500-sweep`
**Scope:** proactively sweep high-risk owner-facing API/service paths for the same latent raw-500
defect classes Phase 3 fixed reactively — invalid Prisma selects, missing `workspaceId` scope, wrong
relations, default-select membership reads (schema-drift-sensitive), unwrapped exceptions, tenant
isolation gaps. One defect (or smallest defect family) per PR.

**Safety:** no production migration run; no production DB touched; no secrets read/changed. The exact
owner phrase `"I approve running the production migration."` has NOT been received.

---

## A. Method
Static audit of owner-facing routes and the shared policy/auth resolvers they call, comparing each
`workspaceMembership` / policy read against the confirmed Phase 3/4 residual: the production database
is behind on the additive migration `20260625120000_owner_mode_execution_tables`, so any read that
default-selects EVERY `workspace_memberships` column throws Prisma **P2022** ("column ... does not
exist") and 500s — even though only one or two columns are actually consumed.

## B. Candidate findings

| # | Location | Pattern | Consumed fields | Drift-safe? | Risk |
|---|----------|---------|-----------------|-------------|------|
| 1 | `src/services/auth.ts` `getPolicyContext` L111 `findFirst` | **default select** (all columns) | `workspaceId` only | ❌ NO | **CRITICAL** |
| 2 | `src/services/auth.ts` `getPolicyContext` L124 `findUnique` | **default select** (all columns) | `isActive` only | ❌ NO | **CRITICAL** |
| 3 | `src/lib/canonical-route-enforcement.ts` L114 `resolveWorkspaceSnapshotFacts` `findFirst` | narrow `select { isActive, addedAt, workspace{name,isActive} }` | as selected | ✅ yes | none (already narrow) |
| 4 | `src/lib/canonical-route-enforcement.ts` L348 STEP 1.5 `findFirst` | narrow `select { workspaceId }` | `workspaceId` | ✅ yes | none (already narrow) |
| 5 | `src/app/api/auth/login/route.ts` membership `findFirst` | narrow `select { workspaceId }` | `workspaceId` | ✅ yes | FIXED in Phase 3 (#200) |
| 6 | `src/app/api/internal/demo-permission-proof/route.ts` | default-select membership read | classification | ⚠️ drift-classified (Phase 4) | internal-only; needs migration to fully clear |

## C. Selection rationale
Findings **#1 + #2** (`getPolicyContext`, one function, one commit family) are the highest-risk
remaining default-select membership reads:

- **Blast radius is the whole owner surface.** `getPolicyContext` is the central policy resolver.
  It is reached by the canonical route wrapper via `getPolicyContextFact`
  (`src/services/auth.ts:220`), by `resolveServerRole` (`src/services/auth/server-role.ts:32`,
  the UI role shown on owner routes), and by `requirePolicyContext` (`src/services/auth.ts:167`).
  Under production drift, EVERY owner-facing governed route that resolves policy 500s — strictly
  broader than the internal-only `demo-permission-proof` endpoint (#6).
- **Exact Phase 3 defect class.** Identical to the login `membership_lookup_failed` 500 (#5) that
  Phase 3 Item 3 fixed: a bare/default membership select that only needs `workspaceId` / `isActive`.
- **Behavior-preserving fix.** Only `membership.workspaceId` (L117) and `membership.isActive` (L128)
  are consumed; narrowing the selects changes no behavior and no auth/tenant semantics.
- Findings #3/#4/#5 are already narrow (false positives — verified, no change needed). #6 is
  internal-only and is fully cleared only once the owner-approved migration is applied (Phase 4).

**Decision:** fix #1 + #2 in this PR (single function, one defect family). No other CRITICAL/HIGH
raw-500 default-select membership read remains on the owner-facing governed path after this fix.

## D. Fix applied
`getPolicyContext` (`src/services/auth.ts`):
- L111 `findFirst` → add `select: { workspaceId: true }`.
- L124 `findUnique` → add `select: { isActive: true }`.

## E. Proof
`src/services/__tests__/getPolicyContext-db-schema-drift.db.test.ts` (required-lane, real DB, no DB
mocks; `next/headers` cookies mocked only to supply the session token):
1. Normal: real `getPolicyContext` resolves a non-null context; returns null with no session and for a
   foreign workspace (auth + tenant isolation preserved).
2. Failure class: under a genuinely dropped `primary_auth_method` column, the OLD bare-select
   `findFirst` AND `findUnique` both throw P2022 (the exact production trigger).
3. Fix: the REAL `getPolicyContext` still resolves a valid context under the same dropped column (no
   500). Verified fail-before/pass-after: reverting the source fix makes assertion (3) fail.

## F. Stop condition
Per the Phase 5C spec, stop after the highest-risk defect family is fixed and proven when no
CRITICAL/HIGH raw-500 default-select membership read remains on the owner-facing governed path. After
this fix, findings #3–#5 are already narrow and #6 is internal-only/migration-gated — no further
CRITICAL/HIGH owner-facing raw-500 select defect remains. **One defect family fixed; sweep complete.**
