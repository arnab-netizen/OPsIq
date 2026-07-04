# OpsIQ Runtime-Readiness — P4-A6 Intervention Route Canonical Migration Report

> Sixth P4 slice toward blocker **B4**. Migrates the `engagements/[engagementId]/intervention` **PATCH**
> handler off the legacy `withEnforcementFull` + `withAuth({ internalOnly: true })` +
> `canonicalizeAuthContext` path onto the canonical `withCanonicalEnforcement` wrapper. This is the first of
> the four **active** legacy-auth route migrations (the higher-risk core of B4). Drives strict-auth **9 → 7**.
> Fail-closed behaviour is preserved and **DB-proven** (7 runtime RBAC tests on local Postgres 16).

## Branch & base
- Branch: `claude/runtime-readiness-p4a6-contact-delete-canonical`
- Base HEAD: `1e82241` (main; after P4-A5 #92 merged).

## The gap (part of B4)
`engagements/[engagementId]/intervention/route.ts` PATCH imported the legacy auth modules
`@/lib/enforced-route` (`withEnforcementFull`) and `@/lib/auth-guard`
(`withAuth`, `canonicalizeAuthContext`) — two strict-auth "legacy auth import in canonical route"
violations. Unlike the earlier dead-import slices, these are **live**: the handler actively authenticated,
scoped the workspace from the `x-workspace-id` header, and canonicalised the legacy context by hand.

## What was implemented (behaviour-preserving auth migration)
PATCH now uses `withCanonicalEnforcement(handler, { requireCapabilities: [INTERVENTION_MANAGE], requireWorkspace: true })`:
- **Auth / capability / workspace** are enforced by the canonical wrapper. `workspaceId` is derived
  **server-side from the actor's active membership** (no longer trusted from the `x-workspace-id` header) — a
  strict improvement, consistent with the already-canonical GET.
- **Internal-only** is preserved as a defense-in-depth guard using the centralized policy check
  `hasInternalAccess(ctx.policy)` (mirrors the legacy `withAuth({ internalOnly: true })`, which threw
  `ForbiddenError`). `INTERVENTION_MANAGE` is already restricted to internal roles by the capability mapping,
  so this cannot be triggered independently by a real role — it exists so a future capability regrant cannot
  silently expose intervention transitions to client-side actors.
- **Engagement-scoped access** (`assertEngagementAccess`) is unchanged, still enforced before any mutation.
- The verified `ctx` (a `CanonicalAuthContext`) is passed straight to `updateInterventionPhase` /
  `updateInterventionMode` — replacing the hand-rolled `canonicalizeAuthContext({ session, policy }, workspaceId)`.

### Two canonical-wrapper contract fixes required by the migration
The legacy `withEnforcementFull` returned a handler's `Response` object verbatim. The canonical wrapper
instead **JSON-serialises the handler's return value**, so the legacy patterns silently regress:
1. `return Response.json(body, { status: 4xx })` → coerced to **200** with body `{}`. Fixed by returning a
   `canonicalJson(body, { status: 4xx })` envelope (the wrapper's sanctioned non-200 mechanism) for the two
   client-error branches (invalid JSON / missing field).
2. `return Response.json(updated)` on success → serialised to `{}`. Fixed by returning the plain payload
   (`return getInterventionState(engagementId, workspaceId)`), which the wrapper serialises correctly.

Both were verified empirically (a raw `Response.json(...)` success returned `STATUS 200 BODY {}` before the fix).

## Files changed
- CHANGED `src/app/api/engagements/[engagementId]/intervention/route.ts` (PATCH → canonical; 4xx + success body fixes)
- NEW `src/__tests__/engagements/intervention-route.rbac.test.ts` (7 runtime RBAC DB tests)
- NEW `OPSIQ_RUNTIME_READINESS_P4A6_INTERVENTION_ROUTE_CANONICAL_REPORT.md`

The already-canonical GET handler was **left untouched** (it carries no legacy-auth import; its pre-existing
defects are recorded below, not fixed in this auth slice).

## DB / migration changes
**None.** **API:** PATCH response status contract preserved (200 success, 400 client error, 401/403 deny);
the success body is now the correct intervention-state payload instead of `{}`. **UI:** none.

## Tests / checks run (local, Postgres 16)
- `tsc --noEmit` ✓.
- **strict-auth**: `eslint .` → **9 → 7**; the intervention route now has **0** violations.
- **Auth route scanner** (`governance:scan:auth`, blocking gate): **"All routes comply"**.
- **Governance scan** (`governance:scan:strict`): **32 matched, 0 new**.
- `lint:ratchet` **PASS** — errors **2089 → 2086**; 0 changed-file lint errors.
- **Runtime RBAC (new, DB-backed, 7 tests, all green)** — real PATCH handler through the real canonical
  wrapper, only `@/services/auth` + `@/services/re-evaluation` mocked (the latter exactly as the existing
  `decisions`/`actions`/`experiments` route tests do):
  1. unauthenticated → denied, no mutation
  2. internal actor without `INTERVENTION_MANAGE` (experienced_consultant) → **403**, no mutation
  3. client-side role (client_owner) → **403**, no mutation
  4. manager with `INTERVENTION_MANAGE` → **200**, mode transitioned `recovery → growth`, **response body correct**
  5. body without `interventionPhase`/`interventionMode` → **400**, no mutation
  6. manager without engagement membership → **403** (engagement-scoped access), no mutation
  7. foreign-workspace manager → non-200, target engagement unchanged (cross-workspace isolation)
- No-regression: `g6r-auth-bridge` + `policy-wrapper-enforcement` + intervention suites → **57 passed**.

## Discovered pre-existing defects (NOT fixed here — logged for separate slices)
While DB-proving the four B4 route targets, several services were found to issue **invalid Prisma queries**
against the committed schema (they throw `PrismaClientValidationError` on their success path). Verified by
executing each query shape against local Postgres. Their only tests live in `__ignored_tests__`, which is why
they survived. These are data-layer defects, out of scope for an auth-migration slice:
- **`services/client-contact.ts`** — `clientContact.findFirst({ where: { client: { workspaceId } } })`:
  `ClientContact` has no `client` relation (it is `clientAccount`), and `ClientAccount` has no `workspaceId`.
- **`services/user.ts`** — `user.findUnique({ where: { id, workspaceId } })` and `email_workspaceId`:
  `User` has no `workspaceId` scalar / composite unique.
- **`services/lead.ts`** — `leadRecord.findUnique({ where: { id, workspaceId } })`: invalid unique locator.
- **`services/re-evaluation.ts:310/318`** — `finding.findMany` / `action.findMany` filter on a `workspaceId`
  field that `Finding` (and `Action`) do not have; reached by every intervention transition (mocked in tests).
- **`intervention` GET (same file)** — pre-existing, unrelated to legacy auth: `requireCapabilities:
  ["INTERVENTION_VIEW"]` uses the enum **key** string instead of `CAPABILITIES.INTERVENTION_VIEW`
  (`"intervention:view"`), so it always 403s; and it returns `Response.json(state)` (→ `{}`) and calls
  `getInterventionState(engagementId)` without a workspaceId. Left as-is; recommended for a dedicated
  read-route correctness slice.

## Honest scope (not overclaimed)
- Migrates **one live route handler** (PATCH) off legacy auth and DB-proves fail-closed behaviour. strict-auth
  **9 → 7**.
- The remaining **7** strict-auth violations: `users/[userId]` (PATCH+POST), `leads/[leadId]` (POST),
  `clients/[clientId]/contacts/[contactId]` (DELETE) — each still to migrate — plus one cast in the
  `g6r-auth-bridge` test. Those three routes call the broken services above, so their **success** paths cannot
  reach 200 until the data-layer defects are fixed; their **deny** paths remain fully provable.
- **B4 stays open.** No gate weakened, no threshold lowered, no test deleted.

## Classification
**`P4_INTERVENTION_ROUTE_CANONICALISED`** (tsc + auth-scanner + governance + ratchet + 7 runtime RBAC DB tests):
a live legacy-auth route now runs on the canonical wrapper with fail-closed auth proven end-to-end against a
real database; response-contract regressions inherent to the wrapper swap were caught and fixed; behaviour
otherwise preserved.

## Merge recommendation
Open PR; drive CI green (blocking governance + auth-scan pass locally). Public SaaS / billing / launch /
integrations remain out of scope and blocked. Next B4 slices are the three remaining active-wrapper route
migrations; recommend fixing each route's broken service (or proving deny-only with an explicit documented
limitation) as those slices proceed.
