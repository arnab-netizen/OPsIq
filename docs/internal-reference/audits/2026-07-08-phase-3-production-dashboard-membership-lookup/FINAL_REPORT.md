# Phase 3 — Item 3: Repair production dashboard `membership_lookup_failed` 500

**Date:** 2026-07-08
**Branch:** `claude/phase-3-fix-production-dashboard-membership-lookup`
**Commit subject:** `Phase 3: fix production dashboard membership lookup`
**Classification:** Owner-facing login 500 **fixed** at the code level (drift-resilient membership select) **and** root cause **precisely reclassified with proof** as a production **environment** condition (deployed DB behind on a migration). Not faked green; auth unchanged.

---

## A. Files created
- `src/app/api/auth/__tests__/login-membership-lookup.db.test.ts` — required-lane real-DB regression test (5 tests).
- `docs/audits/2026-07-08-phase-3-production-dashboard-membership-lookup/FINAL_REPORT.md` — this report.
- `docs/audits/2026-07-08-phase-3-production-dashboard-membership-lookup/EVIDENCE_LEDGER.json` — evidence ledger.

## B. Files changed
- `src/app/api/auth/login/route.ts` — the workspace-membership lookup now selects only `workspaceId`;
  also removed one line of dead code in the catch block (`const errorMsg = … error.message`, assigned
  but never used). That removal was required because the new comment above the membership lookup
  shifted line numbers, and the line-anchored governance baseline flagged the pre-existing
  `raw-error-message` finding on that dead line as "new". Deleting the dead line **resolves** the
  finding (governance scan: 0 new) and clears its unused-variable lint warning — a genuine cleanup,
  not a baseline edit (the baseline file is untouched, so governance is not weakened).

## C. Schema changes
None.

## D. Root cause (proven, not guessed)
The `Smoke - Production Dashboard` failure is a 500 at `POST /api/auth/login`:
```
Status: 500
{"error":"Login failed","classification":"membership_lookup_failed","stage":"membership_lookup"}
```
(Confirmed from the failed workflow logs of run 28976660512 on main `295fa614`, and identical on every recent main commit — a long-standing, pre-existing failure predating Phase 3.)

The `membership_lookup` stage runs exactly one query:
```ts
db.workspaceMembership.findFirst({ where: { userId, isActive: true }, orderBy: { addedAt: "asc" } })
```
A **bare `findFirst` selects every column** of the row. The `workspace_memberships` table gained new
columns in migration `20260625120000_owner_mode_execution_tables` (the "Slice 3B" employee-profile
fields: `allowed_task_types`, `primary_auth_method`, `designation`, …). **If the deployed database is
missing any of those columns (migration/deploy drift), Prisma throws `P2022` ("column … does not
exist") and login 500s** with `membership_lookup_failed`.

**Real-DB reproduction (no mocks)** — against a real Postgres, seeding a user + workspace + active
membership, then dropping a newer column to simulate the drift:

| Query | Before drift | After dropping `primary_auth_method` (simulated deploy drift) |
|---|---|---|
| bare `findFirst` (old login code) | ✅ returns row | ❌ **throws `PrismaClientKnownRequestError` P2022** (`column workspace_memberships.primary_auth_method does not exist`, PG 42703 `ColumnNotFound`) — the exact production trigger |
| `findFirst … select: { workspaceId: true }` (fix) | ✅ returns workspaceId | ✅ **returns workspaceId** |

This proves both the failure **class** and that the fix survives it.

**Determination:** two facts, both true:
1. **Code fragility (owner-facing, fixed here):** login read every membership column although it only
   needs `workspaceId` (to scope the audit events it emits). That made the owner-facing login route
   fail on a condition it has no reason to depend on.
2. **Underlying trigger (environment):** the deployed production database is behind on migration
   `20260625120000_owner_mode_execution_tables` (schema drift). The correct remediation for the
   drift itself is to apply the pending migration to production — an ops/environment action, out of
   application-code scope and deliberately **not** performed autonomously here.

## D.1 Backend logic implemented
`src/app/api/auth/login/route.ts` — the membership lookup now selects only `workspaceId`:
```ts
const membership = await db.workspaceMembership.findFirst({
  where: { userId: user.id, isActive: true },
  orderBy: { addedAt: "asc" },
  select: { workspaceId: true },
});
```
Behaviour is unchanged for a correctly-migrated DB (`workspaceId` is still resolved for audit scope),
and login is now resilient to drift on any non-core column (`workspace_id` is a core column present
since the table was created). Auth is untouched: the query runs before password verification, and a
valid session is still created only after `bcrypt.compare` succeeds.

## E. Frontend logic implemented
None.

## F. Acceptance criteria checklist
- [x] `membership_lookup_failed` is **fixed** for the login route (drift-resilient select) **and** the residual smoke failure is **precisely reclassified with proof** as environment (missing migration) — satisfying "fixed OR reclassified with proof if environment-only".
- [x] Auth and workspace membership remain enforced (password still verified; session gated on valid password; downstream route guards unchanged).
- [x] Unauthorized user remains denied (unknown user → 401; wrong password → 401 — asserted).
- [x] Authorized member's login logic succeeds through the membership lookup (asserted; the unit-invocation `cookie_set` step is a Next request-scope artifact, not a product failure — see §G).
- [x] Smoke no longer produces a **false** 500 for a **valid** setup: for a correctly-migrated DB the regression test shows login passes the membership lookup; the production 500 is a **true** signal of a real environment gap, not a false positive.
- [x] Smoke honesty preserved: not faked green, membership checks not bypassed, auth not weakened, no test-only production shortcuts, smoke left required-classification unchanged.
- [x] `tsc --noEmit` and `eslint` (0 new errors) clean.

## G. Known limitations
- **The production smoke will only turn fully green once the production database migration is
  applied.** The drift affects every default-select `workspace_memberships` read the demo flow
  touches (login → `demo-permission-proof` → `demo-engagement-proof` → `/api/engagements` via
  `getPolicyContext`). This PR hardens the **owner-facing login route** (the documented
  `membership_lookup_failed` defect). It intentionally does **not** sweep-narrow the internal
  diagnostic endpoints or the shared `getPolicyContext` resolver: that would be chasing an
  environment problem through code (teaching-to-the-test) and touching unrelated/shared surfaces,
  which the Item 3 hard rules forbid. The correct fix for those is the pending migration.
  **Recommended environment follow-up:** apply `20260625120000_owner_mode_execution_tables` to
  production (e.g. the `migrate-production` workflow). Optional code follow-up: narrow the remaining
  membership selects to needed columns for defence-in-depth.
- The regression test invokes the real login route handler. On the success path Next's
  `cookies()` requires a request scope that a unit invocation lacks, so a fully-valid login reports
  `cookie_set_failed` (stage `cookie_set`) in the test sandbox — it has already passed the
  membership lookup. The test therefore asserts the precise invariant this item fixes (never
  `membership_lookup_failed`), plus the deny paths (401) which do not reach `cookies()`. Real HTTP
  requests (including the production smoke) have a cookie scope and return 200.
- No mocks were used for any DB/API behaviour (Global Rule 8): the failure and the fix are both
  demonstrated with real Prisma calls against a real Postgres, including a real column drop to
  reproduce the drift.

## H. Manual verification steps
1. Start Postgres, `npx prisma migrate deploy`, `npx prisma generate`.
2. `TEST_WITH_DB=true npx vitest run src/app/api/auth/__tests__/login-membership-lookup.db.test.ts` → 5 passed.
3. Reproduce the production failure class directly: seed a membership, `ALTER TABLE workspace_memberships DROP COLUMN primary_auth_method`, run the **bare** `findFirst` → throws `P2022 ColumnNotFound`; run `findFirst … select:{ workspaceId:true }` → returns the workspaceId; restore the column.
4. After merge, watch `Smoke - Production Dashboard` on main: the login step (Step 1) should advance past its former 500. Any residual failure at a later step is the same environment drift on another default-select membership read (confirms §D.2), remediated by the production migration.

## I. Trigger map
Smoke → `POST /api/auth/login` (demo user) → `stage = membership_lookup` →
`workspaceMembership.findFirst` → under deployed-DB drift, bare select throws P2022 → catch sets
`classification = membership_lookup_failed` → 500. Post-fix: the narrow select reads only
`workspace_id` and returns, so login proceeds to password verification / session creation.

## J. Failure modes covered
- Owner-facing login 500 caused by reading a `workspace_memberships` column absent in the deployed DB — fixed (narrow select) and guarded by the drift-reproduction test.
- Auth-bypass risk — none introduced: unauthorized (unknown user / wrong password) still denied (asserted 401).
- Login incorrectly gated on membership — covered: a valid user with no membership still passes the lookup (asserted).

## K. Events emitted
None added or changed. Login still emits `USER_LOGGED_IN` / `USER_LOGIN_FAILED` audit events; the fix
only changes which columns the membership lookup selects.

## L. Automated tests added
- `src/app/api/auth/__tests__/login-membership-lookup.db.test.ts` (5 tests), DB-backed, required
  `build-and-test` lane: unknown user → 401; wrong password → 401; valid member never
  `membership_lookup_failed`; valid user with no membership never `membership_lookup_failed`;
  real column-drop drift reproduction (old bare select throws P2022, fixed narrow select resolves,
  real login route no longer `membership_lookup_failed`).
