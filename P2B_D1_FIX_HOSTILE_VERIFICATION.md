# P2B D1 Fix Hostile Verification

**Date:** 2026-06-03  
**Commit:** b4710a4f (P2B D1 fix: Add User and WorkspaceMembership fixtures)  
**Status:** **D1_FIX_NOT_READY** ❌

---

## TASK 1 — Commit Location

**Finding:** Commit b4710a4f is on:
- ✓ Local branch: `claude/opsiq-hostile-security-audit-HhrDv`
- ✓ Remote branch: `origin/claude/opsiq-hostile-security-audit-HhrDv`
- ✗ NOT on main or origin/main

**Status:** Safe location (not yet merged to main)

---

## TASK 2 — Diff Inspection

**Files Changed:**
1. `P2B_D1_AUTH_HARNESS_FIX_VERIFICATION.md` (386 lines added, new)
2. `src/__tests__/p2b/real-route-tests.test.ts` (72 lines added)

**Diff Summary:**
- ✓ Only test file and documentation changed
- ✓ No production code modified
- ✓ No assertions weakened
- ✓ No tests skipped
- ✓ No mocks added beyond existing auth mocks
- ✓ Applied identically to both test suites (Operator Route + Decision Lifecycle)

**Concern Identified:** WorkspaceMembership fixture uses non-existent schema fields

---

## TASK 3 — Prisma Schema FK Requirements

**User Model (lines 1063-1096):**

Required fields (no default):
- `id: String @id` (required)
- `email: String @unique` (required)
- `updatedAt: DateTime` (required, no @default)

Optional fields:
- `name: String?`
- `hashedPassword: String?`
- `deactivatedAt: DateTime?`

Default fields:
- `isActive: Boolean @default(true)`
- `version: Int @default(1)`
- `createdAt: DateTime @default(now())`

**Fixture Creates:** id, email, updatedAt ✓ COMPLETE

---

**WorkspaceMembership Model (lines 1139-1155):**

Required fields (no default):
- `id: String @id @default(dbgenerated())` (has default, but provided)
- `workspaceId: String @db.Uuid` (required, no default)
- `userId: String @db.Uuid` (required, no default)
- `role: String` (required, no default)

Optional fields:
- `addedBy: String? @db.Uuid`
- `removedAt: DateTime?`

Default fields:
- `addedAt: DateTime @default(now())` ← **Note: not updatedAt**
- `isActive: Boolean @default(true)`

**Unique Constraints:**
- `@@unique([workspaceId, userId])` ← Prevents duplicate memberships

FK Relationships:
- `user: User @relation(fields: [userId], references: [id], onDelete: Cascade)`
- `workspace: Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)`

---

## TASK 4 — Fixture Completeness Analysis

**Fixture Code (lines 61-71 of real-route-tests.test.ts):**

```typescript
await db.workspaceMembership.create({
  data: {
    id: randomUUID(),              // ✓ Provided (has @default)
    userId: "test-actor",           // ✓ Required
    workspaceId: testWorkspaceId,   // ✓ Required
    role: "admin",                  // ✓ Required
    isActive: true,                 // ✓ Has @default(true), provided
    joinedAt: new Date(),           // ✗ INVALID - schema field is "addedAt"
    updatedAt: new Date(),          // ✗ INVALID - no such field in schema
  },
});
```

**Critical Errors:**

| Field | Fixture | Schema | Status | Error |
|-------|---------|--------|--------|-------|
| id | randomUUID() | @id @default() | ✓ OK | - |
| userId | "test-actor" | String required | ✓ OK | - |
| workspaceId | testWorkspaceId | String required | ✓ OK | - |
| role | "admin" | String required | ✓ OK | - |
| isActive | true | @default(true) | ✓ OK | - |
| joinedAt | new Date() | DOESN'T EXIST | ✗ FAIL | Prisma unknown field error |
| updatedAt | new Date() | DOESN'T EXIST | ✗ FAIL | Prisma unknown field error |
| addedAt | (not provided) | @default(now()) | ⚠ OK | Uses default, but not explicit |

**Fixture Defects:**
1. **Unknown field `joinedAt`:** Schema has `addedAt`, not `joinedAt`
2. **Unknown field `updatedAt`:** WorkspaceMembership model has no updatedAt field
3. Both are at lines 68-69

**Consequence:** Fixture creation will fail with Prisma validation error:
```
Unknown field "joinedAt" in record argument
Unknown field "updatedAt" in record argument
```

Test will crash in beforeEach before any route logic executes.

---

## TASK 5 — Hidden Risks Assessment

### Risk #1: Duplicate User ID "test-actor" Across Tests ✓ SAFE
- real-route-tests.test.ts creates User("test-actor") in BOTH suites
- Each suite's beforeEach/afterEach are independent
- No parallel execution of same suite
- Risk: LOW

### Risk #2: Duplicate Email "test@example.com" ✓ SAFE
- Schema has `email: String @unique`
- Both suites use same email (testActorEmail = "test@example.com")
- Tests run sequentially (Vitest default in single test file)
- Each afterEach deletes the User before next test suite
- Risk: LOW

### Risk #3: Duplicate WorkspaceMembership Unique Constraint ✓ SAFE
- Schema has `@@unique([workspaceId, userId])`
- Each test uses randomUUID() for testWorkspaceId
- Each afterEach cleans up before next test
- Risk: LOW

### Risk #4: Collision with verified-lifecycle Tests ✓ SAFE
- verified-lifecycle.test.ts uses different User id (testAdminId = randomUUID())
- verified-lifecycle doesn't create WorkspaceMembership
- Different test files, different databases per test isolation
- Risk: LOW

### Risk #5: AuditEvent FK Cleanup Missing ⚠ CONDITIONAL
- If route handler calls emitAuditEvent(testAdminId, ...), AuditEvent records created
- AuditEvent has FK to User.id
- Fixture deletes User without first deleting AuditEvent records
- If AuditEvent exists, FK constraint violation occurs in afterEach
- **However:** Test doesn't explicitly create testAdminId User, only "test-actor"
- Route handler may emit AuditEvent with "test-actor" as actorId
- Then afterEach would fail deleting User("test-actor")
- Risk: **MEDIUM to HIGH**

### Risk #6: Invalid Fixture Creation ❌ CRITICAL
- Fixture uses non-existent schema fields (joinedAt, updatedAt)
- Prisma will reject fixture creation with validation error
- Test fails in beforeEach before any route execution
- Risk: **CRITICAL — BLOCKS ALL TESTS**

---

## TASK 6 — Verdict Assessment

### Blocking Issues Found:

**Issue #1: Unknown Schema Fields (CRITICAL)**
- Lines 68-69 in WorkspaceMembership.create()
- `joinedAt: new Date()` → Schema field is `addedAt`
- `updatedAt: new Date()` → No such field in WorkspaceMembership model
- **Impact:** Fixture creation fails immediately in beforeEach
- **Severity:** BLOCKS all route tests
- **Fix Required:** Remove invalid fields (use schema defaults)

**Issue #2: Potential AuditEvent FK Cleanup Risk (MEDIUM)**
- If route handler calls emitAuditEvent(actor="test-actor", ...)
- AuditEvent records created with actorId = "test-actor"
- AfterEach tries to delete User("test-actor") without cleaning AuditEvent first
- **Impact:** FK constraint violation in afterEach cleanup
- **Severity:** TEST FAILURE (may appear to pass if no audit events created)
- **Status:** Unknown if current fixture triggers this path

---

## TASK 7 — Classification

**D1_FIX_NOT_READY**

**Reasons:**
1. ❌ **Critical: Invalid Prisma fixture fields** (joinedAt, updatedAt don't exist in schema)
2. ⚠ **Medium: AuditEvent cleanup missing** (may cause FK violations)
3. ❌ **Fixture will fail to create in database** before any route logic executes

**Verdict:** Cannot merge to main. Cannot trigger CI.

---

## TASK 8 — Blockers Summary

| Blocker | Severity | Location | Fix Required |
|---------|----------|----------|--------------|
| Invalid field `joinedAt` | CRITICAL | real-route-tests.test.ts:68 | Remove (use addedAt @default) |
| Invalid field `updatedAt` | CRITICAL | real-route-tests.test.ts:69 | Remove (no such field) |
| AuditEvent cleanup missing | MEDIUM | real-route-tests.test.ts afterEach | Conditional: add if route emits audit events |

---

## Final Assessment

**Commit b4710a4f: NOT READY FOR MAIN**

**Cannot Proceed Because:**
1. Fixture uses non-existent Prisma schema fields
2. Tests will fail in beforeEach (fixture creation fails)
3. Potential secondary issue: AuditEvent cleanup order

**Required Actions Before Merge:**
1. Fix WorkspaceMembership.create() to remove `joinedAt` and `updatedAt`
2. Verify route handler doesn't create AuditEvent records with fixture actor ID
3. If audit events are created, add cleanup before User deletion
4. Re-validate TypeScript compilation
5. Create corrected fixture in new commit

**Do NOT:**
- Merge to main
- Trigger CI
- Move commit anywhere

**Status:** Awaiting fixture correction

