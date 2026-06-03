# P2B D1 Actor FK Alignment Hostile Verification

**Date:** 2026-06-03  
**Commit:** c1776279  
**Status:** **D1_ACTOR_ALIGNMENT_NOT_READY** ❌

---

## TASK 1 — Diff Verification

**Files Changed:**
- ✓ P2B_D1_ACTOR_FK_ALIGNMENT_VERIFICATION.md (new)
- ✓ src/__tests__/p2b/real-route-tests.test.ts (modified)

**Diff Content:**
- ✓ testActorId = "test-actor" (2 locations, lines 43 and 320)
- ✓ AuditEvent cleanup added (2 afterEach blocks)
- ✓ No production code changed
- ✓ No assertions weakened
- ✓ No tests skipped

**Status:** ✓ Files and diff acceptable

---

## TASK 2 — Actor Consistency Verification

**Operator Route Tests (Suite 1):**

| Component | Value | Status |
|-----------|-------|--------|
| testActorId (line 43) | "test-actor" | ✓ |
| User fixture id (line 53) | "test-actor" | ✓ |
| WorkspaceMembership userId (line 63) | "test-actor" | ✓ |
| AuditEvent cleanup actorId (line 94) | testActorId = "test-actor" | ✓ |
| Mock session userId | "test-actor" (see TASK 2 blocker) | ⚠ MISSING |

**Decision Lifecycle Tests (Suite 2):**

| Component | Value | Status |
|-----------|-------|--------|
| testActorId (line 320) | "test-actor" | ✓ |
| User fixture id (line 330) | "test-actor" | ✓ |
| WorkspaceMembership userId (line 340) | "test-actor" | ✓ |
| recordDecisionOutcome actor arg (lines 404, 442, 473) | testActorId = "test-actor" | ✓ |
| AuditEvent cleanup actorId (line 371) | testActorId = "test-actor" | ✓ |

**Verdict:** All actor IDs internally consistent ✓

---

## CRITICAL BLOCKER: MISSING AUTH MOCK

**Issue:** The vi.mock for @/services/auth is MISSING from real-route-tests.test.ts

**Evidence:**

Commit 3d4b8d5c ("Fix P2B real route auth harness") contained:
```typescript
vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: {
        id: "test-actor",
        email: "test@example.com",
        ...
      },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: "test-actor",
      roles: [...],
    },
    invalidReason: undefined,
  })),
}));
```

Commit b4710a4f (my first D1 fix) **removed this mock entirely**.

Current file (c1776279): **Mock still missing**

**Consequence:**

Route tests call operatorPost() which uses canonical-route-enforcement wrapper.

Wrapper calls:
```typescript
const sessionFact = await getSessionFact(undefined);
const policyFact = await getPolicyContextFact(undefined);
```

Without the vi.mock:
- getSessionFact() returns undefined/errors (not mocked)
- policyFact returns undefined/errors (not mocked)
- Wrapper fails: "session valid but user context missing" (line 367 of canonical-route-enforcement.ts)
- Handler never executes
- Route tests fail with auth error, not route logic error

**Impact:** Operator Route tests cannot execute without this mock

---

## TASK 3 — Fixture Schema Validity

**User Fixture:**
```typescript
await db.user.create({
  data: {
    id: "test-actor",
    email: testActorEmail,
    updatedAt: new Date(),
  },
});
```

Schema verification (from earlier):
- ✓ id: required
- ✓ email: required  
- ✓ updatedAt: required (no @default)

**Verdict:** ✓ Valid

**WorkspaceMembership Fixture:**
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

Schema verification:
- ✓ userId: required
- ✓ workspaceId: required
- ✓ role: required
- ✓ isActive: has @default(true), provided for clarity
- ✗ NO invalid fields (joinedAt, updatedAt removed)

**Verdict:** ✓ Valid

---

## TASK 4 — Cleanup Order and Scope Verification

**Operator Route Tests afterEach (lines 89-108):**

```typescript
await db.auditEvent.deleteMany({
  where: {
    actorId: testActorId,         // ✓ Scoped to testActorId
    workspaceId: testWorkspaceId, // ✓ Scoped to testWorkspaceId
  },
});
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

**Order:** AuditEvent → WorkspaceMembership → OperatorItem → User

**Analysis:**
- ✓ AuditEvent deleted first (FK parent)
- ✓ WorkspaceMembership deleted second (FK child of User)
- ✓ OperatorItem deleted third (may have FK to User via verifiedBy)
- ✓ User deleted last (FK parent)
- ✓ All deleteMany operations properly scoped (no global deletes)

**Verdict:** ✓ Correct order and scope

**Decision Lifecycle Tests afterEach:** Identical structure ✓

---

## TASK 5 — Cross-Test Collision Analysis

**Risk: "test-actor" User created in both test suites**

| Factor | Analysis |
|--------|----------|
| Parallel execution | Vitest runs tests in same file sequentially (default) |
| Suite isolation | Each describe block is independent within file |
| Cleanup order | afterEach runs after each test completes |
| Collision window | Between end of test suite 1 and start of suite 2 |
| Risk level | LOW - User deleted after suite 1, re-created for suite 2 |

**verified-lifecycle.test.ts collision:** Different test file, different context, isolated database state

**Verdict:** ✓ No collision risk - sequential execution and proper cleanup

---

## TASK 6 — Local Validation

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

## COMPREHENSIVE VERDICT

**D1_ACTOR_ALIGNMENT_NOT_READY** ❌

**Reasons:**

1. ❌ **CRITICAL: Auth mock is missing** (vi.mock for @/services/auth)
   - Removed in b4710a4f, never restored
   - Route tests require mocked getSessionFact/getPolicyContextFact
   - Without mock: operatorPost() fails with auth error
   - Handler never executes (blocked at wrapper level)

2. ✓ Actor IDs are consistent ("test-actor" across all components)

3. ✓ Fixture schema is valid (no invalid fields remain)

4. ✓ Cleanup order is correct (AuditEvent → ... → User)

5. ✓ Cross-test collision risk is low (sequential execution)

---

## BLOCKER SUMMARY

**The commit c1776279 cannot be merged or tested because:**

- Route tests (operatorPost) cannot execute without auth mock
- Decision Lifecycle tests (recordDecisionOutcome) can execute but assume auth mock exists elsewhere
- Mock was deleted in b4710a4f and never restored

**Required fix before re-verification:**

Restore the vi.mock for @/services/auth from commit 3d4b8d5c:

```typescript
/**
 * Mock authentication facts to allow wrapped route handler to execute.
 * The canonical wrapper validates session and policy before calling the handler.
 * These mocks provide valid facts so the wrapper allows execution.
 */
vi.mock("@/services/auth", () => ({
  getSessionFact: vi.fn(async () => ({
    valid: true,
    session: {
      user: {
        id: "test-actor",
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      sessionId: "test-session",
      expiresAt: new Date(Date.now() + 86400000),
    },
    invalidReason: undefined,
  })),
  getPolicyContextFact: vi.fn(async () => ({
    valid: true,
    policy: {
      userId: "test-actor",
      roles: [
        {
          role: "admin",
          scope: "workspace",
          scopeId: "test-workspace",
        },
      ],
      engagementMemberships: [],
    },
    invalidReason: undefined,
  })),
}));
```

---

## CANNOT PROCEED

- ✗ c1776279 cannot move to main
- ✗ CI must not be triggered
- ✗ Auth mock must be restored before CI can run

**Next action:** Restore auth mock from commit 3d4b8d5c and re-submit for verification

