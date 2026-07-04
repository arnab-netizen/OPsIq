# OpsIQ Wave 8 — Internal Route Scoping / Strict-Auth Success Paths (Plan-First)

> Follow-up wave closing a MILESTONE_RUNTIME_PARTIAL item. Standard:
> `OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md` v3.0. Audit tier: **Tier 2** (reachable internal routes whose service
> layer throws at runtime). Branch `claude/runtime-readiness-wave8-internal-route-scoping`, base `main @ 68e4e43b`.
> **CI is NOT triggered by this plan.**

## Defect (verified against the real schema)
Three internal services query workspace-scoping columns/relations that do not exist, so their strict-auth success
paths throw `PrismaClientValidationError` at runtime (they are currently "deny-provable" only because they can never
succeed):
- **BROKEN-SVC-2 (User)** — `user.findUnique({ id, workspaceId })` + `email_workspaceId` compound + `create({ workspaceId })`. `User` has no `workspaceId` column and `email` is globally unique. Blocks `users/[userId]` PATCH+POST.
- **BROKEN-SVC-3 (Lead)** — `leadRecord.{create,findUnique}({ workspaceId })`. `LeadRecord` has no `workspaceId`. Blocks `leads/[leadId]` POST.
- **BROKEN-SVC-1 (ClientContact)** — `clientContact.findFirst({ client: { workspaceId } })` (wrong relation name + `ClientAccount` has no `workspaceId`). Blocks `clients/[clientId]/contacts/[contactId]` DELETE.

## Fix (this wave) — User, migration-free
`User` reaches a workspace via the **`workspaceMemberships`** relation (working precedent: `engagement-membership.ts`).
Rescope every User query through it, matching the Wave-1 relation-scoping sweep:
- reads (`getUserById`, `listUsers`, and the pre-read in update/deactivate/reactivate) → `findFirst`/`findMany` with
  `workspaceMemberships: { some: { workspaceId, isActive: true } }`.
- version-checked writes (`updateUser`, `deactivateUser`, `reactivateUser`) → relation-scoped `updateMany` + a
  `count===0 → OptimisticLockError` assert (Prisma `update` can't take a relation filter; this is the `action.ts`
  optimistic pattern).
- `email_workspaceId` compound → plain `email` unique; `createUser` creates a **global** user (adds the required
  `id`/`updatedAt`, drops the phantom `workspaceId`).
- deactivate collateral: `Session` + `UserRoleAssignment` are userId-scoped (no workspace column) → drop the phantom
  `workspaceId` filter; `EngagementMembership` → scope via `engagement: { workspaceId }`.

No migration, no schema change, no route-wrapper change, no gate weakened.

## Deferred to decision memo (schema decisions — do not guess)
`OPSIQ_RUNTIME_READINESS_WAVE8_INTERNAL_ROUTE_SCOPING_DECISION.md`:
- **Lead** and **ClientAccount(+ClientContact)** have **no workspace-reaching column or always-present relation**, so
  they need a `workspace_id` column + migration (ClientAccount also needs the "`id` IS workspace" Owner-Mode
  dual-model reconciled first). Options/recommendation/risks/tests documented; not implemented (schema decision).
- **createUser → WorkspaceMembership** association needs a role decision (no default role in the payload).
- All are internal/consultant-side routes, **non-blocking** for the owner shadow-pilot runtime path; they still throw
  honestly at runtime until decided (not masked).

## DB proof
`src/__tests__/services/user/user-workspace-scoping.db.test.ts` (5, un-mocked): getUserById/listUsers membership-scoped
+ cross-workspace excluded; updateUser succeeds / stale version → OptimisticLockError / foreign workspace → NotFound;
deactivateUser flips `isActive` + revokes the user's sessions + reactivate flips back; createUser creates a global
user (no throw) + duplicate email → Conflict.

## Classification (candidate)
**`USER_ROUTE_SCOPING_DB_PROVEN`** — the User strict-auth success paths are fixed migration-free with DB proof and
isolation; Lead + ClientAccount/ClientContact are captured as explicit schema decisions (no guess). Merge gated on
required CI + a final hostile audit after the PR opens.

## Out of scope
Public SaaS / billing / launch / integrations. No migration, no route-wrapper canonicalization, no gate weakening.
