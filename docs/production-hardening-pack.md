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

**Goal:** Remove hardcoded values. Store assumptions. Enable audit trail of financial decisions.

### Problem
- `src/services/finance/normalize.ts` (lines 34–35): hardcoded 0.7, 1.3 multipliers
- `src/services/system/run.ts` (line 45): hardcoded baseline (10000, 5000)
- `src/app/api/run/route.ts` (lines 26–29): hardcoded revenueChange × 0.1, confidence = 0.75
- No tracking of which baseline was used for a decision

### Solution
1. **FinancialBaseline model** (Prisma): stores revenue, costs, multipliers, confidence thresholds, source, validity window
2. **User provides or selects baseline** at decision time (not hardcoded)
3. **Store assumptions with decision:** OperatorItem.assumptions (JSON) = {baseline_id, multipliers, confidence_threshold}
4. **Output includes source:** Impact response shows "derived from user-provided baseline from 2026-04-28"
5. **No false precision:** Show ranges (impactLow–impactHigh) not single number

### Implementation
- Remove hardcoded multipliers from normalize.ts; accept as parameter
- POST /api/run accepts optional `baselineId`; if absent, return 400 (require explicit baseline)
- POST /api/scenario requires baselineId; must exist in DB
- OperatorItem.assumptions captures full derivation chain
- /api/report includes baseline metadata

### Acceptance Criteria
- ✅ No hardcoded multipliers in code
- ✅ All impacts traceable to a FinancialBaseline row
- ✅ Baseline includes source (user_provided|system_default|imported)
- ✅ Impact output shows confidence and range, not precision
- ✅ Audit query can show "which baseline was used for this decision"

---

## 6. Audit Hardening Plan

**Goal:** Replace console.log with database-backed audit trail. Prove who did what and when.

### Problem
- `src/services/audit/log.ts` (line 4): only console.log(JSON.stringify(record))
- No persistence, no compliance trail, no replay capability
- Existing `src/infra/audit.ts` emitAuditEvent() unused by Phase 1–5

### Solution
1. **Replace console.log with emitAuditEvent()** in Phase 1–5 mutation paths
2. **Audit event schema** (already exists in AuditEvent model):
   - eventName (string): decision_run, operator_updated, action_overridden, entity_created, scenario_run
   - actorId (UUID): from session.user.id
   - entityType (string): OperatorItem, OverrideRecord, Entity
   - entityId (UUID): the affected record
   - payload (JSON): {before, after, rationale, baseline_id, confidence}
   - occurredAt (DateTime): server timestamp
   - visibility: "internal"

3. **Snapshot strategy:** Store before/after snapshots in payload for all mutations
4. **Replay capability:** Decision output stored in payload; can reconstruct inputs+outputs

### Implementation
- Every Phase 1–5 mutation calls emitAuditEvent() with actorId, entityType, entityId, payload
- Payload = {before: OperatorItem?, after: OperatorItem, rationale: "why this action"}
- POST /api/operator → eventName: "operator_updated"
- POST /api/override → eventName: "action_overridden"
- POST /api/entity → eventName: "entity_created"
- API /api/audit/events (GET) returns queryable event log (existing pattern)

### Acceptance Criteria
- ✅ All mutations emit audit events to database
- ✅ No console.log in mutation paths
- ✅ Actor ID always present and matches session user
- ✅ Before/after snapshots included for all state changes
- ✅ Query /api/audit/events returns full trail
- ✅ Compliance-ready: 90-day retention, tamper-proof

---

## 7. Webhook Hardening Plan

**Goal:** Replace console.log with reliable HTTP delivery. Track failures. Enable retries.

### Problem
- `src/services/integration/webhook.ts` (line 4): only console.log("Webhook:", event)
- Called from `/api/operator` (line 95) on action completion
- No HTTP delivery, no retry, no external system knows action completed

### Solution
1. **Use WebhookDelivery model** (created in Prisma plan): tracks delivery attempts
2. **Endpoint on action completion:**
   - Create WebhookDelivery row: status=pending, url=config.webhook_url (from env/config)
   - If no URL configured, status=skipped (fail safely)
   - Queue async delivery (job queue or next request)

3. **Delivery sender** (`src/services/integration/webhook.ts` rewritten):
   ```
   async function deliverWebhook(webhookId: uuid) {
     const delivery = await db.webhookDelivery.findUnique({where: {id: webhookId}})
     const response = await fetch(delivery.url, {
       method: POST, body: JSON.stringify(delivery.payload), timeout: 10s
     })
     if (success) { update(delivery, {status: success, sentAt: now}) }
     else { retry if retryCount < 3, exponential backoff }
   }
   ```

4. **Retry logic:**
   - Retry up to 3 times
   - Backoff: 5s, 25s, 125s
   - status transitions: pending → retrying → success|failed
   - failed deliveries queryable for debugging

5. **Safe fail:** If webhook URL missing or delivery fails after retries, log but don't block action

### Implementation
- POST /api/operator completion creates WebhookDelivery row (not console.log)
- Background job or cron runs deliverWebhook() for pending rows
- GET /api/webhooks/delivery returns delivery status and logs

### Acceptance Criteria
- ✅ No console.log in webhook code
- ✅ All deliveries persist to WebhookDelivery table
- ✅ Missing URL → status=skipped (no error)
- ✅ Failed delivery retried 3× with exponential backoff
- ✅ Success/failure logged and queryable
- ✅ Action completion not blocked by webhook failure

---

## 8. Safety Hardening Plan

**Goal:** Fix broken fail-closed logic. Ensure dangerous inputs are rejected.

### Problems (3 Failing Tests)

1. **Low Confidence NOT blocked:** `src/services/system/run.ts` (line 50) clamps confidence to 0.4 before validation
   - Input: confidence = 0.3
   - Bug: clamp(0.3 → 0.4) bypasses threshold check in calculateImpact()
   - Fix: Validate confidence BEFORE clamping

2. **Zero Impact NOT blocked:** `src/services/finance/normalize.ts` checks deltaRevenue/deltaCost vs 0, not final impact
   - Input: revenue=0, cost=0, but hardcoded baseline (10000, 5000) produces non-zero impact
   - Fix: Check final impact amount, not just deltas

3. **Confidence field undefined:** ImpactEstimate returns confidenceWeight not confidence
   - Test expects result.impact.confidence
   - Fix: Rename field to confidence or export both

### Implementation

**File: src/services/finance/normalize.ts**
- Validate confidence < 0.4 BEFORE clamp(confidence, 0, 1)
- Throw LOW_CONFIDENCE_BLOCKED if < 0.4

**File: src/services/system/run.ts**
- Validate impact != 0 AFTER calculateImpact()
- Throw NO_IMPACT if impactExpected === 0

**File: src/domain/finance/types.ts**
- Rename ImpactEstimate.confidenceWeight → confidence

**File: src/__tests__/backbone.test.ts**
- All 3 tests must pass
- Add regression tests: low confidence blocks, zero impact blocks, good input passes

### Acceptance Criteria
- ✅ backbone.test.ts all 3 tests pass
- ✅ Low confidence (< 0.4) always throws LOW_CONFIDENCE_BLOCKED
- ✅ Zero impact always throws NO_IMPACT
- ✅ Invalid inputs return 400 from APIs
- ✅ Safety checks cannot be bypassed by clamp/defaults
- ✅ No hardcoded baseline masks invalid inputs

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

| Area | Unit Test | API Test | Acceptance Criteria |
|------|-----------|----------|---|
| **Persistence** | OperatorItem, CalibrationRecord, OverrideRecord CRUD | POST /api/operator, POST /api/override persists | Data survives DB query after POST; in-memory ≠ DB |
| **Auth** | requireSession throws on invalid token | Unauthenticated POST returns 403 | No endpoint accepts unauthenticated mutation |
| **Financial** | calculateImpact rejects confidence < 0.4 | POST /api/run validates baseline_id | Hardcoded values removed; baseline required |
| **Audit** | emitAuditEvent writes to DB | POST /api/operator emits decision_run | All mutations create AuditEvent row; queryable |
| **Safety** | Low confidence throws, zero impact throws | POST /api/run rejects invalid input | backbone.test.ts all 3 tests pass |
| **Webhooks** | WebhookDelivery model CRUD | POST /api/operator creates pending delivery | No console.log; delivery row created; status tracked |
| **Role Removal** | Fixture: no role param in POST bodies | Grep all routes for "role" in body | Zero occurrences of role from request body |
| **Policy** | evaluatePolicy returns requiresApproval | POST /api/operator blocks >$100k impact | High-impact items blocked until approved |

**Run Checks (all P0):**
```bash
npm test                          # backbone.test.ts + new tests pass
npm run typecheck                 # No TS errors
npm run lint                      # No lint warnings
grep -r "console.log" src/app/api/operator src/app/api/override src/services/audit src/services/integration  # Should be empty
grep -r "let store.*=" src/services/operator src/services/override src/services/entity  # Should be empty (migrated to DB)
```

---

## 11. Implementation Sequence

### P0.1 Prompt: Add Prisma Models & Migrate Persistence

**Files to modify:** `prisma/schema.prisma`, `prisma/migrations/*.sql`, `src/infra/seed.ts`

**Task:** Create 8 models (OperatorItem, CalibrationRecord, OverrideRecord, Entity, EntityLink, WebhookDelivery, FinancialBaseline, AuditEvent if missing). Add UUID PKs, FKs to User, timestamps, indexes. Run migration. Seed in-memory data to DB.

**Checks:** `npx prisma generate`, `npx prisma migrate dev`, `npx prisma db seed` succeed. All 8 tables exist in database.

---

### P0.2 Prompt: Add Session Auth to Phase 1–5 APIs

**Files to modify:** `src/app/api/operator/route.ts`, `src/app/api/override/route.ts`, `src/app/api/entity/route.ts`, `src/app/api/scenario/route.ts`, `src/app/api/run/route.ts`

**Task:** Import requireSession from `src/services/auth`. Add `const session = await requireSession()` at start of every POST handler. Return 403 if unauthorized. Remove role parameter from request body. Use `session.user.id` as actorId in audit event.

**Checks:** `npm test`, `npm run typecheck`. Unauthenticated POST returns 403. No role param in any request body.

---

### P0.3 Prompt: Remove Role-from-Body Authorization

**Files to modify:** All 6 mutation API routes (same as P0.2)

**Task:** Delete `const { role } = body` lines. Delete canEdit/canView calls. Replace with requireCapability(session, capabilityName) or implicit permission from requireSession.

**Checks:** Grep returns 0 matches for `role.*body` or `body.*role`. TypeCheck passes.

---

### P0.4 Prompt: Remove Hardcoded Baselines & Store Assumptions

**Files to modify:** `src/services/finance/normalize.ts`, `src/services/system/run.ts`, `src/app/api/run/route.ts`, `src/app/api/scenario/route.ts`, `src/domain/finance/types.ts`

**Task:** Remove hardcoded baseline (10000, 5000) from runSystem. Remove hardcoded multipliers (0.7, 1.3). Make calculateImpact accept multipliers as params. POST /api/run requires `baselineId` param (return 400 if missing). OperatorItem.assumptions stores {baseline_id, multipliers, confidence_threshold}.

**Checks:** `npm test` (financial unit tests pass). grep finds 0 hardcoded multipliers in code. No baseline creation without explicit source.

---

### P0.5 Prompt: Emit Audit Events for All Mutations

**Files to modify:** `src/app/api/operator/route.ts`, `src/app/api/override/route.ts`, `src/app/api/entity/route.ts`, `src/app/api/scenario/route.ts`, `src/app/api/run/route.ts`

**Task:** Import emitAuditEvent from `src/infra/audit`. After every DB mutation, call emitAuditEvent({eventName: "operator_updated", actorId: session.user.id, entityType: "OperatorItem", entityId: item.id, payload: {before, after}}).

**Checks:** `npm test`. Query database: `SELECT COUNT(*) FROM audit_events WHERE event_name='operator_updated'` > 0.

---

### P0.6 Prompt: Fix Fail-Closed Safety Checks

**Files to modify:** `src/services/finance/normalize.ts`, `src/services/system/run.ts`, `src/domain/finance/types.ts`, `src/__tests__/backbone.test.ts`

**Task:** Validate confidence < 0.4 BEFORE clamping. Validate final impact != 0 AFTER calculateImpact. Rename confidenceWeight → confidence in ImpactEstimate. Update tests to match.

**Checks:** `npm test` passes all 3 backbone tests (high risk scenario, low confidence blocked, zero impact blocked). No clamp before validation.

---

### P0.7 Prompt: Persist Webhooks to DB with Retry Logic

**Files to modify:** `src/services/integration/webhook.ts`, `src/app/api/operator/route.ts`

**Task:** Replace console.log. On action completion, create WebhookDelivery row (status: pending, url: process.env.WEBHOOK_URL, payload: action snapshot). If no URL, skip. Add async delivery function with 3-retry backoff (5s, 25s, 125s).

**Checks:** No console.log in webhook code. WebhookDelivery table has rows. grep returns 0 for `console.log.*webhook`.

---

### P0.8 Prompt: Fix Failing Tests

**Files to modify:** `src/__tests__/backbone.test.ts`

**Task:** Ensure all 3 backbone tests pass (high risk scenario, low confidence blocked, zero impact blocked). Fix field names (confidence vs confidenceWeight). Update test setup to not use hardcoded baseline.

**Checks:** `npm test -- src/__tests__/backbone.test.ts` all pass. No skipped tests.
