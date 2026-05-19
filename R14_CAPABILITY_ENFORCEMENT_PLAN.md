# R14: Capability Trust Closure - Implementation Plan

**Status:** Planning  
**Priority:** CRITICAL - Security hardening  
**Scope:** Close all capability bypass vectors

---

## Problem Statement

Current authorization gaps:
- 25 routes with NO capability enforcement
- 37 routes still bypass verified context by using x-workspace-id header
- 52 service functions don't validate capability envelopes
- Only 4 routes have defensive capability checks
- Role-only checks that skip capability resolution

**Risk:** Authenticated users can bypass capability checks and access operations they shouldn't

---

## R14 Objectives

1. **NO NEW IDENTITY** - Use R13's verified session/workspace
2. **NO NEW AUTH** - Use existing capability system
3. **FAIL CLOSED** - Default deny if capability missing
4. **AUDIT ALL** - Every capability decision in audit trail
5. **SERVICE LAYER** - Prevent direct service bypass
6. **REMOVE SHORTCUTS** - No role-only checks

---

## Implementation Strategy

### Phase 1: Core Framework (Already started)
✅ Create `capability-enforcement.ts`:
- CapabilityEnvelope: Proof that route verified capability
- ServiceCapabilityContext: What services receive
- verifyCapabilityFromPolicy(): Route layer verification
- requireCapabilityEnvelope(): Service layer validation
- auditCapabilityDecision(): Audit trail generation

### Phase 2: Route Framework Updates (Next)
Update `withCanonicalEnforcement` wrapper:
1. Generate CapabilityEnvelope for verified capabilities
2. Pass envelope to handler via context
3. Audit capability decisions
4. Fail closed if capability missing

### Phase 3: Critical Route Fixes (Next)
Fix 25 vulnerable routes:
1. Add `requireCapabilities` parameter to wrapper
2. Remove x-workspace-id header bypasses
3. Use verified context instead of headers
4. Add defensive checks in handlers
5. Pass capability envelope to services

Critical routes (by risk):
- `POST /api/decisions/*` - Can modify decisions without capability
- `POST /api/recommendations/*` - Can modify recommendations
- `POST /api/engagements/[id]/actions/*` - Can create actions
- `POST /api/notifications` - Can create notifications
- `POST /api/billing/upgrade` - Can modify billing

### Phase 4: Service Layer Hardening (Next)
Update 52 service functions:
1. Add ServiceCapabilityContext parameter
2. Call `requireCapabilityEnvelope()` on entry
3. Fail if envelope missing or decision is DENIED
4. Audit service execution with capability

Pattern:
```typescript
export async function updateRecommendation(
  capContext: ServiceCapabilityContext,
  recommendationId: string,
  updates: UpdateInput
) {
  // Fail closed: validate envelope
  requireCapabilityEnvelope(
    capContext.capability,
    CAPABILITIES.RECOMMENDATION_UPDATE
  );

  // Proceed with verified authorization
  const result = await db.recommendation.update(...);
  
  // Audit the operation
  await capContext.auditCapabilityCheck("GRANTED", "Operation completed");
  
  return result;
}
```

### Phase 5: Audit Integration (Next)
Every capability check must emit audit event with:
- Actor ID
- Workspace ID
- Capability name
- Decision (GRANTED/DENIED)
- Scope (if applicable)
- Timestamp

Format:
```
{
  eventType: "CAPABILITY_CHECK",
  actor: "user-123",
  workspace: "ws-456",
  capability: "RECOMMENDATION_UPDATE",
  decision: "GRANTED",
  scope: { type: "engagement", id: "eng-789" },
  timestamp: 2026-05-19T14:30:00Z
}
```

---

## Execution Roadmap

### Step 1: Framework Complete
✅ capability-enforcement.ts created
⏳ Update canonical wrapper
⏳ Update auth context type

### Step 2: High-Risk Routes
[ ] Decisions routes (8 routes)
[ ] Recommendations routes (5 routes)
[ ] Actions routes (6 routes)

### Step 3: Medium-Risk Routes
[ ] Billing routes (3 routes)
[ ] Notifications routes (4 routes)
[ ] Operators routes (4 routes)

### Step 4: Service Integration
[ ] Update createRecommendation
[ ] Update updateRecommendation
[ ] Update approveRecommendation
[ ] Update createAction
[ ] Update updateAction
[ ] Update createDecision
[ ] Update closeDecision

### Step 5: Testing & Validation
[ ] Scenario A: Valid session + missing capability → 403
[ ] Scenario B: Valid session + correct capability → 200
[ ] Scenario C: Cross-workspace spoof → 403
[ ] Scenario D: Service bypass attempt → blocked
[ ] Scenario E: Audit trail complete

---

## Critical Implementation Details

### 1. Removing x-workspace-id Bypass

**CURRENT (Vulnerable):**
```typescript
const workspaceId = req.headers.get("x-workspace-id") || "";
```

**FIXED (R13+R14):**
```typescript
const workspaceId = ctx.verifiedWorkspaceId; // From canonical wrapper
```

### 2. Capability Declaration Pattern

**CURRENT:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx) => { /* no capability check */ }
);
```

**FIXED:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx) => {
    requireCapabilityEnvelope(
      ctx.capabilityEnvelope,
      CAPABILITIES.RECOMMENDATION_CREATE
    );
    // Handler now has proven capability
  },
  { requireCapabilities: [CAPABILITIES.RECOMMENDATION_CREATE] }
);
```

### 3. Service Call Pattern

**CURRENT:**
```typescript
async function createRecommendation(
  authContext: CanonicalAuthContext,
  input: CreateInput
) {
  // No capability validation!
  return db.recommendation.create(input);
}

// Can be called anywhere without capability check
```

**FIXED:**
```typescript
async function createRecommendation(
  capContext: ServiceCapabilityContext,  // <- New parameter
  input: CreateInput
) {
  // Fail closed: validate capability envelope
  requireCapabilityEnvelope(
    capContext.capability,
    CAPABILITIES.RECOMMENDATION_CREATE
  );
  
  // Proceed with verified authorization
  const result = await db.recommendation.create(input);
  
  // Audit the service call
  await capContext.auditCapabilityCheck("GRANTED");
  
  return result;
}

// Safe: can only be called from routes that verified capability
```

### 4. Audit Envelope Structure

Every decision is audited:
```typescript
{
  timestamp: "2026-05-19T14:30:00Z",
  eventType: "CAPABILITY_CHECK",
  detail: {
    actor: "user-123",
    actorType: "user",
    workspace: "workspace-456",
    capability: "RECOMMENDATION_CREATE",
    decision: "GRANTED" | "DENIED",
    scope: { type: "engagement", id: "eng-789" },
    trace: "Actor has ADMIN role with all capabilities"
  }
}
```

---

## Verification Criteria

### Runtime Proof Scenarios

**Scenario A: Valid Session + Missing Capability**
```bash
# User has VIEWER role, tries RECOMMENDATION_CREATE
Request: POST /api/recommendations
Auth: ✅ Valid session
Capability: ❌ VIEWER lacks RECOMMENDATION_CREATE
Expected: HTTP 403 FORBIDDEN
Audit: capability=RECOMMENDATION_CREATE, decision=DENIED
```

**Scenario B: Valid Session + Correct Capability**
```bash
# User has ADMIN role, creates recommendation
Request: POST /api/recommendations
Auth: ✅ Valid session
Capability: ✅ ADMIN has RECOMMENDATION_CREATE
Expected: HTTP 200 SUCCESS
Audit: capability=RECOMMENDATION_CREATE, decision=GRANTED
```

**Scenario C: Cross-Workspace Capability Spoof**
```bash
# User from workspace-a tries to create in workspace-b with forged header
Request: POST /api/recommendations
Header: X-Workspace-Id: workspace-b (forged, ignored)
Auth: ✅ Valid session for workspace-a
Workspace: ❌ Mismatch (a ≠ b)
Expected: HTTP 403 FORBIDDEN
Audit: workspace mismatch detected
```

**Scenario D: Service Direct Call Bypass Attempt**
```typescript
// Attacker tries to call service directly without capability envelope
const maliciousCall = await createRecommendation(
  { verifiedActorId: "user-123", ... },  // No capability envelope
  { title: "Evil recommendation" }
);

// Service entry point:
function createRecommendation(capContext: ServiceCapabilityContext) {
  if (!capContext?.capability) {
    throw new ForbiddenError("Capability verification required");  // ✅ BLOCKED
  }
  // ... proceed
}
```

**Scenario E: Complete Audit Trail**
```typescript
Audit Event:
{
  timestamp: "2026-05-19T14:35:00Z",
  eventType: "CAPABILITY_CHECK",
  detail: {
    actor: "user-123",
    actorType: "user",
    workspace: "workspace-456",
    capability: "RECOMMENDATION_CREATE",
    decision: "GRANTED",
    scope: null,
    trace: "ADMIN role grants all capabilities"
  }
}
```

---

## Files to Create/Modify

### New Files
- ✅ `src/lib/capability-enforcement.ts` - Framework
- [ ] `src/app/api/__tests__/r14-capability-closure.test.ts` - Runtime tests

### Files to Modify
- [ ] `src/lib/canonical-route-enforcement.ts` - Add envelope generation
- [ ] `src/lib/canonical-auth-facts.ts` - Add capability facts
- [ ] `src/lib/canonical-route-enforcement.ts` - Pass envelope to handlers
- [ ] `src/policies/capability-check.ts` - Update exports

### Routes to Fix (25 total)

**Decisions (3):**
- [ ] `/api/decisions/list`
- [ ] `/api/decisions/submit-external` (PUBLIC - skip)
- [ ] `/api/decision-intake` (if exists)

**Recommendations (5):**
- [ ] `/api/recommendations/[id]` - Add RECOMMENDATION_VIEW
- [ ] POST recommendations endpoints - Add RECOMMENDATION_CREATE/UPDATE

**Actions (6):**
- [ ] `/api/engagements/[id]/actions` - Add ACTION_VIEW
- [ ] `/api/engagements/[id]/actions/[id]` - Add ACTION_UPDATE

**Operators (4):**
- [ ] `/api/operator/my-day`
- [ ] `/api/operator/myday`
- [ ] `/api/operator/queue`
- [ ] `/api/operator` (root)

**Billing (3):**
- [ ] `/api/billing/plan` - Add BILLING_VIEW
- [ ] `/api/billing/usage` - Add BILLING_VIEW
- [ ] `/api/billing/upgrade` - Add BILLING_UPDATE

**Others (4):**
- [ ] `/api/me` - Add USER_VIEW (self)
- [ ] `/api/entity` - Add SYSTEM_ADMIN or specific cap
- [ ] `/api/notifications` routes - Add NOTIFICATION_* caps
- [ ] `/api/governance/alerts` - Add SYSTEM_VIEW_AUDIT

### Services to Update (Focus on write operations)
- [ ] `services/recommendation.ts` - Create, update, approve
- [ ] `services/action.ts` - Create, update
- [ ] `services/decisions/*.ts` - Close, decide
- [ ] `services/engagement.ts` - Create, update
- [ ] And ~45 others

---

## Success Criteria

✅ All 25 vulnerable routes have capability checks
✅ All 52 service write functions validate envelopes
✅ No routes use x-workspace-id for workspace determination
✅ 100% of capability checks emit audit events
✅ All 5 runtime scenarios pass
✅ Zero test regressions
✅ TypeScript compilation clean

---

## Timeline

- Phase 1 (Framework): ✅ 30 min (done)
- Phase 2 (Wrapper Updates): 1 hour
- Phase 3 (Route Fixes): 2-3 hours
- Phase 4 (Service Updates): 2-3 hours
- Phase 5 (Testing): 1 hour

**Total: 6-7 hours to production-ready**

---

## Risk Mitigation

- **Backward Compatibility:** ServiceCapabilityContext is new - old services will fail at type check (forcing explicit migration)
- **Service Bypass:** Fail closed on missing envelope
- **Header Bypass:** Ignore x-workspace-id, use verified context only
- **Audit Trail:** Every check is logged
- **Cross-tenant:** Workspace verified in session layer before capability check

