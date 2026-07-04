# P2B FK Fixture Failure Fix Verification

**Date:** 2026-06-03  
**Workflow Run ID:** 26868092116  
**Results Before:** 31/42 passed, 11 failed  
**Expected After Fix:** ~37/42 passed (6 fewer FK failures)

---

## TASK 1: Extract FK Failures

### All 6 FK Failures Identified:

**FK Constraint:** `audit_events_actor_id_fkey`  
**Error:** Key (actor_id)=(UUID or string) is not present in table "users"  
**Root Cause:** Tests emit audit events with actor IDs that don't exist as User records

### Breakdown by Test File:

#### From `decision-outcome-path.test.ts` (3 failures):
- Line 10: `const testActorId = randomUUID();`
- Line 50: Passed to `recordDecisionOutcome(..., testActorId)`
- Issue: No User created with this testActorId
- Affects tests:
  1. "should classify and record 100% achievement as success" (line 42)
  2. "should populate verificationStatus for success outcome" (line 60)
  3. "should accept failure with outcomeNotes" (line 99)

#### From `verified-lifecycle.test.ts` (2 failures):
- Line 430: `"admin-1"` passed to approveOutcomeVerification
- Line 443: `"admin-2"` passed to approveOutcomeVerification
- Issue: No User records created for "admin-1" or "admin-2"
- Affects test:
  1. "REAL: multiple verifications appended to trail" (line 419)
  2. (One more failure from cleanup attempting to delete audit events)

#### From `real-route-tests.test.ts` (1 failure):
- Likely from cleanup or indirect audit event path
- Related to different actor context

---

## TASK 2: FK Write Graph

| Test File | Actor ID | Model Write | FK Field | Value | User Exists? | Fix Location |
|-----------|----------|-------------|----------|-------|------|---|
| decision-outcome-path.test.ts | testActorId (UUID) | auditEvent.create | actor_id | randomUUID() | ❌ NO | beforeEach add User |
| verified-lifecycle.test.ts | "admin-1" | auditEvent.create | actor_id | "admin-1" | ❌ NO | beforeEach add Users |
| verified-lifecycle.test.ts | "admin-2" | auditEvent.create | actor_id | "admin-2" | ❌ NO | beforeEach add Users |
| real-route-tests.test.ts | testActorId (UUID) | auditEvent.create | actor_id | UUID | ❌ NO | beforeEach add User |

---

## TASK 3: Defect Classification

**All 6 FK Failures: Type A — Test fixture missing required User**

Each test:
- Generates or hardcodes an actor ID
- Calls service functions that emit audit events with that actor ID
- Audit event creation fails because no User row exists for the actor ID
- FK constraint `audit_events.actor_id → users.id` violation

---

## TASK 4: Required Fixes

### Fix 1: `decision-outcome-path.test.ts`

**Lines 12-32: Add User creation in beforeEach**

```typescript
beforeEach(async () => {
  testWorkspaceId = randomUUID();
  
  // Create User for audit events
  await db.user.create({
    data: {
      id: testActorId,
      email: `test-actor-${testActorId}@example.com`,
      updatedAt: new Date(),
    },
  });
  
  // ... rest of beforeEach
});
```

**Lines 34-39: Add User cleanup in afterEach**

```typescript
afterEach(async () => {
  // Delete in FK order
  await db.auditEvent.deleteMany({
    where: {
      actorId: testActorId,
      workspaceId: testWorkspaceId,
    },
  });
  await db.operatorItem.deleteMany({
    where: { workspaceId: testWorkspaceId },
  });
  await db.user.delete({
    where: { id: testActorId },
  });
});
```

### Fix 2: `verified-lifecycle.test.ts`

**Lines 28-37: Add User creation for "admin-1" and "admin-2"**

```typescript
beforeEach(async () => {
  testWorkspaceId = randomUUID();
  
  // Create Users for verification audit events
  await db.user.createMany({
    data: [
      {
        id: testAdminId,
        email: `admin-${testAdminId}@test.example.com`,
        updatedAt: new Date(),
      },
      {
        id: "admin-1",
        email: "admin-1@test.example.com",
        updatedAt: new Date(),
      },
      {
        id: "admin-2",
        email: "admin-2@test.example.com",
        updatedAt: new Date(),
      },
    ],
  });
  
  // ... rest of beforeEach
});
```

**Lines 59-75: Update afterEach cleanup**

```typescript
afterEach(async () => {
  // Delete in FK order: audit events first, then operatorItems, then Users
  await db.auditEvent.deleteMany({
    where: {
      actorId: { in: [testAdminId, "admin-1", "admin-2"] },
      workspaceId: testWorkspaceId,
    },
  });
  await db.operatorItem.deleteMany({
    where: { workspaceId: testWorkspaceId },
  });
  await db.user.deleteMany({
    where: {
      id: { in: [testAdminId, "admin-1", "admin-2"] },
    },
  });
});
```

### Fix 3: `real-route-tests.test.ts`

May need similar User creation for indirect audit event paths. Will verify during test execution.

---

## Expected Results After Fix

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Tests Passed | 31/42 | ~37/42 | +6 |
| Tests Failed | 11/42 | ~5/42 | -6 |
| FK Failures | 6 | 0 | ✓ Fixed |
| Status Mismatch Failures | 3 | 3 | unchanged |
| Error Message Failures | 2 | 2 | unchanged |

---

## Summary

All 6 FK failures are due to missing User fixtures in test beforeEach hooks. The fixes are minimal and scoped:
1. Create missing User records with matching actor IDs
2. Update afterEach cleanup to delete these Users in FK dependency order
3. No production code changes required
4. No test assertions modified
5. No test logic changed
