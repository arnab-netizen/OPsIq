# OpsIQ Architectural Invariant Ledger

> **Last updated:** 2026-07-12  
> **Source audit:** `docs/audits/2026-07-12-stage-a7.5/`  
> **Branch:** `claude/phase-a7.5-invariant-hardening`

This ledger defines the ten architectural invariants that every code path in OpsIQ must honour.
Each invariant states the rule, the defect class that fires when it is violated, the current status, and the deferred items that remain open.

---

## I1 — Workspace Isolation

**Rule:** Every database query and service call that accesses multi-tenant data MUST scope on a verified `workspaceId` taken from the authenticated session (`ctx.verifiedWorkspaceId`), never from client-supplied headers, query params, or request body.

**Defect class:** DC-A7.5-I1

**Status after A7.5 hardening:**

| Instance | File | Fix applied |
|---|---|---|
| I1-A | `src/app/api/engagements/[engagementId]/actions/route.ts` | ✅ `ctx.verifiedWorkspaceId` |
| I1-B | `src/app/api/engagements/[engagementId]/findings/route.ts` | ✅ `ctx.verifiedWorkspaceId` |
| I1-C | `src/app/api/engagements/[engagementId]/recommendations/route.ts` | ✅ `ctx.verifiedWorkspaceId` |
| I1-D | `src/app/api/governance/alerts/route.ts` | ✅ removed `requireWorkspaceContext()` |
| I1-E | `src/app/api/observability/summary/route.ts` | ✅ removed `requireWorkspaceContext()` |
| I1-F (actor) | `src/app/api/owner/learning-privacy/route.ts` | ✅ `ctx.verifiedActorId` |
| I1-G (actor) | `src/app/api/owner/learning-retention/route.ts` | ✅ `ctx.verifiedActorId` |
| I1-H (actor) | `src/app/api/owner/learning-consent/route.ts` | ✅ `ctx.verifiedActorId` |
| I1-I (actor) | `src/app/api/owner/learning-harm-events/route.ts` | ✅ `ctx.verifiedActorId` |

**Deferred (documented, not fixed in A7.5):**

- `src/services/workspace/context.ts`: `requireWorkspaceContext()` returns `session.user.id` as workspaceId. Used by metrics/control-effectiveness, metrics/decision-latency, run/route.ts. Deferred: these routes need deeper refactor to receive `workspaceId` from their callers.
- `src/app/api/decisions/[decisionId]/execute/route.ts`: reads `x-workspace-id` header without membership re-verification. Deferred: DC-A7.5-I5C overlap.

**Permanent enforcement contract:**
- `withCanonicalEnforcement` is the only permitted entrypoint for workspace-scoped API routes.
- `ctx.verifiedWorkspaceId` is the only permitted source of workspaceId in any route handler.
- `requireWorkspaceContext()` and `getWorkspaceContext()` in `src/services/workspace/context.ts` are forbidden in route handlers; they may only be used by non-route background services where a real workspace ID is passed from a verified caller.

---

## I2 — Idempotency

**Rule:** Every write operation that can be retried (network timeouts, double-submit, webhook replay) MUST be protected by an idempotency key that is scoped to the workspace and bound to a single operation type.

**Defect class:** DC-A7.5-I2

**Status after A7.5 hardening:**
- Documented only. No schema changes possible without DB migration (DB-blocked).

**Deferred:**
- `src/services/idempotency.ts`: `IdempotencyRecord` has no `workspaceId` column; idempotency keys are global, not per-workspace. Requires DB schema migration and backfill.
- TOCTOU races in idempotency check-and-set (read before write not atomic). Requires DB-level unique constraint or advisory lock.

---

## I3 — Atomic Audit

**Rule:** Every material mutation MUST emit a corresponding audit event. Audit events that cover a mutation SHOULD be emitted within the same database transaction as the mutation (atomic). Non-transactional audit (best-effort `.catch(() => {})`) is acceptable only for read-only observation routes.

**Defect class:** DC-A7.5-I3

**Status after A7.5 hardening:**

| Instance | File | Fix applied |
|---|---|---|
| I3-A | `src/services/external-systems/token-lifecycle.service.ts` — `storeOAuthToken` | ✅ `OAUTH_TOKEN_STORED` emitted |
| I3-B | `token-lifecycle.service.ts` — `updateSyncJobStatus` (failed path) | ✅ `SYNC_JOB_FAILED` emitted |
| I3-C | `token-lifecycle.service.ts` — `updateSyncJobStatus` (success path) | ✅ `SYNC_JOB_COMPLETED` emitted |
| I3-D | `token-lifecycle.service.ts` — `disconnectOAuthConnection` | ✅ `OAUTH_CONNECTION_REVOKED` emitted |
| I3-E | `token-lifecycle.service.ts` — `markConnectionExpired` | ✅ `OAUTH_CONNECTION_EXPIRED` emitted |
| I3-F | `src/domain/constants/audit-events.ts` | ✅ 5 new event constants added |

**Permanent enforcement contract:**
- All new service methods that create, update, or delete governed records MUST emit an audit event.
- Audit event constants must be declared in `src/domain/constants/audit-events.ts` before use.
- Audit within a `$transaction` block is preferred; best-effort `.catch(() => {})` is permitted for background/observability-only routes.

---

## I4 — CAS Locking (Optimistic Concurrency)

**Rule:** Any service method that reads a record's version then writes an update MUST include the version in the WHERE clause of the update (compare-and-swap). Pre-read version checks that are not reflected in the UPDATE WHERE clause create TOCTOU races.

**Defect class:** DC-A7.5-I4

**Status after A7.5 hardening:**
- Documented only. 12 write paths identified with missing CAS locking. All deferred as high-risk refactor.

**Deferred instances (12):**
- `src/services/decisions/decision.service.ts` — `updateDecisionStatus`, `recordDecisionOutcome`
- `src/services/engagements/engagement.service.ts` — `completeEngagement`, `cancelEngagement`
- `src/services/actions/action.service.ts` — `updateActionStatus`
- `src/services/recommendations/recommendation.service.ts` — `approveRecommendation`, `rejectRecommendation`
- `src/services/deliverables/deliverable.service.ts` — `submitDeliverableVersion`, `approveDeliverable`
- `src/services/owner/recovery.service.ts` — `verifyRecoveryOutcome`
- `src/services/owner/finance.service.ts` — `verifyFinanceOutcome`
- `src/services/owner/budget.service.ts` — `recordBudgetSpend`

**Pattern for fix (when implemented):**
```typescript
// WRONG (TOCTOU):
const record = await db.entity.findUnique({ where: { id }, select: { version: true } });
if (record.version !== expectedVersion) throw new ConflictError();
await db.entity.update({ where: { id }, data: { ... } }); // race here

// CORRECT (CAS):
const updated = await db.entity.updateMany({
  where: { id, version: expectedVersion },
  data: { ..., version: { increment: 1 } },
});
if (updated.count === 0) throw new ConflictError("Concurrent modification detected");
```

---

## I5 — Capability Enforcement

**Rule:** Every route that performs a protected action MUST verify the authenticated actor's capability using the centralized `hasPermission` map. The permission string passed to `hasPermission` MUST exactly match a string listed in the map for the actor's role.

**Defect class:** DC-A7.5-I5

**Status after A7.5 hardening:**

| Instance | Fix applied |
|---|---|
| I5-A: 4 missing permission strings in `hasPermission` map | ✅ Added `execute`, `fail_decision`, `verify_outcome`, `record_outcome` |

**Deferred:**
- DC-A7.5-I5B: `src/app/api/decisions/[decisionId]/proof/route.ts` — accepts `reviewedBy` from request body instead of `ctx.verifiedActorId`
- DC-A7.5-I5C: `src/app/api/decisions/[decisionId]/intake/route.ts` — bypasses capability check via direct header read

**Permanent enforcement contract:**
- `hasPermission(role, action)` MUST be called with a string that is a key in the `permissions` map.
- Actor identity MUST come from `ctx.verifiedActorId`, never from request body or headers.
- New actions added to decision/engagement lifecycle MUST be added to the `hasPermission` map for all relevant roles before the route is deployed.

---

## I6 — No Duplicate Logic

**Rule:** Business logic that computes the same quantity (margins, scores, rates) MUST live in exactly one canonical location. Duplicates with different implementations (unit inconsistency, rounding difference, formula variant) are forbidden.

**Defect class:** DC-A7.5-I6

**Status after A7.5 hardening:**
- Documented only. 1 instance identified (margin floor percent vs fraction).

**Deferred:**
- Margin floor unit inconsistency: `src/domain/business-condition/margin-floor.ts` uses fraction (0–1) but call sites bridge with `/100`. Deferred pending business logic review.

---

## I7 — No Throwing Stubs / Placeholders

**Rule:** Production routes MUST NOT contain `throw new Error("not implemented")`, `TODO`, or stub implementations that always fail. All stubs must be either replaced with real implementations or explicitly documented as known gaps with a deferred classification.

**Defect class:** DC-A7.5-I7

**Status after A7.5 hardening:**
- Documented only. 8 throwing stubs identified and classified.

**Deferred stubs (8):**
- `src/services/integrations/google-sheets-oauth.ts:storeGoogleOAuthToken`
- `src/services/integrations/browser-import.service.ts:importFromBrowser`
- `src/services/external-systems/token-lifecycle.service.ts:exchangeRefreshTokenForAccessToken` (intentional — provider-specific)
- `src/services/owner/review-cycles.service.ts:getNextReviewDate`
- `src/domain/business-condition/constraint-checks.ts:checkBudgetConstraint`
- `src/services/snapshot/snapshot-engine.ts:captureEngagementSnapshot`
- `src/lib/cache/cache-factory.ts:createCache`
- `src/infra/monitoring/error-monitoring.ts:captureException`

---

## I8 — Test Integrity

**Rule:** Tests MUST NOT mock the system under test. A test for service X that mocks service X provides false confidence. Mock only the external dependencies of the system under test.

**Defect class:** DC-A7.5-I8

**Status after A7.5 hardening:**
- Documented only. 3 self-mocking tests identified.

**Deferred:**
- `src/__tests__/services/decision.service.test.ts` — mocks `decision.service` itself
- `src/__tests__/services/engagement.service.test.ts` — mocks `engagement.service` itself
- `src/__tests__/api/governance.test.ts` — mocks `governance/alerts` route handler

---

## I9 — No Dead Code

**Rule:** Exported functions and types that are never imported outside their own module are dead code and must be removed.

**Defect class:** DC-A7.5-I9

**Status after A7.5 hardening:**
- Documented only. 4 dead exports identified.

**Deferred:**
- `src/domain/business-condition/legacy-assessor.ts:LegacyAssessor` (class + 3 methods — unused)
- `src/lib/formatting/date-format.ts:formatRelativeDate` (function — unused)

---

## I10 — Dependency Graph (Layer Rule)

**Rule:** The dependency graph must flow strictly in one direction: Routes → Services → Domain. Domain modules MUST NOT import from Services. Routes MUST NOT call Domain modules directly.

**Defect class:** DC-A7.5-I10

**Status after A7.5 hardening:**
- Documented only. 6 FAIL violations and 8 WARNs identified.

**Deferred violations (6 FAILs):**
- `src/domain/business-condition/assessor.ts` → imports from `src/services/kpi/kpi.service` (domain→service)
- `src/domain/intervention/phase-evaluator.ts` → imports from `src/services/engagements/engagement.service` (domain→service)
- `src/app/api/decisions/[decisionId]/submit/route.ts` → imports from `src/domain/decisions/decision-rules.ts` directly (route→domain)
- `src/app/api/engagements/[engagementId]/route.ts` → imports from `src/domain/engagements/engagement-rules.ts` directly (route→domain)
- `src/app/api/owner/recovery/route.ts` → imports from `src/domain/business-condition/assessor.ts` directly (route→domain)
- `src/app/api/owner/finance/route.ts` → imports from `src/domain/business-condition/financial-assessor.ts` directly (route→domain)

**Deferred WARNs (8):**
- Services that import other services at module scope (should be injected or composed at the service layer)

---

## Enforcement Checklist for New Code

Before merging any PR that touches route handlers or services, verify:

- [ ] **I1**: All workspaceId values come from `ctx.verifiedWorkspaceId`, not from headers/body
- [ ] **I1**: All actor IDs come from `ctx.verifiedActorId`, not from request body fields
- [ ] **I2**: Mutating endpoints that can be retried use idempotency keys
- [ ] **I3**: Every new mutation emits a corresponding audit event constant from `AUDIT_EVENTS`
- [ ] **I4**: Update operations that check version also include version in WHERE clause
- [ ] **I5**: New action strings are added to `hasPermission` map for all relevant roles
- [ ] **I6**: New business logic re-uses existing calculation functions; no new duplicates
- [ ] **I7**: No `throw new Error("not implemented")` or `TODO` stubs in production paths
- [ ] **I8**: Tests mock only external dependencies, never the system under test
- [ ] **I9**: No new exported symbols that are never imported
- [ ] **I10**: Imports flow Routes → Services → Domain only; no upward or cross-layer imports
