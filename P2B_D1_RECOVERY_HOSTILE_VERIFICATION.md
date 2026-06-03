# P2B D1 Recovery Hostile Verification

**Date:** 2026-06-03  
**Commit:** f493dab8  
**Status:** **D1_FIX_NOT_READY** ❌

---

## TASK 1 — Diff Verification

**Files Changed:**
- ✓ P2B_D1_FIX_RECOVERY_VERIFICATION.md (new)
- ✓ src/__tests__/p2b/real-route-tests.test.ts (modified)

**Fixture Changes:**
- ✗ Removed: `id: randomUUID()`
- ✗ Removed: `joinedAt: new Date()`
- ✗ Removed: `updatedAt: new Date()`
- ✓ Kept: userId, workspaceId, role, isActive

**Assertions:** ✓ Unchanged  
**Tests Skipped:** ✗ None  
**Production Code:** ✓ Untouched

---

## TASK 2 — Actor ID Trace

**Operator Route Integration (lines 40-174):**

| Property | Value |
|----------|-------|
| testActorId (line 43) | randomUUID() (created but unused in this suite) |
| User created (line 51-57) | id: "test-actor" |
| WorkspaceMembership created (line 61-68) | userId: "test-actor" |
| Mock session (from vi.mock) | user.id: "test-actor" |
| Expected route actorId | "test-actor" (from ctx.verifiedActorId in handler) |

**Decision Lifecycle Integration (lines 314-412):**

| Property | Value |
|----------|-------|
| testActorId (line 313) | randomUUID() (USED in this suite) |
| User created (line 321-327) | id: "test-actor" |
| WorkspaceMembership created (line 331-338) | userId: "test-actor" |
| Mock session (from vi.mock) | user.id: "test-actor" |
| recordDecisionOutcome call (line 390) | actorId: testActorId (randomUUID) |
| Expected service actorId | testActorId (randomUUID) ← **NOT "test-actor"** |

---

## TASK 3 — Wrapper Actor Resolution

**Canonical-route-enforcement.ts:**

| Location | Code | Result |
|----------|------|--------|
| Line 73 (operator/route.ts) | `const actorId = ctx.verifiedActorId;` | Comes from ctx |
| Line 571 | `verifiedActorId: session.user.id` | = "test-actor" (from mock) |
| Decision Lifecycle tests | `recordDecisionOutcome(..., testActorId)` | Bypasses route wrapper |

**Key Finding:**
- Operator Route tests use route wrapper → ctx.verifiedActorId = "test-actor"
- Decision Lifecycle tests call service directly → actorId = testActorId (randomUUID)
- These are **different actor IDs**

---

## TASK 4 — Cleanup Requirements by User ID

**User "test-actor" Created in beforeEach:**
- FK references: WorkspaceMembership.userId
- FK references: OperatorItem.verifiedBy (possibly)
- FK references: OperatorItem.completedBy (possibly)
- FK references: OperatorItem.createdByUserId (possibly)
- FK references: AuditEvent.actorId (IF emitted with actorId="test-actor")

**User testActorId (randomUUID) NOT Created:**
- Not in beforeEach
- FK references: AuditEvent.actorId (IF emitted with actorId=testActorId)
- **PROBLEM:** If AuditEvent.actorId=testActorId, FK constraint fails (User doesn't exist)

**Current Cleanup (lines 89-103, 359-373):**
```typescript
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
```

**Missing:** No AuditEvent cleanup for either "test-actor" or testActorId

---

## TASK 5 — Contradiction Check

**Question 1: Is "test-actor" ever used as AuditEvent.actorId?**

**Answer: YES in Operator Route tests, NO in Decision Lifecycle tests**

- Operator Route tests: route wrapper → verifiedActorId = "test-actor" → passed to service → emitAuditEvent(actorId: "test-actor")
- Decision Lifecycle tests: recordDecisionOutcome(actorId: testActorId) → emitAuditEvent(actorId: testActorId)

---

**Question 2: Is testActorId ever created as a User?**

**Answer: NO**

- beforeEach creates User("test-actor"), NOT User(testActorId)
- testActorId is a randomUUID, never persisted to database as a User

---

**Question 3: If AuditEvent.actorId=testActorId and no User exists, can audit insert succeed?**

**Answer: NO - FK constraint will fail**

From schema:
```prisma
actor  User?  @relation(fields: [actorId], references: [id], onDelete: Restrict)
```

- AuditEvent.actorId MUST reference existing User.id (onDelete: Restrict)
- testActorId is not in User table
- Insert of AuditEvent with actorId=testActorId will fail with FK constraint violation

---

**Question 4: If AuditEvent.actorId="test-actor", can cleanup succeed without deleting AuditEvent?**

**Answer: NO - User deletion will fail**

From schema:
```prisma
onDelete: Restrict
```

- Cannot delete User("test-actor") while AuditEvent records reference it
- If AuditEvent.actorId="test-actor" exists, User.delete() fails with FK constraint violation

---

**Question 5: Is route using session user id or body actor id for audit?**

**Answer: Session user id**

- Route handler: `const actorId = ctx.verifiedActorId;` (line 73 of operator/route.ts)
- verifiedActorId comes from session (line 571 of canonical-route-enforcement.ts)
- Mock session provides userId: "test-actor"
- Body does not provide actor id

---

## CRITICAL CONTRADICTION FOUND

**Claim in commit f493dab8:**
> "AuditEvent cleanup not needed (events emitted with testActorId, not 'test-actor')"

**Proof of Contradiction:**

1. **Operator Route tests (Suite 1):** 
   - Route wrapper sets actorId = "test-actor" (from session)
   - emitAuditEvent(actorId: "test-actor")
   - AuditEvent.actorId = "test-actor"
   - Current cleanup deletes User("test-actor")
   - **Result: FK constraint violation** (AuditEvent references deleted User)

2. **Decision Lifecycle tests (Suite 2):**
   - Direct service call with actorId = testActorId (randomUUID)
   - emitAuditEvent(actorId: testActorId)
   - AuditEvent.actorId = testActorId
   - **Problem: testActorId is NOT a valid User.id**
   - **Result: AuditEvent insert may fail** (FK constraint - User doesn't exist)

---

## BLOCKER #1: Operator Route Tests

**Issue:** AuditEvent records created with actorId="test-actor" will block User deletion

**Sequence:**
1. Route handler emits AuditEvent(actorId: "test-actor")
2. Test ends, afterEach tries: User.delete(id: "test-actor")
3. FK constraint on AuditEvent.actorId fails
4. Test cleanup crashes

**Current fix:** NO AuditEvent cleanup

**Required fix:** Add AuditEvent cleanup BEFORE User deletion:
```typescript
await db.auditEvent.deleteMany({
  where: {
    actorId: "test-actor",
    workspaceId: testWorkspaceId,
  },
});
```

---

## BLOCKER #2: Decision Lifecycle Tests

**Issue:** Service called with testActorId (randomUUID) but no User exists

**Sequence:**
1. recordDecisionOutcome(testDecisionId, testWorkspaceId, {...}, testActorId)
2. Service calls emitAuditEvent(actorId: testActorId)
3. AuditEvent insert tries to reference User(testActorId)
4. FK constraint fails (no such User)
5. Test crashes before any assertions run

**Current fix:** NONE (record creation fails)

**Required fix:** Either:
- Option A: Create User(testActorId) in beforeEach
- Option B: Pass "test-actor" instead of testActorId to recordDecisionOutcome
- Option C: Add AuditEvent cleanup for testActorId (won't help, insert still fails)

---

## VERDICT

**D1_FIX_NOT_READY** ❌

**Reasons:**

1. ❌ **Operator Route tests will fail:** AuditEvent.actorId="test-actor" will block User deletion
2. ❌ **Decision Lifecycle tests will fail:** AuditEvent insert will fail (testActorId User doesn't exist)
3. ❌ **Claim in commit is contradicted by code:** Actor IDs are NOT consistent across test suites
4. ❌ **Required cleanup missing:** No AuditEvent deletion in afterEach

---

## REQUIRED FIXES

**Fix 1: Add AuditEvent cleanup for "test-actor"**
```typescript
await db.auditEvent.deleteMany({
  where: {
    actorId: "test-actor",
    workspaceId: testWorkspaceId,
  },
});
```
Insert BEFORE WorkspaceMembership deletion in afterEach (both suites)

**Fix 2: Align Decision Lifecycle test actorId**
Either:
- Create User(testActorId) in beforeEach, OR
- Pass "test-actor" instead of testActorId to recordDecisionOutcome, OR
- Add AuditEvent cleanup for testActorId

**Fix 3: Update verification document**
Correct the claim that AuditEvent cleanup is "not needed"

---

## CANNOT PROCEED

- ✗ f493dab8 cannot move to main
- ✗ CI must not be triggered
- ✗ AuditEvent FK issue blocks both test suites

**Next step:** Fix AuditEvent cleanup and actor ID alignment before re-verification

