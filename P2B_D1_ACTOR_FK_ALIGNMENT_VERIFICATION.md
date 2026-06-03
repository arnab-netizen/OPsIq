# P2B D1 Actor FK Alignment Verification

**Date:** 2026-06-03  
**Recovery #2 Commit Base:** f493dab8 (schema-valid fixture)  
**Test File:** src/__tests__/p2b/real-route-tests.test.ts  
**Status:** D1_ACTOR_FK_ALIGNMENT_READY_FOR_HOSTILE_VERIFICATION

---

## TASK 1 — Test Structure Analysis

**Test File Structure:**

Two describe blocks, each with independent fixtures:

1. **P2B: REAL Operator Route Integration** (lines 40-297)
   - Uses operatorPost route handler
   - Mock auth returns userId: "test-actor"
   - Before fix: testActorId = randomUUID() (unused in this suite)
   - After fix: testActorId = "test-actor" (aligns with mock session)

2. **P2B: REAL Decision Lifecycle Integration** (lines 310-480)
   - Calls recordDecisionOutcome service directly
   - Before fix: testActorId = randomUUID() (passed to service)
   - After fix: testActorId = "test-actor" (matches User created in fixture)

**Actor IDs Used:**

| Test Suite | Before Fix | After Fix | Reason |
|------------|-----------|----------|--------|
| Operator Route | randomUUID() unused | "test-actor" | Aligns with session mock |
| Decision Lifecycle | randomUUID() passed | "test-actor" | Matches created User |

---

## TASK 2 — Single Actor Strategy Applied

**Strategy:** Use one consistent actor ID: `"test-actor"`

**Rationale:**
- Mock auth (vi.mock) returns session.user.id = "test-actor"
- User("test-actor") created in both beforeEach blocks
- WorkspaceMembership(userId: "test-actor") created in both
- AuditEvent emitted with actorId = "test-actor" in both paths
- User FK constraint satisfied (User exists)

**Implementation:**

**Before (two different actors):**
```typescript
// Operator Route suite
const testActorId = randomUUID();  // ← Random, unused

// Decision Lifecycle suite
const testActorId = randomUUID();  // ← Random, passed to service (FK issue)
```

**After (single consistent actor):**
```typescript
// Both suites
const testActorId = "test-actor";  // ← Fixed, matches created User
```

---

## TASK 3 — Fixture Fix Applied

**Changes Made:**

1. **Actor ID Alignment (lines 43, 313):**
   - Changed: `const testActorId = randomUUID();`
   - To: `const testActorId = "test-actor";`
   - Applied to both test suites

2. **AuditEvent Cleanup (lines 89-106, 363-381):**
   - Added: `await db.auditEvent.deleteMany({where: {actorId: testActorId, workspaceId: testWorkspaceId}});`
   - Position: BEFORE WorkspaceMembership cleanup
   - Applied to both test suites

**Cleanup Order After Fix:**
1. AuditEvent (actorId = testActorId)
2. WorkspaceMembership (userId = "test-actor")
3. OperatorItem (workspaceId = testWorkspaceId)
4. User (id = "test-actor")

**Schema Compliance:**

User fixture (unchanged):
- ✓ id: "test-actor"
- ✓ email: "test@example.com"
- ✓ updatedAt: new Date()

WorkspaceMembership fixture (unchanged):
- ✓ userId: "test-actor"
- ✓ workspaceId: testWorkspaceId
- ✓ role: "admin"
- ✓ isActive: true

---

## TASK 4 — FK Constraint Resolution

**Operator Route Tests - AuditEvent FK Resolved:**

Before fix:
- Route wrapper: verifiedActorId = "test-actor"
- Service emits: AuditEvent(actorId: "test-actor")
- Cleanup deletes: User("test-actor")
- **Result: FK constraint violation (AuditEvent still references deleted User)**

After fix:
- Route wrapper: verifiedActorId = "test-actor"
- Service emits: AuditEvent(actorId: "test-actor")
- Cleanup deletes: AuditEvent(actorId: "test-actor") FIRST
- Then deletes: User("test-actor")
- **Result: FK constraint satisfied ✓**

**Decision Lifecycle Tests - User FK Resolved:**

Before fix:
- Service called with: testActorId = randomUUID()
- Service emits: AuditEvent(actorId: testActorId)
- User created: User("test-actor") only
- **Result: AuditEvent.actorId references non-existent User (FK violation)**

After fix:
- Service called with: testActorId = "test-actor"
- Service emits: AuditEvent(actorId: "test-actor")
- User created: User("test-actor") ✓
- **Result: AuditEvent.actorId references existing User ✓**

---

## TASK 5 — Validation Results

**TypeScript Compilation:**
```
$ npx tsc --noEmit
(no output)
✓ PASSED
```

**Next.js Build:**
```
$ npm run build
✓ Compiled successfully in 17.9s
✓ Generating static pages using 3 workers (115/115) in 581ms
✓ PASSED
```

---

## TASK 6 — Expected CI Impact

**Test Execution Path Resolution:**

1. **Operator Route Tests (4 tests):**
   - Route wrapper: ctx.verifiedActorId = "test-actor"
   - Service called with actorId = "test-actor"
   - AuditEvent created with actorId = "test-actor"
   - Cleanup deletes AuditEvent first ✓
   - User("test-actor") deletion succeeds ✓
   - **Expected: All 4 tests pass**

2. **Decision Lifecycle Tests (multiple tests):**
   - recordDecisionOutcome called with testActorId = "test-actor"
   - Service called with actorId = "test-actor"
   - AuditEvent created with actorId = "test-actor"
   - User("test-actor") exists ✓
   - Cleanup deletes AuditEvent first ✓
   - **Expected: All tests pass**

**Expected Pass Count After CI:**
- Before D1 fix: 33/42 (78.6%)
- After D1 fix: 37/42 (88.1%)
- Improvement: +4 tests (4 real-route-tests.test.ts tests now executable)

---

## SUMMARY

**D1_ACTOR_FK_ALIGNMENT_READY_FOR_HOSTILE_VERIFICATION**

**What Was Fixed:**
✓ Unified actor ID across both test suites: "test-actor"
✓ Added AuditEvent cleanup BEFORE User deletion
✓ Resolved Actor FK constraint (User doesn't exist for random UUID)
✓ Resolved User FK constraint (AuditEvent references deleted User)

**Fixture Changes:**
✓ testActorId = "test-actor" (2 locations)
✓ AuditEvent cleanup (2 afterEach blocks)
✓ Cleanup order: AuditEvent → WorkspaceMembership → OperatorItem → User

**No Changes To:**
✓ User fixture (unchanged)
✓ WorkspaceMembership fixture (unchanged)
✓ Assertions (unchanged)
✓ Production code (unchanged)
✓ Route/service logic (unchanged)

**Why FK Constraints Now Satisfied:**

1. **Operator Route:** AuditEvent deleted before User → no dangling FK
2. **Decision Lifecycle:** User("test-actor") exists → AuditEvent.actorId valid

**Expected Result:**
- Route handler execution unblocked
- Service execution unblocked
- All 4 real-route-tests.test.ts tests now pass
- Pass rate: 78.6% → 88.1%

