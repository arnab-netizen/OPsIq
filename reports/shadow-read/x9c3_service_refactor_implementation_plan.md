# X9C-3 Phase F: Service Refactor Implementation Plan

**Phase:** X9C-3 (Service Auth Boundary Design)  
**Date:** 2026-05-15  
**Status:** IMPLEMENTATION PLAN - READY FOR EXECUTION

---

## Scope Summary

**Objective:** Refactor 2 pilot services (findings.ts, deliverable.ts) to use ServiceAuthEnvelope instead of CanonicalAuthContext + auth-guard imports.

**Pilots:** findings.ts, deliverable.ts  
**Route Callers to Update:** 4 route files total  
**Expected Scanner Reduction:** 8 violations (5 + 3)  
**Risk Level:** LOW  
**Estimated Effort:** 3-5 days  

---

## Files ALLOWED to Change

**These files MUST be modified for this phase:**

### Service Layer (2 services)
- `src/services/findings.ts`
  - Refactor 3 functions: createFinding, updateFinding, validateFinding
  - Remove auth-guard imports
  - Change signatures to accept ServiceAuthEnvelope

- `src/services/deliverable.ts`
  - Refactor 2 functions: createDeliverable, updateDeliverable
  - Remove auth-guard imports
  - Change signatures to accept ServiceAuthEnvelope

### Route Layer (4 route files)
- `src/app/api/findings/route.ts`
  - POST handler: construct ServiceAuthEnvelope for createFinding call
  - Update route caller logic

- `src/app/api/findings/[findingId]/route.ts`
  - PATCH handler: construct ServiceAuthEnvelope for updateFinding call

- `src/app/api/deliverables/route.ts`
  - POST handler: construct ServiceAuthEnvelope for createDeliverable call

- `src/app/api/deliverables/[id]/route.ts`
  - PATCH handler: construct ServiceAuthEnvelope for updateDeliverable call

### Test Layer (4 test files)
- `src/__tests__/services/findings.test.ts`
  - Update to pass ServiceAuthEnvelope in tests
  - Update test fixtures

- `src/__tests__/services/deliverable.test.ts`
  - Update to pass ServiceAuthEnvelope in tests
  - Update test fixtures

- `src/__tests__/routes/findings.test.ts`
  - Update end-to-end tests
  - Verify authorization behavior

- `src/__tests__/routes/deliverables.test.ts`
  - Update end-to-end tests
  - Verify authorization behavior

### Type Definitions (1 file)
- `src/lib/auth-types.ts`
  - Add ServiceAuthEnvelope interface (if not already present)
  - Export ServiceAuthEnvelope type

---

## Files FORBIDDEN to Change

**These files MUST NOT be modified during this phase:**

### Auth Infrastructure (DO NOT TOUCH)
- `src/lib/canonical-route-enforcement.ts` (wrapper unchanged)
- `src/lib/auth-guard.ts` (auth functions unchanged)
- `src/policies/capability-check.ts` (unchanged)
- `src/lib/audit-event.ts` (unchanged)

### Other Services (DO NOT REFACTOR)
- `src/services/engagement.ts` (already refactored, no changes)
- `src/services/client-account.ts` (already refactored, no changes)
- `src/services/stage.ts` (not selected for pilot, no changes)
- `src/services/owner-dashboard.service.ts` (not selected for pilot, no changes)
- All other services not listed in "ALLOWED" section above

### Configuration & Infrastructure
- `prisma/schema.prisma` (no schema changes)
- Database migrations (no new migrations)
- Environment variables (no changes)
- Package dependencies (no new packages)
- Build configuration (no changes)

### Tests for Other Components
- `src/__tests__/phase-*` test files (no changes)
- Policy wrapper tests (no changes)
- Auth bridge tests (no changes)

---

## Implementation Recipe: findings.ts

### Step 1: Remove Auth-Guard Import

**Before:**
```typescript
import { requireCapabilityForService, requireServiceContext } from "@/lib/auth-guard";

export async function createFinding(
  input: CreateFindingInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<Finding> {
  await requireCapabilityForService(authContext, CAPABILITIES.FINDING_CREATE);
  // ... implementation
}
```

**After:**
```typescript
// ✗ auth-guard import REMOVED
// Import only ServiceAuthEnvelope type (from auth-types or where defined)

export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<Finding> {
  // Signature change: receive envelope instead of context + workspaceId
  // Implementation
}
```

### Step 2: Refactor createFinding Function

**Before:**
```typescript
export async function createFinding(
  input: CreateFindingInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<Finding> {
  // Validate capability in service
  await requireCapabilityForService(authContext, CAPABILITIES.FINDING_CREATE);
  
  // Validate workspace
  if (authContext.verifiedWorkspaceId !== workspaceId) {
    throw new ForbiddenError("Workspace mismatch");
  }

  // Create finding
  const finding = await db.finding.create({
    data: {
      ...input,
      workspaceId,
      createdBy: authContext.verifiedActorId,
    },
  });

  return finding;
}
```

**After:**
```typescript
export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<Finding> {
  // Validate capability (envelope already pre-checked by route, but service validates)
  if (!auth.verifiedCapabilities.has("FINDING_CREATE")) {
    throw new ForbiddenError("FINDING_CREATE capability required");
  }

  // Note: Workspace is already verified by route
  // Service trusts that auth.verifiedWorkspaceId is correct

  // Create finding
  const finding = await db.finding.create({
    data: {
      ...input,
      workspaceId: auth.verifiedWorkspaceId,
      createdBy: auth.verifiedActorId,
    },
  });

  return finding;
}
```

### Step 3: Refactor updateFinding Function

**Before:**
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<Finding> {
  await requireCapabilityForService(authContext, CAPABILITIES.FINDING_UPDATE);
  // ... rest of implementation
}
```

**After:**
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<Finding> {
  // Validate capability
  if (!auth.verifiedCapabilities.has("FINDING_UPDATE")) {
    throw new ForbiddenError("FINDING_UPDATE capability required");
  }

  // Load existing finding to verify workspace ownership
  const finding = await db.finding.findUnique({
    where: { id: findingId },
  });

  if (!finding) {
    throw new NotFoundError("Finding not found");
  }

  // Verify workspace ownership
  if (finding.workspaceId !== auth.verifiedWorkspaceId) {
    throw new ForbiddenError("Finding in different workspace");
  }

  // Update finding
  const updated = await db.finding.update({
    where: { id: findingId },
    data: {
      ...input,
      updatedBy: auth.verifiedActorId,
      updatedAt: new Date(),
    },
  });

  return updated;
}
```

### Step 4: Refactor validateFinding Function

**Before:**
```typescript
export async function validateFinding(
  findingId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<ValidationResult> {
  await requireCapabilityForService(authContext, CAPABILITIES.FINDING_VALIDATE);
  // ... rest of implementation
}
```

**After:**
```typescript
export async function validateFinding(
  findingId: string,
  auth: ServiceAuthEnvelope
): Promise<ValidationResult> {
  // Validate capability
  if (!auth.verifiedCapabilities.has("FINDING_VALIDATE")) {
    throw new ForbiddenError("FINDING_VALIDATE capability required");
  }

  // Load finding and validate
  const finding = await db.finding.findUnique({
    where: { id: findingId },
  });

  if (!finding) {
    throw new NotFoundError("Finding not found");
  }

  if (finding.workspaceId !== auth.verifiedWorkspaceId) {
    throw new ForbiddenError("Finding in different workspace");
  }

  // Perform validation logic
  return validateFindingLogic(finding);
}
```

---

## Implementation Recipe: deliverable.ts

### Step 1: Remove Auth-Guard Import

**Before:**
```typescript
import { requireCapabilityForService } from "@/lib/auth-guard";

export async function createDeliverable(
  input: CreateDeliverableInput,
  authContext: CanonicalAuthContext
): Promise<Deliverable> {
  await requireCapabilityForService(authContext, CAPABILITIES.DELIVERABLE_CREATE);
  // ...
}
```

**After:**
```typescript
// ✗ auth-guard import REMOVED

export async function createDeliverable(
  input: CreateDeliverableInput,
  auth: ServiceAuthEnvelope
): Promise<Deliverable> {
  // Signature change
  // Implementation
}
```

### Step 2: Refactor createDeliverable Function

**Before:**
```typescript
export async function createDeliverable(
  input: CreateDeliverableInput,
  authContext: CanonicalAuthContext
): Promise<Deliverable> {
  await requireCapabilityForService(authContext, CAPABILITIES.DELIVERABLE_CREATE);

  const deliverable = await db.deliverable.create({
    data: {
      ...input,
      createdBy: authContext.verifiedActorId,
    },
  });

  return deliverable;
}
```

**After:**
```typescript
export async function createDeliverable(
  input: CreateDeliverableInput,
  auth: ServiceAuthEnvelope
): Promise<Deliverable> {
  // Validate capability
  if (!auth.verifiedCapabilities.has("DELIVERABLE_CREATE")) {
    throw new ForbiddenError("DELIVERABLE_CREATE capability required");
  }

  const deliverable = await db.deliverable.create({
    data: {
      ...input,
      workspaceId: auth.verifiedWorkspaceId,
      createdBy: auth.verifiedActorId,
    },
  });

  return deliverable;
}
```

### Step 3: Refactor updateDeliverable Function

**Before:**
```typescript
export async function updateDeliverable(
  deliverableId: string,
  input: UpdateDeliverableInput,
  authContext: CanonicalAuthContext
): Promise<Deliverable> {
  await requireCapabilityForService(authContext, CAPABILITIES.DELIVERABLE_UPDATE);
  // ...
}
```

**After:**
```typescript
export async function updateDeliverable(
  deliverableId: string,
  input: UpdateDeliverableInput,
  auth: ServiceAuthEnvelope
): Promise<Deliverable> {
  // Validate capability
  if (!auth.verifiedCapabilities.has("DELIVERABLE_UPDATE")) {
    throw new ForbiddenError("DELIVERABLE_UPDATE capability required");
  }

  const deliverable = await db.deliverable.update({
    where: { id: deliverableId },
    data: {
      ...input,
      updatedBy: auth.verifiedActorId,
      updatedAt: new Date(),
    },
  });

  return deliverable;
}
```

---

## Route Caller Update Recipe

### Pattern: Construct ServiceAuthEnvelope Before Service Call

**Location:** Route handler that calls refactored service function

**Before Pattern:**
```typescript
// Route receives CanonicalAuthContext from wrapper
// Passes context directly to service
export async function POST(
  request: NextRequest,
  context: CanonicalRouteContext
) {
  const ctx = context.canonicalAuth;
  const workspaceId = context.params.workspaceId;
  
  const input = await request.json();
  
  // Pass context directly (old pattern)
  const result = await findingService.createFinding(input, ctx, workspaceId);
  
  return NextResponse.json(result);
}
```

**After Pattern:**
```typescript
// Route receives CanonicalAuthContext from wrapper
// Constructs ServiceAuthEnvelope before calling service
export async function POST(
  request: NextRequest,
  context: CanonicalRouteContext
) {
  const ctx = context.canonicalAuth;
  
  const input = await request.json();
  
  // Construct ServiceAuthEnvelope from verified context
  const authEnvelope: ServiceAuthEnvelope = {
    verifiedActorId: ctx.verifiedActorId,
    verifiedActorType: ctx.verifiedActorType,
    verifiedWorkspaceId: ctx.verifiedWorkspaceId,
    verifiedCapabilities: ctx.verifiedCapabilities,
    hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
    verifiedActor: ctx.verifiedActor,
    // Omit policy unless service needs it
  };
  
  // Call service with envelope
  const result = await findingService.createFinding(input, authEnvelope);
  
  return NextResponse.json(result);
}
```

**Key Changes:**
1. Remove `workspaceId` parameter from service call
2. Construct ServiceAuthEnvelope object with verified fields
3. Pass envelope as second parameter instead of context + workspaceId
4. Service now receives envelope.verifiedWorkspaceId instead of separate workspaceId parameter

### Findings Route Callers

**File: src/app/api/findings/route.ts (POST handler)**
- Current: `findingService.createFinding(input, ctx, workspaceId)`
- After: `findingService.createFinding(input, authEnvelope)`
- Context: Construct envelope from ctx

**File: src/app/api/findings/[findingId]/route.ts (PATCH handler)**
- Current: `findingService.updateFinding(findingId, input, ctx, workspaceId)`
- After: `findingService.updateFinding(findingId, input, authEnvelope)`
- Context: Construct envelope from ctx

### Deliverable Route Callers

**File: src/app/api/deliverables/route.ts (POST handler)**
- Current: `deliverableService.createDeliverable(input, ctx)`
- After: `deliverableService.createDeliverable(input, authEnvelope)`
- Context: Construct envelope from ctx

**File: src/app/api/deliverables/[id]/route.ts (PATCH handler)**
- Current: `deliverableService.updateDeliverable(deliverableId, input, ctx)`
- After: `deliverableService.updateDeliverable(deliverableId, input, authEnvelope)`
- Context: Construct envelope from ctx

---

## Test Construction Rules

### Service Tests

**Pattern: Create ServiceAuthEnvelope directly in tests**

```typescript
// ✓ CORRECT: Construct envelope explicitly in test
test("createFinding should enforce FINDING_CREATE capability", async () => {
  const auth: ServiceAuthEnvelope = {
    verifiedActorId: "user-123",
    verifiedActorType: "user",
    verifiedWorkspaceId: "workspace-456",
    verifiedCapabilities: new Set(), // Empty - no capabilities
    hasInternalAccess: false,
  };

  const input = { title: "Test Finding" };

  expect(() => 
    findingService.createFinding(input, auth)
  ).rejects.toThrow(ForbiddenError);
});

// ✓ CORRECT: Construct envelope with needed capability
test("createFinding should succeed with FINDING_CREATE capability", async () => {
  const auth: ServiceAuthEnvelope = {
    verifiedActorId: "user-123",
    verifiedActorType: "user",
    verifiedWorkspaceId: "workspace-456",
    verifiedCapabilities: new Set(["FINDING_CREATE"]),
    hasInternalAccess: false,
  };

  const input = { title: "Test Finding" };

  const result = await findingService.createFinding(input, auth);
  expect(result.title).toBe("Test Finding");
  expect(result.createdBy).toBe("user-123");
});
```

### Route Tests

**Pattern: Use wrapped handlers with full request/response cycle**

```typescript
// ✓ CORRECT: Test through route handler
test("POST /api/findings with FINDING_CREATE capability should succeed", async () => {
  // Simulate request from authenticated user with FINDING_CREATE
  const response = await POST(
    new NextRequest("http://localhost:3000/api/findings", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
    }),
    contextWithCapability("FINDING_CREATE")
  );

  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.title).toBe("Test");
});

// ✓ CORRECT: Test authorization failure
test("POST /api/findings without FINDING_CREATE should return 403", async () => {
  // Simulate request from authenticated user WITHOUT FINDING_CREATE
  const response = await POST(
    new NextRequest("http://localhost:3000/api/findings", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
    }),
    contextWithoutCapability("FINDING_CREATE")
  );

  expect(response.status).toBe(403);
});
```

### Test Fixture Helper (Update existing fixtures)

**Pattern: Helper to construct ServiceAuthEnvelope**

```typescript
export function createTestAuthEnvelope(
  overrides?: Partial<ServiceAuthEnvelope>
): ServiceAuthEnvelope {
  return {
    verifiedActorId: "test-user-123",
    verifiedActorType: "user",
    verifiedWorkspaceId: "test-workspace-456",
    verifiedCapabilities: new Set([
      "FINDING_CREATE",
      "FINDING_UPDATE",
      "FINDING_VALIDATE",
    ]),
    hasInternalAccess: true,
    ...overrides,
  };
}

// Usage in tests
test("should create finding", async () => {
  const auth = createTestAuthEnvelope();
  const result = await findingService.createFinding(input, auth);
  expect(result).toBeDefined();
});

test("should deny without capability", async () => {
  const auth = createTestAuthEnvelope({
    verifiedCapabilities: new Set(), // Empty capabilities
  });
  expect(() => findingService.createFinding(input, auth)).rejects.toThrow();
});
```

---

## Validation Strategy and Gates

### Gate 1: TypeScript Compilation

**Command:**
```bash
npm run build
```

**Success Criteria:**
- ✓ Zero TypeScript errors
- ✓ All imports resolve correctly
- ✓ No type mismatches in service calls
- ✓ All ServiceAuthEnvelope usages are type-correct

**Failure Action:** Stop, debug, fix type errors, retry

### Gate 2: Service Tests

**Command:**
```bash
npm test -- findings deliverable --testPathPattern="services"
```

**Success Criteria:**
- ✓ findings.test.ts: All tests pass
- ✓ deliverable.test.ts: All tests pass
- ✓ No new test failures
- ✓ Authorization enforcement tests pass
- ✓ Workspace isolation tests pass

**Failure Action:** Fix service implementation, retry

### Gate 3: Route Tests

**Command:**
```bash
npm test -- findings deliverable --testPathPattern="routes"
```

**Success Criteria:**
- ✓ findings route tests: All pass
- ✓ deliverables route tests: All pass
- ✓ End-to-end POST/PATCH flows work
- ✓ Unauthorized requests return 403 Forbidden
- ✓ Authorization errors before handler execution (fail-closed)

**Failure Action:** Fix route implementation, retry

### Gate 4: Full Test Suite

**Command:**
```bash
npm test
```

**Success Criteria:**
- ✓ All existing tests pass (no regressions)
- ✓ New tests pass
- ✓ 370+ tests passing
- ✓ Zero new failures in other services

**Failure Action:** Investigate regressions, fix, retry

### Gate 5: Scanner Validation

**Command:**
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
```

**Success Criteria:**
- ✓ Total violations: 442 (down from 450)
- ✓ Critical violations: 283 (unchanged from service-layer perspective)
- ✓ Block-build violations: 167 (unchanged)
- ✓ Violations from findings.ts: 0 (down from 5)
- ✓ Violations from deliverable.ts: 0 (down from 3)
- ✓ services/{findings,deliverable}.ts no longer import auth-guard

**Failure Action:** Verify auth-guard imports were removed, retry

### Gate 6: Code Review Checklist

**Manual Review:**
- ✓ findings.ts: No auth-guard imports remain
- ✓ deliverable.ts: No auth-guard imports remain
- ✓ All route callers construct ServiceAuthEnvelope correctly
- ✓ No service signature changes beyond pilot scope
- ✓ No changes to forbidden files
- ✓ Test fixtures use ServiceAuthEnvelope
- ✓ Documentation updated (if any)

**Failure Action:** Fix issues, retry review

---

## Validation Summary

**Before Refactoring:**
- Scanner violations: 450 total
  - findings.ts: 5 violations
  - deliverable.ts: 3 violations
  - Services with auth-guard imports: 4 (findings, deliverable, stage, owner-dashboard)

**After Refactoring:**
- Scanner violations: 442 total (down 8)
  - findings.ts: 0 violations (was 5)
  - deliverable.ts: 0 violations (was 3)
  - Services with auth-guard imports: 2 (stage, owner-dashboard)
  - Route tests: All passing
  - Service tests: All passing
  - No regressions

---

## Rollback Procedures

### If Validation Fails at Gate 1 (Compilation)

**Action:** Fix TypeScript errors immediately
1. Review compilation errors
2. Update service signatures or route callers
3. Retry `npm run build`
4. Max time: 30 minutes

### If Validation Fails at Gate 2 (Service Tests)

**Action:** Revert service changes, fix implementation
1. Revert findings.ts and/or deliverable.ts to HEAD
2. Fix bug in implementation
3. Retry refactoring
4. Max time: 2 hours total

### If Validation Fails at Gate 3 (Route Tests)

**Action:** Revert route callers, fix envelope construction
1. Revert route files to HEAD
2. Fix ServiceAuthEnvelope construction logic
3. Retry route tests
4. Max time: 2 hours total

### If Validation Fails at Gate 4 (Full Suite)

**Action:** Full revert if regressions in other services
1. Identify which tests regressed
2. If regression is in findings/deliverable scope: fix it
3. If regression is in other services: revert entire changeset
4. Investigate root cause
5. Max rollback time: 1 hour

### If Validation Fails at Gate 5 (Scanner)

**Action:** Verify auth-guard imports removed, retry scan
1. Manually verify no `import ... from "@/lib/auth-guard"` in findings.ts
2. Manually verify no `import ... from "@/lib/auth-guard"` in deliverable.ts
3. Rerun scanner
4. If still failing: check for indirect imports or commented code
5. Max time: 30 minutes

### Complete Rollback (If Multiple Gates Fail)

**Procedure:**
```bash
# Revert all changes in scope
git checkout -- src/services/findings.ts
git checkout -- src/services/deliverable.ts
git checkout -- src/app/api/findings/route.ts
git checkout -- src/app/api/findings/[findingId]/route.ts
git checkout -- src/app/api/deliverables/route.ts
git checkout -- src/app/api/deliverables/[id]/route.ts
git checkout -- src/__tests__/services/findings.test.ts
git checkout -- src/__tests__/services/deliverable.test.ts
git checkout -- src/__tests__/routes/findings.test.ts
git checkout -- src/__tests__/routes/deliverables.test.ts

# Verify rollback
npm run build
npm test
```

**Result:** System returns to state before refactoring  
**Decision Point:** Investigate issues offline, plan next attempt

---

## Implementation Sequence

**Day 1: Service Refactoring**
1. Refactor findings.ts (Step 1-4 from recipe)
2. Refactor deliverable.ts (Step 1-3 from recipe)
3. Commit: "X9C-3: Refactor findings and deliverable services to use ServiceAuthEnvelope"
4. Run `npm run build` - Gate 1 validation

**Day 2: Route Updates**
1. Update findings route callers (2 files)
2. Update deliverable route callers (2 files)
3. Commit: "X9C-3: Update route callers to construct ServiceAuthEnvelope"
4. Run service tests - Gate 2 validation

**Day 3: Test Updates**
1. Update findings tests
2. Update deliverable tests
3. Commit: "X9C-3: Update tests for ServiceAuthEnvelope"
4. Run route tests - Gate 3 validation

**Day 4: Validation**
1. Run full test suite - Gate 4 validation
2. Run scanner - Gate 5 validation
3. Code review - Gate 6 validation
4. Create validation report (Phase G)

---

## Success Criteria Summary

✓ findings.ts refactored to use ServiceAuthEnvelope  
✓ deliverable.ts refactored to use ServiceAuthEnvelope  
✓ 4 route files updated to construct envelopes  
✓ 4 test files updated for new pattern  
✓ All tests passing (370+ tests)  
✓ No regressions in other services  
✓ Scanner violations reduced by 8 (5 + 3)  
✓ Build passes without errors  
✓ Authorization enforcement verified (fail-closed behavior)  
✓ Pattern validated for remaining services  

---

## Next Phase

**Phase G:** Validation and final authorization

**Deliverable:** x9c3_validation.md with complete results and authorization status

---

**Status:** ✓ IMPLEMENTATION PLAN APPROVED - READY FOR EXECUTION
