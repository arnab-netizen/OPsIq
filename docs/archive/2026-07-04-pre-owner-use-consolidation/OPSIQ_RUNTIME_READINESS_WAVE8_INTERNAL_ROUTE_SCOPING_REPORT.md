# OpsIQ Wave 8 — Internal Route Scoping Report + Tier-2 Hostile Audit

> Standard: `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (internal routes whose service
> layer threw at runtime). **CI was NOT triggered by this work.** Branch
> `claude/runtime-readiness-wave8-internal-route-scoping`; base `main @ 68e4e43b`. Migration-free; no gate weakened.

## 1. What changed (diff scope — §9)
| File | Class | Change |
|---|---|---|
| `src/services/user.ts` | production | Rescoped every User query off the non-existent `User.workspaceId`/`email_workspaceId` onto the `workspaceMemberships` relation; version-checked writes → relation-scoped `updateMany` + `OptimisticLockError`; `createUser` creates a global user (adds `id`/`updatedAt`, drops phantom `workspaceId`); deactivate collateral: Session/UserRoleAssignment userId-scoped, EngagementMembership via `engagement:{workspaceId}` |
| `src/__tests__/services/user/user-workspace-scoping.db.test.ts` | test | 5 DB proofs |
| `*_PLAN.md`, `*_DECISION.md`, this report, `*_EVIDENCE_LEDGER.json` | docs | plan + schema decision memo + audit |
No schema/migration/route/workflow file touched. No threshold/rule/baseline change (§9.3 clean — baseline unchanged).

## 2. Claim-to-proof matrix (§10)
| Claim | Required layer | Actual | Evidence | Verdict |
|---|---|---|---|---|
| `getUserById`/`listUsers` return a workspace's members via the membership relation and exclude cross-workspace | real DB | **DB** | `user-workspace-scoping.db.test.ts` #1,#2 | PASS |
| `updateUser` succeeds; stale version → `OptimisticLockError`; foreign workspace → `NotFound` | DB | **DB** | test #3 | PASS |
| `deactivateUser` flips `isActive` + revokes the user's active sessions (userId-scoped) + no throw; `reactivateUser` flips back | DB | **DB** | test #4 | PASS |
| `createUser` creates a global user (no throw); duplicate email → `Conflict` | DB | **DB** | test #5 | PASS |
| Lead / ClientContact strict-auth success paths fixed | — | **NOT DONE (schema decision)** | decision memo D1/D2 | HONEST NON-CLAIM |
| createUser establishes a WorkspaceMembership | — | **NOT DONE (role decision)** | decision memo D3 | HONEST NON-CLAIM |

## 3. Reachability (§11)
`updateUser`/`deactivateUser`/`reactivateUser`/`getUserById` back `users/[userId]` PATCH+POST+GET (`withEnforcementFull`
+ `withAuth internalOnly`); `createUser`/`listUsers` back the `users` collection route (`withCanonicalEnforcement`).
Before this wave every one threw on the phantom `User.workspaceId`; now they run against real membership-scoped queries.

## 4. Root cause + honest boundaries (§14, §18, §34)
`User` has no `workspaceId` column; users belong to a workspace via `WorkspaceMembership`. The service treated
`workspaceId` as a User column (and used a non-existent `email_workspaceId` compound). Fixed via the relation, no
migration. `Session`/`UserRoleAssignment` genuinely have no workspace column and are userId-global — deactivation now
revokes them by `userId` (more correct: a deactivated user loses all sessions/roles, not just one workspace's).
`EngagementMembership` scoped via its `engagement` relation. **Lead** and **ClientAccount/ClientContact** have no
workspace-reaching column/relation at all and are captured as schema decisions (memo), not guessed migrations — they
still throw honestly until decided (not masked). No fabricated scope, no empty-array masking, no gate weakened.

## 5. Local proof (§4, no CI triggered)
- `tsc --noEmit` ✓ (0); `lint:ratchet` **PASS** (2083 ≤ 2155, 0 changed-file errors); `governance:scan:strict`
  **32 frozen / 0 new** (baseline unchanged); `governance:scan:auth` comply.
- **DB (local Postgres 16)**: `user-workspace-scoping.db.test.ts` **5/5**.
- **No-regression**: route-wrapping/convergence scanners (`wrapped-handlers-scanner`, `phase-i10-route-wrapping`,
  `phase6-route-convergence`) **63/63**.

## 6. CI status (§1.1 / §35)
**CI was not triggered by this work.** PR opened after local proof. Until then:
`CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT`.

## 7. Classification
**`USER_ROUTE_SCOPING_DB_PROVEN`** — the User strict-auth success paths (`users/[userId]` PATCH+POST+GET, users
collection) are fixed migration-free with DB proof and workspace isolation. Lead + ClientAccount/ClientContact +
createUser-membership are resolved into explicit schema/role decisions (no guess, no migration), documented as
non-blocking for the owner shadow-pilot runtime path. Merge gated on required CI + a final hostile audit.
