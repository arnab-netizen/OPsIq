# Service-Layer Actor Spoofing: Refactoring Plan

**Date**: 2026-05-02  
**Status**: 🔴 IN PROGRESS  
**Severity**: HIGH - User spoofing vulnerability at service layer

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

### Phase 1: Core Infrastructure (DONE)
- ✅ service-auth.ts with requireServiceAuth, requireServiceContext
- ✅ Tests verifying patterns

### Phase 2: Critical Mutation Services (IN PROGRESS)
Refactor these in order (all accept actorId):
1. [ ] findings.ts (17 functions total, 2 mutations)
2. [ ] recommendation.ts (3 mutations)
3. [ ] evidence.ts (3 mutations)
4. [ ] lead.ts (2 mutations)
5. [ ] kpi.ts (2 mutations)
6. [ ] user.ts (2 mutations)
7. [ ] shock-event.ts (2 mutations)
8. [ ] client-contact.ts (2 mutations)
9. [ ] stage.ts (2 mutations)
10. [ ] deliverable.ts (2 mutations)
11. [ ] action.ts (3 mutations)
12. [ ] engagement.ts (2 mutations)
13. [ ] diagnosis.ts (1 mutation)

### Phase 3: Read Functions (workspaceId only)
Refactor list/get functions to require authContext for consistency

### Phase 4: Update All Callers
Routes, jobs, internal services that call the refactored functions

### Phase 5: Testing & Verification
- Cross-tenant access tests
- Spoofing prevention tests
- Integration tests

---

## Refactoring Checklist

For each service function:

1. **Signature Change**
   - [ ] Remove `actorId: string` parameter
   - [ ] Remove `workspaceId: string` parameter
   - [ ] Add `authContext: AuthContext` parameter
   - [ ] Keep `workspaceId: string` for validation if needed

2. **Implementation**
   - [ ] Add: `const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId)`
   - [ ] Replace `actorId` → `userId`
   - [ ] Replace `workspaceId` (param) → `validatedWorkspaceId` (extracted)
   - [ ] Update audit events to use `userId` from context

3. **Database Updates**
   - [ ] Change `createdBy: actorId` → `createdBy: userId`
   - [ ] Change `workspaceId: workspaceId` → `workspaceId: validatedWorkspaceId`

4. **Update Call Sites**
   - [ ] Find all callers using grep
   - [ ] Update route handlers to extract authContext from withAuth()
   - [ ] Update internal service-to-service calls
   - [ ] Construct authContext for system/background operations

5. **Testing**
   - [ ] Update test calls to pass authContext
   - [ ] Add test for missing authContext → error
   - [ ] Add test for spoofed userId → impossible

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

## Example Refactoring: findings.ts

### Current (Lines 53-57)
```typescript
export async function createFinding(
  input: CreateFindingInput,
  actorId: string,
  workspaceId: string
): Promise<{ id: string; engagementId: string }> {
```

### Refactored
```typescript
import type { AuthContext } from "@/lib/auth-guard";
import { requireServiceContext } from "@/lib/service-auth";

export async function createFinding(
  input: CreateFindingInput,
  authContext: AuthContext,
  workspaceId: string
): Promise<{ id: string; engagementId: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
```

### Updated Call Site

**Before** (src/app/api/findings/route.ts:54):
```typescript
const result = await createFinding(body, session.user.id, workspaceId);
```

**After**:
```typescript
const result = await createFinding(body, { session, policy }, workspaceId);
```

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
