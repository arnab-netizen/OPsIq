# Service-Layer Actor Spoofing: Refactoring Plan

**Date**: 2026-05-02  
**Status**: 🟡 PARTIALLY COMPLETE (findings.ts done, 12+ services remaining)  
**Severity**: HIGH - User spoofing vulnerability at service layer

## Quick Status
- ✅ findings.ts: REFACTORED - createFinding, updateFinding now require authContext
- ✅ findings/route.ts: Updated to pass authContext
- ✅ findings/[findingId]/route.ts: Updated to pass authContext
- ⏳ 12+ remaining services: Ready for systematic refactoring (use findings.ts as template)
- 🔴 Test files: Still need updates to call refactored services with authContext

---

## Vulnerability Summary

Current Pattern (VULNERABLE):
```typescript
export async function createFinding(
  input: CreateFindingInput,
  actorId: string,        // ❌ Caller can pass ANY actorId
  workspaceId: string     // ❌ Caller can pass ANY workspaceId
) { ... }

// Called from route:
const actorId = "spoofed-user-id";
const result = await createFinding(input, actorId, workspaceId);
// Finding created with spoofed actorId
```

### Impact
- Any caller can spoof any user ID
- Audit trails are corrupted (false attribution)
- Service-to-service calls can bypass auth
- Internal services can blame other users

### Affected Services (13 critical + many read functions)

**Mutation Functions (Accept actorId)**:
1. `findings.ts`: createFinding, updateFinding
2. `recommendation.ts`: createRecommendation, updateRecommendationStatus
3. `evidence.ts`: createEvidence, updateEvidence, createEvidenceBundle
4. `lead.ts`: createLead, updateLead
5. `kpi.ts`: createKPI, updateKPIValue
6. `user.ts`: createUser, updateUser
7. `shock-event.ts`: createShockEvent, updateShockEvent
8. `client-contact.ts`: createContact, updateContact
9. `stage.ts`: createStage, updateStage
10. `deliverable.ts`: createDeliverable, updateDeliverableReviewStatus
11. `action.ts`: createAction, updateAction, updateActionStatus
12. `engagement.ts`: createEngagement, updateEngagement
13. `diagnosis.ts`: diagnoseBusiness

**Read Functions (Accept workspaceId)**:
- All list/get functions in above services
- ~20+ functions total

---

## Refactoring Pattern

### BEFORE (Vulnerable)
```typescript
export async function createFinding(
  input: CreateFindingInput,
  actorId: string,
  workspaceId: string
): Promise<{ id: string; engagementId: string }> {
  enforceWorkspaceId(workspaceId, "createFinding", "finding");
  
  // ... implementation uses actorId and workspaceId directly
  await db.finding.create({
    data: {
      // ... 
      createdBy: actorId,  // User-supplied value!
      workspaceId: workspaceId,  // User-supplied value!
    }
  });
}
```

### AFTER (Secure)
```typescript
import type { AuthContext } from "@/lib/auth-guard";
import { requireServiceAuth, requireWorkspaceContext } from "@/lib/service-auth";

export async function createFinding(
  input: CreateFindingInput,
  authContext: AuthContext,
  workspaceId: string  // Still passed for validation only
): Promise<{ id: string; engagementId: string }> {
  // Extract from authContext only
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
  
  // ... implementation
  await db.finding.create({
    data: {
      // ...
      createdBy: userId,  // From authenticated session
      workspaceId: validatedWorkspaceId,  // Validated
    }
  });
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (✅ DONE)
- ✅ service-auth.ts with requireServiceAuth, requireServiceContext
- ✅ Tests verifying patterns
- ✅ CLAUDE.md rules updated (no TODOs, no spoofing)

### Phase 2: Critical Mutation Services (🟡 PARTIALLY DONE)
Refactor these in order (all accept actorId):
1. ✅ findings.ts (createFinding, updateFinding refactored)
   - ✅ Function signatures changed to require authContext
   - ✅ Route handlers updated (findings/route.ts, findings/[findingId]/route.ts)
   - ⏳ Test file needs updating
2. [ ] recommendation.ts (3 mutations: createRecommendation, updateRecommendationStatus)
3. [ ] evidence.ts (3 mutations: createEvidence, updateEvidence, createEvidenceBundle)
4. [ ] lead.ts (2 mutations: createLead, updateLead)
5. [ ] kpi.ts (2 mutations: createKPI, updateKPIValue)
6. [ ] user.ts (2 mutations: createUser, updateUser)
7. [ ] shock-event.ts (2 mutations: createShockEvent, updateShockEvent)
8. [ ] client-contact.ts (2 mutations: createContact, updateContact)
9. [ ] stage.ts (2 mutations: createStage, updateStage)
10. [ ] deliverable.ts (2 mutations: createDeliverable, updateDeliverableReviewStatus)
11. [ ] action.ts (3 mutations: createAction, updateAction, updateActionStatus)
12. [ ] engagement.ts (2 mutations: createEngagement, updateEngagement)
13. [ ] diagnosis.ts (1 mutation: diagnoseBusiness)

### Phase 3: Read Functions (workspaceId only)
Refactor list/get functions to require authContext for consistency

### Phase 4: Update All Callers
Routes, jobs, internal services that call the refactored functions

### Phase 5: Testing & Verification
- Cross-tenant access tests
- Spoofing prevention tests
- Integration tests

---

## Refactoring Checklist (Template for Each Service)

For each service function:

1. **Signature Change**
   - [ ] Add import: `import type { AuthContext } from "@/lib/auth-guard";`
   - [ ] Add import: `import { requireServiceContext } from "@/lib/service-auth";`
   - [ ] Remove `actorId: string` parameter
   - [ ] Keep `workspaceId: string` for validation (passed from route)
   - [ ] Add `authContext: AuthContext` parameter (BEFORE workspaceId)
   - [ ] Update ALL affected functions in service

2. **Function Body Changes**
   - [ ] ADD as first line: `const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);`
   - [ ] Replace ALL `actorId` references → `userId`
   - [ ] Replace ALL `workspaceId` (parameter) → `validatedWorkspaceId`
   - [ ] Update audit events: `actorId: userId,` (NOT `actorId,`)
   - [ ] Update re-evaluation triggers: `triggeredBy: userId,`

3. **Database Queries**
   - [ ] Change `createdBy: actorId,` → `createdBy: userId,`
   - [ ] Change `workspaceId: workspaceId,` → `workspaceId: validatedWorkspaceId,`
   - [ ] Check WHERE clauses for workspaceId filters (should include `workspaceId: validatedWorkspaceId`)

4. **Route Handler Updates**
   - [ ] Find all routes calling this service: `grep -r "serviceName\(" src/app/api --include="*.ts" -l`
   - [ ] For each route:
     - [ ] Ensure it uses `const { session, policy } = await withAuth(...);` (get both)
     - [ ] Change call from: `serviceFunc(..., session.user.id, workspaceId)` 
     - [ ] Change call to: `serviceFunc(..., { session, policy }, workspaceId)`

5. **Test File Updates**
   - [ ] Find: `grep -r "serviceName\(" src/services --include="*.test.ts"`
   - [ ] For each test call site:
     - [ ] Create mockAuthContext (see example below)
     - [ ] Change call from: `serviceFunc(..., userId, workspaceId)`
     - [ ] Change call to: `serviceFunc(..., authContext, workspaceId)`

6. **Integration Test Updates**
   - [ ] Update `beforeAll` fixtures to pass authContext
   - [ ] Update all test cases that call the service

7. **Verification**
   - [ ] Run TypeScript: `npm run build` (should catch all missing updates)
   - [ ] Run tests: `npm test` (should pass with new signatures)
   - [ ] Verify no orphaned callers using old signature

## Example: How to Create mockAuthContext in Tests

```typescript
import type { AuthContext } from "@/lib/auth-guard";

const createMockAuthContext = (userId: string): AuthContext => ({
  session: {
    user: {
      id: userId,
      email: "test@example.com",
      name: "Test User",
      isActive: true,
    },
    sessionId: "session-123",
    expiresAt: new Date(Date.now() + 86400000),
  },
  policy: {
    userId,
    roles: [{ role: "admin" as const }],
  },
});

// Usage:
const authContext = createMockAuthContext("real-user-id");
const result = await createFinding(input, authContext, workspaceId);
```

---

## Critical Files to Update

### Services (Mutation Functions)
- src/services/findings.ts
- src/services/recommendation.ts
- src/services/evidence.ts
- src/services/lead.ts
- src/services/kpi.ts
- src/services/user.ts
- src/services/shock-event.ts
- src/services/client-contact.ts
- src/services/stage.ts
- src/services/deliverable.ts
- src/services/action.ts
- src/services/engagement.ts
- src/services/diagnosis.ts

### Route Handlers (Call Sites)
- src/app/api/findings/route.ts
- src/app/api/recommendations/route.ts
- src/app/api/evidence/route.ts
- src/app/api/leads/route.ts
- src/app/api/kpi/route.ts (if exists)
- src/app/api/users/route.ts
- src/app/api/shock-events/route.ts (if exists)
- src/app/api/clients/[id]/contacts/route.ts
- src/app/api/engagements/[id]/stages/route.ts
- src/app/api/deliverables/route.ts
- src/app/api/actions/route.ts
- src/app/api/engagements/route.ts
- src/app/api/diagnosis/route.ts (if exists)

### Test Files
- src/services/*.test.ts (all mutation service tests)

---

## Real Example: findings.ts Refactoring (✅ COMPLETE)

This service has been refactored. Use it as the template for other services.

### Changes Made

**File**: `src/services/findings.ts`

**Imports Added**:
```typescript
import { requireServiceContext } from "@/lib/service-auth";
import type { AuthContext } from "@/lib/auth-guard";
```

**createFinding - BEFORE**:
```typescript
export async function createFinding(
  input: CreateFindingInput,
  actorId: string,      // ❌ Vulnerable - any caller can pass any ID
  workspaceId: string
): Promise<{ id: string; engagementId: string }> {
  enforceWorkspaceId(workspaceId, "createFinding", "finding");
  // ...
  const finding = await db.finding.create({
    data: {
      // ...
      createdBy: actorId,  // ❌ User-supplied value
      workspaceId,         // ❌ User-supplied value
    },
  });
```

**createFinding - AFTER**:
```typescript
export async function createFinding(
  input: CreateFindingInput,
  authContext: AuthContext,     // ✅ Authenticated session
  workspaceId: string
): Promise<{ id: string; engagementId: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
  // ...
  const finding = await db.finding.create({
    data: {
      // ...
      createdBy: userId,          // ✅ From authenticated session
      workspaceId: validatedWorkspaceId,  // ✅ Validated
    },
  });
```

**updateFinding - BEFORE**:
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  actorId: string,      // ❌ Vulnerable
  workspaceId: string
): Promise<{ id: string }> {
```

**updateFinding - AFTER**:
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  authContext: AuthContext,     // ✅ Authenticated session
  workspaceId: string
): Promise<{ id: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
```

### Route Handler Updates

**File**: `src/app/api/findings/route.ts` (POST handler)

**BEFORE**:
```typescript
const { session } = await withAuth({
  capability: CAPABILITIES.FINDING_CREATE,
});
// ...
const result = await createFinding(body, session.user.id, workspaceId);
```

**AFTER**:
```typescript
const { session, policy } = await withAuth({  // ✅ Extract both
  capability: CAPABILITIES.FINDING_CREATE,
});
// ...
const result = await createFinding(body, { session, policy }, workspaceId);  // ✅ Pass authContext
```

**File**: `src/app/api/findings/[findingId]/route.ts` (PATCH handler)

Same pattern applied.

### Security Improvement

- ❌ **BEFORE**: Attacker can call `createFinding(input, "admin-id", workspaceId)`
- ✅ **AFTER**: Attacker cannot pass rawactorId (type mismatch) - MUST use authContext from withAuth()

---

## Copy This Template for Other Services

To refactor another service (e.g., recommendation.ts):

1. Open `src/services/recommendation.ts`
2. Add imports (copy from findings.ts lines 1-15)
3. Find `createRecommendation` function (around line 100)
4. Change signature: add `authContext: AuthContext,` before `workspaceId`
5. Add as first line: `const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);`
6. Replace all `actorId` → `userId` in the function
7. Replace all `workspaceId` (param) → `validatedWorkspaceId` in function body
8. Update callers: grep for `createRecommendation` in src/app/api
9. Update route handlers to pass `{ session, policy }` instead of `session.user.id`
10. Run `npm run build` to verify all callers are updated
11. Run `npm test` to verify tests pass

---

## Testing Strategy

### Test 1: Missing authContext
```typescript
it("throws if authContext missing", async () => {
  await expect(
    createFinding(input, null, workspaceId)
  ).rejects.toThrow("Service requires authentication context");
});
```

### Test 2: Spoofing Prevention
```typescript
it("ignores caller-supplied actorId", async () => {
  const authContext = createMockAuthContext("real-user-id");
  const result = await createFinding(input, authContext, workspaceId);
  
  // Finding should have createdBy = real-user-id, not any spoofed value
  expect(result.createdBy).toBe("real-user-id");
});
```

### Test 3: Cross-Tenant Rejection
```typescript
it("rejects mismatched workspaceId", async () => {
  const authContext = createMockAuthContext("user-id");
  await expect(
    createFinding(input, authContext, "different-workspace-id")
  ).rejects.toThrow("workspace");
});
```

---

## Expected Outcomes

### Before
- ❌ Any caller can pass any actorId
- ❌ Audit trails can be spoofed
- ❌ No protection at service layer
- ❌ User spoofing = trivial

### After
- ✅ Services extract userId from authContext only
- ✅ Caller cannot override userId
- ✅ Audit trails are tamper-proof
- ✅ User spoofing = impossible at service layer

---

## Rollout Plan

### Phase 1: Infrastructure (DONE)
- service-auth.ts helpers
- Tests for patterns

### Phase 2: Critical Services (NEXT)
- Refactor mutation functions in order
- Update test files
- Run full test suite after each service

### Phase 3: Callers (AFTER Phase 2)
- Update route handlers
- Update internal service calls
- Update job/scheduler calls

### Phase 4: Verification (FINAL)
- Full integration test suite
- Cross-tenant access tests
- Spoofing prevention tests
- Load/stress testing

---

## Risk Mitigation

### Risk: Breaking Changes
- **Mitigation**: All services already used as internal APIs. Update all callers in same commit.
- **Verification**: Full test suite must pass before merge.

### Risk: Missing Call Sites
- **Mitigation**: Systematic grep for all callers before refactoring. Leave no orphans.
- **Verification**: Typescriptcompilation must pass (function signatures mismatch will be caught).

### Risk: Backward Compatibility
- **Mitigation**: This is internal service layer. No public API changes.
- **Verification**: Only internal calls affected. All will be updated together.

---

## Success Criteria

✅ All mutation services require authContext  
✅ No service accepts raw actorId parameter  
✅ No service accepts raw workspaceId parameter  
✅ All callers updated  
✅ Tests verify spoofing impossible  
✅ Build and tests passing  
✅ Cross-tenant access properly rejected  

---

## Status Tracking

- [ ] Phase 2.1: findings.ts
- [ ] Phase 2.2: recommendation.ts  
- [ ] Phase 2.3: evidence.ts
- [ ] Phase 2.4-2.8: Other mutation services
- [ ] Phase 3: Read functions
- [ ] Phase 4: Update all callers
- [ ] Phase 5: Full verification

---

**Estimated Effort**: 4-6 hours systematic refactoring + testing
**Impact**: Eliminates service-layer user spoofing vulnerability
**Status**: READY FOR IMPLEMENTATION
