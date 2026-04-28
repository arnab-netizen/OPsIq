# Production Hardening Pack for Phase 1–5

**Date:** 2026-04-28  
**Audit Status:** Hostile audit complete on main branch  
**Scope:** Phase 1–5 (operator queue, calibration, decision engine, scenario lab, override, policy, reporting)

---

## 1. Executive Verdict

| Status | Answer |
|--------|--------|
| **Production-ready** | ❌ NO |
| **Paid-pilot-ready** | ❌ NO |
| **Enterprise-ready** | ❌ NO |

**Reason:** 8 P0 blockers prevent any real-world deployment. All Phase 1–5 data is ephemeral; auth is absent; financial outputs are unauditable; safety checks are broken.

---

## 2. P0 Blocker Index

### P0.1: In-Memory Persistence Only
**Risk:** Data loss on restart. No SLA, audit trail, or recovery.  
**Inspected:**
- `src/services/operator/store.ts` (lines 5–6: `let store: OperatorItem[] = []`)
- `src/services/override/store.ts` (line 3: `let overrideStore: OverrideRecord[] = []`)
- `src/services/entity/store.ts` (lines 3–4: in-memory only)
- `src/services/calibration/summary.ts` (uses in-memory store)
- `prisma/schema.prisma` (0 of 8 required models present)

**Still Need:**
- Verify all Phase 1–5 APIs for Prisma usage (grep all routes)
- Check if any Phase 1–5 data already has a database write anywhere

---

### P0.2: No Session-Based Authentication
**Risk:** Any client can call any API. No user accountability.  
**Inspected:**
- `src/services/auth.ts` (proper session/RBAC exists for Module 2–3)
- `src/app/api/operator/route.ts` (no requireSession call)
- `src/app/api/override/route.ts` (no auth check)
- `src/app/api/calibration/route.ts` (no auth check)
- `src/app/api/report/route.ts` (no auth check)
- `src/app/api/entity/route.ts` (no auth check)

**Still Need:**
- Grep all Phase 1–5 API routes for requireSession/requirePolicyContext calls
- Verify Module 2–3 auth patterns are complete and usable

---

### P0.3: Role Accepted from Request Body
**Risk:** Client-side role spoofing. No server-side validation.  
**Inspected:**
- `src/app/api/operator/route.ts` (line 28: `const { id, status, actualOutcome, role } = body;`)
- Role used directly in canEdit() call without session validation

**Still Need:**
- Find all Phase 1–5 APIs accepting role parameter
- Verify no other auth checks bypass session

---

### P0.4: Hardcoded Financial Baselines & Multipliers
**Risk:** Cannot defend $1.2M recommendation. No assumption tracking.  
**Inspected:**
- `src/services/finance/normalize.ts` (lines 34–35: hardcoded 0.7, 1.3 multipliers)
- `src/services/system/run.ts` (line 45: hardcoded baseline 10000/5000)
- `src/app/api/run/route.ts` (lines 26–29: hardcoded revenueChange * 0.1, confidence = 0.75)
- `src/services/scenario/engine.ts` (line 19: hardcoded confidence = 0.8)

**Still Need:**
- Trace all decision/impact paths for other hardcoded values
- Check if any assumptions are persisted anywhere

---

### P0.5: Audit is Console.Log Only
**Risk:** No tamper-proof record. Compliance failure.  
**Inspected:**
- `src/services/audit/log.ts` (line 4: `console.log(...)`)
- `src/infra/audit.ts` (proper emitAuditEvent exists but unused by Phase 1–5)
- AuditEvent model exists in schema

**Still Need:**
- Verify all Phase 1–5 mutation APIs for emitAuditEvent calls
- Check if any audit events are being created

---

### P0.6: Fail-Closed Safety Checks are Broken
**Risk:** System will not block dangerous decisions.  
**Inspected:**
- `src/__tests__/backbone.test.ts` (3 failing tests, lines 20, 42, 53)
- Low confidence clamped to 0.4 before validation (bypasses < 0.4 check)
- Zero impact masked by hardcoded baseline (NO_IMPACT never triggers)
- ImpactEstimate field mismatch (confidence vs confidenceWeight)

**Still Need:**
- Verify validateRuleInput calls and safety thresholds
- Check if any Phase 1–5 API validates inputs before processing

---

### P0.7: Webhooks are Console.Log Only
**Risk:** External integrations silent-fail. No delivery tracking.  
**Inspected:**
- `src/services/integration/webhook.ts` (line 4: `console.log(...)`)
- Called from `src/app/api/operator/route.ts` (line 95 on completion)
- No WebhookDelivery model in schema

**Still Need:**
- Find all webhook call sites
- Verify no other integration patterns exist

---

### P0.8: Tests Failing
**Risk:** Safety mechanisms are proven broken.  
**Inspected:**
- `src/__tests__/backbone.test.ts`
  - ❌ "should execute with high risk scenario" — confidence undefined
  - ❌ "should fail-closed on low confidence" — clamp bypasses validation
  - ❌ "should fail-closed on zero impact" — hardcoded baseline masks zero

**Still Need:**
- Run full test suite and identify all Phase 1–5 test failures
- Verify no other safety tests are silently passing

---

## 3. Prisma Persistence Plan

Add 8 new models to `prisma/schema.prisma`. Reuse existing patterns from Action model (createdAt, updatedAt, version, visibility, actor fields).

### Model: OperatorItem
**Purpose:** Persist decisions/actions queued for execution.  
**Fields:**
- `id` (UUID, PK)
- `problem`, `action` (String)
- `impactExpected`, `impactLow`, `impactHigh` (Decimal)
- `confidence`, `priorityScore` (Decimal)
- `status` (String: pending|in_progress|done)
- `dueAt`, `expectedOutcome`, `actualOutcome` (nullable)
- `createdBy`, `completedBy`, `verifiedBy` (UUID, FK to User)
- `createdAt`, `updatedAt`, `verifiedAt`, `completedAt` (DateTime)
- `version` (Int)

**Relationships:** belongsTo User (creator, completer, verifier)  
**Indexes:** `[engagementId, status]`, `[createdBy]`, `[status]`  
**Migration:** Initial load from in-memory store via seed script.  
**Acceptance:** All existing in-memory items insertable; queries return correct subsets by status.

### Model: CalibrationRecord
**Purpose:** Track predicted vs. actual impact for feedback loops.  
**Fields:**
- `id` (UUID, PK)
- `operatorItemId` (UUID, FK, unique with timestamp)
- `predictedImpact`, `actualImpact`, `confidence` (Decimal)
- `deviation` (Decimal, calculated)
- `createdAt` (DateTime)

**Relationships:** belongsTo OperatorItem  
**Indexes:** `[operatorItemId]`, `[createdAt]`  
**Migration:** Seed existing calibration records.  
**Acceptance:** Queries correctly filter by operator item; deviation calculation matches in-memory.

### Model: OverrideRecord
**Purpose:** Audit trail for action overrides.  
**Fields:**
- `id` (UUID, PK)
- `operatorItemId` (UUID, FK)
- `originalAction`, `overriddenAction` (String)
- `reason` (String)
- `overriddenBy` (UUID, FK to User)
- `createdAt`, `revokedAt` (DateTime)

**Relationships:** belongsTo OperatorItem, User  
**Indexes:** `[operatorItemId]`, `[overriddenBy]`  
**Migration:** Seed existing overrides.  
**Acceptance:** Overrides queryable by operator item; "revoked" overrides handled correctly.

### Model: Entity
**Purpose:** Business units, clients, projects linked to operator items.  
**Fields:**
- `id` (UUID, PK)
- `name` (String)
- `type` (String: business_unit|client|project)
- `externalId` (String, nullable, for third-party sync)
- `createdBy` (UUID, FK)
- `createdAt`, `updatedAt` (DateTime)

**Relationships:** belongsTo User (creator)  
**Indexes:** `[type, externalId]`, `[createdBy]`  
**Migration:** None (Phase 1–5 entities lightweight).  
**Acceptance:** Entities creatable and queryable; type filtering works.

### Model: EntityLink
**Purpose:** Many-to-many: Entities ↔ OperatorItems.  
**Fields:**
- `id` (UUID, PK)
- `entityId`, `operatorItemId` (UUID, FK)
- `linkType` (String: "owner"|"stakeholder"|"beneficiary")
- `createdAt` (DateTime)

**Relationships:** belongsTo Entity, OperatorItem  
**Indexes:** `[entityId, operatorItemId]` (unique), `[operatorItemId]`  
**Migration:** None (new).  
**Acceptance:** Links creatable; reverse queries return correct items per entity.

### Model: WebhookDelivery
**Purpose:** Audit external integrations; enable retry.  
**Fields:**
- `id` (UUID, PK)
- `eventName` (String)
- `operatorItemId` (UUID, FK, nullable)
- `url` (String)
- `payload` (Json)
- `status` (String: pending|success|failed|retrying)
- `responseCode`, `responseBody` (Int, Json, nullable)
- `retryCount`, `nextRetryAt` (Int, DateTime, nullable)
- `createdAt`, `sentAt` (DateTime)

**Relationships:** belongsTo OperatorItem  
**Indexes:** `[status, nextRetryAt]`, `[eventName, createdAt]`  
**Migration:** None (replaces console.log).  
**Acceptance:** Deliveries logged; status transitions correct; retry backoff calculable.

### Model: FinancialBaseline
**Purpose:** Store assumptions for impact calculations.  
**Fields:**
- `id` (UUID, PK)
- `engagementId` (UUID, FK, nullable)
- `revenue`, `costs` (Decimal)
- `currency` (String, default USD)
- `source` (String: user_provided|system_default|imported)
- `assumptions` (Json, stores multipliers, confidence thresholds)
- `createdBy` (UUID, FK)
- `createdAt` (DateTime)
- `validUntil` (DateTime, nullable)

**Relationships:** belongsTo User  
**Indexes:** `[engagementId]`, `[source]`  
**Migration:** Create default baseline (10000/5000) for seed.  
**Acceptance:** Baselines queryable; calculations reference baselines; audit trail captured.

### Migration Notes
1. Create migration: `npx prisma migrate dev --name add_phase_1_5_persistence`
2. Seed script: Migrate in-memory OperatorItem, CalibrationRecord, OverrideRecord to DB
3. Zero downtime: Dual-write pattern during transition (in-memory → DB → read from DB)
4. Verify: All Phase 1–5 APIs pass with database-backed data

### Acceptance Criteria (Global)
- ✅ All 8 models generate without errors
- ✅ Relationships and indexes created correctly
- ✅ Foreign keys enforced (cascading deletes or on-delete: restrict)
- ✅ Seed script runs without data loss
- ✅ Existing in-memory data survives migration
- ✅ Phase 1–5 APIs query/write correctly post-migration
- ✅ No breaking changes to API contracts

---

## 4. Auth Hardening Plan

**Strategy:** Reuse `src/services/auth.ts` (getSession, requireSession, requirePolicyContext).  
Remove role from request body. All mutations require server-side session.

### Implementation Pattern

Every Phase 1–5 mutation route must:

```typescript
import { requireSession } from "@/services/auth";

export async function POST(request: NextRequest) {
  const session = await requireSession(); // Throws UnauthorizedError if no session
  // session.user.id is authenticated actor
  // Proceed with DB mutation, emit audit event with session.user.id
}
```

### Auth Rules

1. **No role in request body.** Roles fetched from `db.userRoleAssignment` via session.
2. **Capability checks:** Use `requireCapability(session, capabilityName)` before mutations.
3. **Unauthorized returns 403 Forbidden** (fail-closed).
4. **Session validation:** Token from cookie, check expiry, revocation, user active status.
5. **Audit context:** All mutations log `actorId: session.user.id` to AuditEvent.

### Files to Modify

- `src/app/api/operator/route.ts` — Add requireSession (POST), replace role param
- `src/app/api/override/route.ts` — Add requireSession, check override capability
- `src/app/api/entity/route.ts` — Add requireSession (POST)
- `src/app/api/scenario/route.ts` — Add requireSession (POST)
- `src/app/api/run/route.ts` — Add requireSession (POST)
- `src/app/api/opsiq/consulting-engine/run/route.ts` — Add requireSession

### Acceptance Criteria

- ✅ No Phase 1–5 mutation accepts role parameter
- ✅ All mutations call requireSession() or error thrown
- ✅ Unauthorized requests return 403 with error message
- ✅ Session timeout/revocation blocks requests
- ✅ Actor ID logged in all audit events
- ✅ Existing auth.ts service functions cover all Phase 1–5 needs

---

## 5. Financial Credibility Plan
**Placeholder** — Will detail assumption capture, derivation chain, user-provided baselines, output transparency.

---

## 6. Audit Hardening Plan
**Placeholder** — Will detail event emission, snapshot capture, replay strategy, compliance mapping.

---

## 7. Webhook Hardening Plan
**Placeholder** — Will detail delivery table, HTTP sender, retry logic, safe-fail behavior.

---

## 8. Safety Hardening Plan
**Placeholder** — Will detail validation fixes, fail-closed enforcement, test coverage matrix.

---

## 9. API Contract Table

All Phase 1–5 endpoints. Auth column = "session" (requireSession) or "none" (read-only, public for now).

| Endpoint | Method | Input | Validation | Auth | DB Writes | Audit Event | Success (200) | Failure (400/403) |
|----------|--------|-------|-----------|------|-----------|-------------|---|---|
| `/api/run` | POST | `{revenue, cost}` | Both numbers, > 0 | session | OperatorItem, FinancialBaseline | decision_run | `{decisions[], impact{}}` | Invalid input, low confidence, NO_IMPACT |
| `/api/operator` | GET | none | — | session | none | — | `[OperatorItem[]]` sorted by priority | — |
| `/api/operator` | POST | `{id, status, actualOutcome}` | id exists, status valid, actualOutcome valid | session | OperatorItem, CalibrationRecord | operator_updated | `{success: true}` | Missing fields, item not found, high-impact blocked |
| `/api/override` | POST | `{operatorItemId, overriddenAction, reason}` | All required, action non-empty | session | OverrideRecord, OperatorItem | action_overridden | `{success: true}` | Missing fields, item not found, no capability |
| `/api/calibration` | GET | none | — | session | none | — | `{records[], summary{}}` | — |
| `/api/report` | GET | none | — | session | none | — | `{totalImpact, totalActions, completedActions, accuracyScore}` | — |
| `/api/entity` | GET | `?type=business_unit\|client\|project` | Optional type filter | session | none | — | `[Entity[]]` | Invalid type |
| `/api/entity` | POST | `{name, type}` | Both required, type valid | session | Entity | entity_created | `{id, name, type}` | Missing fields, invalid type |
| `/api/scenario` | POST | `{baseRevenue, baseCost, deltaRevenue, deltaCost}` | All numbers, base > 0 | session | FinancialBaseline (if new) | scenario_run | `{impactExpected, impactLow, impactHigh}` | Invalid input, low confidence, NO_IMPACT |
| `/api/opsiq/consulting-engine/run` | POST | engagement/consulting params | As defined by consulting engine | session | Recommendation, Action (via consulting logic) | consulting_run | Engine output | Invalid request, engine error |

**Notes:**
- All POST/PUT/DELETE mutations require `session` auth (will be updated from "none" where currently missing)
- GET endpoints inherit "session" auth (read access per engagement or global per role)
- Failures with auth return 403; input validation failures return 400
- Every mutation logs `auditEvent` with `actorId: session.user.id`
- OperatorItem creation/update persists to database (not in-memory)
- CalibrationRecord created on completion (actualOutcome provided, status=done)
- Policy check: impact > $100k requires approval (blocking POST until approved)

---

## 10. Test Matrix
**Placeholder** — Will detail unit, API, regression tests for all 8 P0 areas.

---

## 11. Implementation Sequence
**Placeholder** — Will detail 8 token-safe prompts, one per P0 blocker, with exact files and acceptance criteria.
