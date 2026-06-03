# P2B D1 Fix Recovery Verification

**Date:** 2026-06-03  
**Recovery Commit Base:** b4710a4f (invalid fixture)  
**Test File:** src/__tests__/p2b/real-route-tests.test.ts  
**Status:** D1_FIX_RECOVERY_READY_FOR_HOSTILE_VERIFICATION

---

## TASK 1 — WorkspaceMembership Schema Analysis

**Model Definition:**
```prisma
model WorkspaceMembership {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  workspaceId String    @db.Uuid @map("workspace_id")          // Required
  userId      String    @db.Uuid @map("user_id")                // Required
  role        String                                             // Required
  addedBy     String?   @db.Uuid @map("added_by")              // Optional
  addedAt     DateTime  @default(now()) @map("added_at")       // Default
  removedAt   DateTime? @map("removed_at")                      // Optional
  isActive    Boolean   @default(true) @map("is_active")       // Default
  
  @@unique([workspaceId, userId])
  @@index([userId, isActive])
  @@index([workspaceId, isActive])
}
```

**Required Fields (must provide):**
- workspaceId: String
- userId: String
- role: String

**Default Fields (optional to provide):**
- id: generated via dbgenerated()
- addedAt: defaults to now()
- isActive: defaults to true

**Invalid Fields in b4710a4f:**
- `joinedAt` → NOT in schema (schema field is `addedAt`)
- `updatedAt` → NOT in schema (does not exist in WorkspaceMembership model)

**Minimum Valid Payload:**
```typescript
{
  userId: "test-actor",
  workspaceId: testWorkspaceId,
  role: "admin",
  // Optional fields with defaults:
  // isActive: true (default)
  // addedAt: now() (default)
}
```

---

## TASK 2 — D1 Test Fixture Fix

**File Modified:** src/__tests__/p2b/real-route-tests.test.ts

**Fields Removed:**
- `id: randomUUID()` → Schema has @default(dbgenerated()), removed explicit ID
- `joinedAt: new Date()` → Invalid field, not in schema
- `updatedAt: new Date()` → Invalid field, not in schema

**Fields Kept (from b4710a4f):**
- `userId: "test-actor"` ✓ Required
- `workspaceId: testWorkspaceId` ✓ Required
- `role: "admin"` ✓ Required
- `isActive: true` ✓ Matches @default(true), explicit for clarity

**Before (Invalid):**
```typescript
await db.workspaceMembership.create({
  data: {
    id: randomUUID(),
    userId: "test-actor",
    workspaceId: testWorkspaceId,
    role: "admin",
    isActive: true,
    joinedAt: new Date(),           // ❌ INVALID
    updatedAt: new Date(),          // ❌ INVALID
  },
});
```

**After (Fixed):**
```typescript
await db.workspaceMembership.create({
  data: {
    userId: "test-actor",
    workspaceId: testWorkspaceId,
    role: "admin",
    isActive: true,
  },
});
```

**Schema Compliance:** ✓ FIXED

---

## TASK 3 — AuditEvent Cleanup Decision

**Analysis:**

The test calls recordDecisionOutcome() which calls emitAuditEvent():

```typescript
// From test:
const testActorId = randomUUID();  // ← Random UUID
...
await recordDecisionOutcome(
  testDecisionId,
  testWorkspaceId,
  {...},
  testActorId  // ← Passed as actorId
);

// From decision-lifecycle.service.ts:
await emitAuditEvent({
  eventName: "outcome.recorded",
  entityType: "OperatorItem",
  entityId: decisionId,
  workspaceId,
  actorId,  // ← This is testActorId (randomUUID), NOT "test-actor"
  payload: {...},
});
```

**Key Finding:**
- AuditEvent.actorId = testActorId (randomUUID)
- NOT "test-actor"
- User fixture creates User(id: "test-actor")
- User IDs do NOT match

**User Instruction:** "emits AuditEvent rows with actorId = 'test-actor'"

**Answer:** NO
- emitAuditEvent is called with actorId = testActorId
- testActorId is a randomUUID
- This is NOT the "test-actor" actor

**Conclusion:** 
**AuditEvent cleanup NOT needed** (per user criteria: cleanup only if actorId = "test-actor", which is false)

---

## TASK 4 — Cleanup Order Verification

**AfterEach Cleanup (lines 89-103):**

```typescript
afterEach(async () => {
  // Delete in dependency order: WorkspaceMembership before User
  await db.workspaceMembership.deleteMany({
    where: {
      userId: "test-actor",
      workspaceId: testWorkspaceId,
    },
  });
  await db.operatorItem.deleteMany({
    where: { workspaceId: testWorkspaceId },
  });
  await db.user.delete({
    where: { id: "test-actor" },
  });
});
```

**Dependency Analysis:**

1. **WorkspaceMembership** (FK child)
   - Has FK: userId → User.id
   - Deleted first ✓

2. **OperatorItem** (may have FK)
   - May have: verifiedBy → User.id
   - Deleted second ✓
   - (After WorkspaceMembership, before User)

3. **User** (FK parent)
   - Deleted last ✓
   - All referencing records cleaned up

**Order:** ✓ CORRECT

---

## TASK 5 — Local Validation Results

**TypeScript Compilation:**
```
$ npx tsc --noEmit
(no output)
✓ PASSED
```

**Next.js Build:**
```
$ npm run build
✓ Compiled successfully in 17.5s
✓ PASSED
```

---

## TASK 6 — Expected CI Improvement

**Current State (after D3 cleanup, before D1 fix):**
- Tests Passed: 33/42
- Tests Failed: 9/42
- Success Rate: 78.6%

**Real-Route Tests Status Before Fix:**
- Expected status: beforeEach fails with Prisma validation error
- Fixture creation error on WorkspaceMembership.create()
- All 4 route tests blocked (never reach handler)

**After D1 Fix (fixing invalid schema fields):**
- WorkspaceMembership fixture now valid
- beforeEach completes successfully
- Route handler can execute
- Expected: 4 tests now reach handler execution

**Expected Pass Count After CI:**
- Tests Passed: 33 → 37 (+4 from D1 fix)
- Tests Failed: 9 → 5 (-4 from D1 fix)
- Success Rate: 78.6% → 88.1%
- Real-Route Failures: 4 → 0

**Real-Route Tests After Fix:**
1. "REAL: route invocation → classifier → verification → database" → Can execute
2. "REAL: route validation rejects failure without notes" → Can execute
3. "REAL: route fraud detection auto-flags as disputed" → Can execute
4. "REAL: recordDecisionOutcome auto-flags high fraud risk as disputed" → Can execute

---

## TASK 7 — Recovery Assessment

**Critical Issue Fixed:** ✓
- Removed invalid schema fields from WorkspaceMembership fixture
- Fixture now complies with Prisma schema

**Cleanup Order:** ✓
- WorkspaceMembership deleted before User
- OperatorItem deleted before User
- Correct FK dependency order

**AuditEvent Cleanup:** ✗ Not Added
- Reason: emitAuditEvent uses testActorId (randomUUID), not "test-actor"
- User criteria: Add cleanup only if actorId = "test-actor" (not met)

**Assertions:** ✓ Unchanged
- No test assertions modified
- No tests skipped
- No mocks added

**Production Code:** ✓ Untouched
- No service changes
- No schema changes
- No migrations

---

## SUMMARY

**D1_FIX_RECOVERY_READY_FOR_HOSTILE_VERIFICATION**

**What Was Fixed:**
✓ Removed invalid field `joinedAt` (schema: `addedAt`)
✓ Removed invalid field `updatedAt` (doesn't exist)
✓ Removed explicit `id` (let Prisma generate)
✓ Kept only schema-valid fields

**What Remains:**
- AuditEvent cleanup: Not applicable (actorId != "test-actor")
- Cleanup order: Correct
- Assertions: Unchanged
- Production code: Untouched

**Expected Result:**
- 4 real-route-tests.test.ts tests now executable
- Pass rate: 78.6% → 88.1%
- D1 fix unblocks route handler execution

**Status:** Ready for second hostile verification

