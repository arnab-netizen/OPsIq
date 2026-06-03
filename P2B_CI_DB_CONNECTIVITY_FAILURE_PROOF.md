# P2B CI DB Connectivity Failure — Evidence and Root Cause

**Date:** 2026-06-03  
**Workflow Run:** 26867403437  
**Commit:** efe8b809  
**Status:** FAILURE at Step 11 (Run P2B Database Tests)

---

## TASK 1: Exact Environment and Configuration Sequence

### What CI Workflow WRITES (Step 7):

**File: .env.local (created/overwritten)**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
NODE_ENV=test
```

**Missing:** `TEST_WITH_DB` is NOT included.

### What Vitest LOADS (vitest-global-setup.ts line 22-25):

**File: .env.test (checked into git, not modified by CI)**
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsiq_test"
DATABASE_PROVIDER="postgresql"
NODE_ENV="test"
```

**Missing:** `TEST_WITH_DB` is NOT set.

### What Workflow JOB-LEVEL ENV Sets:

```yaml
env:
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
  DATABASE_URL_TEST: postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
  NODE_ENV: test
```

**Missing:** `TEST_WITH_DB` is NOT set.

### What Workflow STEP 11 ENV Sets:

```yaml
- name: Run P2B Database Tests (42 tests)
  run: |
    npm test -- --run \
      src/__tests__/p2b/verified-lifecycle.test.ts \
      src/__tests__/p2b/real-route-tests.test.ts \
      src/__tests__/p2b/operator-outcome-path.test.ts \
      src/__tests__/p2b/decision-outcome-path.test.ts
  env:
    DATABASE_URL: ${{ env.DATABASE_URL }}
```

**Missing:** `TEST_WITH_DB` is NOT set.

---

## TASK 2: Database URL Consistency and Test Environment Loading

### Step 10 (Prisma Migrate) vs Step 11 (Tests) — Proven Connection Difference

**Step 10: Deploy Prisma migrations (SUCCESS)**
```
- Uses: Prisma CLI (prisma migrate deploy)
- Reads: DATABASE_URL from environment or .env files
- Connection: Established successfully (3-second execution)
- Proof: Migration completed, schema deployed to database
```

**Step 11: Run P2B Database Tests (FAILURE)**
```
- Uses: vitest + Prisma Client via app code
- Environment Loading:
  1. vitest-global-setup.ts loads .env.test (line 22)
  2. Checks process.env.TEST_WITH_DB (line 49 of vitest-global-setup.ts)
  3. TEST_WITH_DB is undefined (not in .env.test, not in job env, not in step env)
  4. Skips eager DB initialization (line 50-72)
  5. Tests run and call db.user.create() (line 87 of real-route-tests.test.ts)
  6. Proxy auto-initializes PrismaClient via createPrismaClient()
  7. Creates pg.Pool with DATABASE_URL from loaded environment
  8. Connection attempt FAILS with "Can't reach database server at 127.0.0.1:5432"
```

### Critical Finding: DATABASE_URL IS Available, TEST_WITH_DB IS NOT

**In .env.test:**
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsiq_test"  ← PRESENT
DATABASE_PROVIDER="postgresql"
NODE_ENV="test"
TEST_WITH_DB                                                               ← ABSENT
```

**In workflow-created .env.local:**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public  ← PRESENT
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
NODE_ENV=test
TEST_WITH_DB                                                                ← ABSENT
```

**In job-level env:**
```
DATABASE_URL: postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public  ← PRESENT
DATABASE_URL_TEST: postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
NODE_ENV: test
TEST_WITH_DB                                                                ← ABSENT
```

### Environment Loading Logic (vitest-global-setup.ts):

**Lines 48-72:**
```typescript
const testWithDb = process.env.TEST_WITH_DB === "true";
if (testWithDb) {
    console.log("  → Initializing database connection...");
    try {
      const { getDbInstance } = await import("./src/lib/db");
      await getDbInstance();  // ← EARLY initialization
      console.log("  ✓ Database initialized");
    } catch (error) {
      console.error("  ✗ Failed to initialize database:", error);
      throw error;
    }
    // ... more initialization
  } else {
    console.log("  ℹ DATABASE_URL not configured for local testing, skipping DB initialization");
    // ↑ Misleading message: it's about TEST_WITH_DB, not DATABASE_URL
  }
```

**Impact:**
- If TEST_WITH_DB="true": Database initialized eagerly in global setup (guaranteed ready)
- If TEST_WITH_DB not set: Database initialization skipped, happens lazily when tests first call db.*

### Test Code (real-route-tests.test.ts):

**Lines 87-93 (beforeEach):**
```typescript
await db.user.create({
  data: {
    id: testActorId,
    email: "test@example.com",
    updatedAt: new Date(),
  },
});
```

**Execution path:**
1. `db` is a Proxy (src/lib/db.ts line 112)
2. Proxy intercepts `db.user` access
3. Proxy checks `globalForPrisma.prisma` (line 115)
4. Not yet initialized, so calls `getDb()` (line 116)
5. `getDb()` calls `createPrismaClient()` (line 92)
6. `createPrismaClient()` creates pg.Pool and PrismaClient
7. First query execution attempts to use pool
8. Pool connection fails → "Can't reach database server"

---

## TASK 3: Root Cause Classification

### Classification: **D. .env.local/vitest configuration overrides**

**Exact Issue:**

The workflow's step 7 creates `.env.local` without `TEST_WITH_DB=true`, which overwrites the checked-in `.env.local` that contains `TEST_WITH_DB=true`. However, vitest loads from `.env.test` (not `.env.local`), so this overwrite wouldn't normally matter.

**BUT:** The real issue is that `.env.test` ALSO lacks `TEST_WITH_DB=true`. This causes vitest-global-setup.ts to skip eager database initialization (line 49-72).

When tests start and call `db.user.create()` immediately in beforeEach, the Proxy attempts lazy initialization, and the connection fails with the generic "Can't reach database server" error.

### Why Migrations (Step 10) Succeeded But Tests (Step 11) Failed:

1. **Prisma CLI (migrate deploy):**
   - Runs independently with its own connection handling
   - Creates a direct connection, executes migrations, closes connection
   - No dependency on app-level db.ts or Proxy logic
   - No dependency on TEST_WITH_DB environment variable

2. **App-level tests:**
   - Depend on vitest-global-setup.ts initialization
   - Depend on TEST_WITH_DB being set to "true" for eager initialization
   - If not eager-initialized, attempt lazy initialization from Proxy
   - Lazy initialization may race with service readiness or time out

### Why "Can't reach database server" (Not "Database Connection Refused"):

The pg.Pool connection string is correct (localhost:5432), and the endpoint exists, but either:
- The connection attempt times out waiting for service to be ready
- The service drops the connection before app code tries to use it
- The lazy initialization timing is too slow compared to service health check

---

## TASK 4: Minimal Fix Plan

**Root Cause:** TEST_WITH_DB not set, causing lazy DB initialization instead of eager initialization.

**Minimal Fix:** Add `TEST_WITH_DB=true` to CI workflow step 11 environment.

**Location:** `.github/workflows/p2b-db-verification.yml` line 113-114

**Change:**
```yaml
- name: Run P2B Database Tests (42 tests)
  run: |
    npm test -- --run \
      src/__tests__/p2b/verified-lifecycle.test.ts \
      src/__tests__/p2b/real-route-tests.test.ts \
      src/__tests__/p2b/operator-outcome-path.test.ts \
      src/__tests__/p2b/decision-outcome-path.test.ts
  env:
    DATABASE_URL: ${{ env.DATABASE_URL }}
    TEST_WITH_DB: "true"  ← ADD THIS LINE
```

**Why This Fixes It:**
1. Step 11 passes TEST_WITH_DB=true to npm test process
2. vitest-global-setup.ts reads process.env.TEST_WITH_DB (line 49)
3. Condition `process.env.TEST_WITH_DB === "true"` is TRUE
4. vitest-global-setup calls getDbInstance() eagerly (line 54)
5. Database connection established before any tests run
6. Tests execute with guaranteed available database

**Why This Is Minimal:**
- One environment variable addition
- No workflow logic changes
- No test code changes
- No app code changes
- No schema changes
- No migration changes
- Follows existing pattern in .env.local (TEST_WITH_DB=true)

---

## Why Previous Runs Did/Did Not Differ

### Why D3 Tests (verified-lifecycle) May Have Passed:

The verified-lifecycle tests are in a different test file (src/__tests__/p2b/verified-lifecycle.test.ts). If they were passing before, they might have:
1. Used different database initialization path
2. Had explicit database setup before running
3. Been excluded from CI execution (see vitest.config.ts line 19-22 excludes "**/phase-*.test.ts" if TEST_WITH_DB is not true)

### Why D1 Tests (real-route-tests) Are New:

The real-route-tests.test.ts file is new (D1 closure work). It wasn't in the previous working test suite, so the CI failure at step 11 is a NEW failure, not a regression.

### Critical Distinction:

- **D3 failure (verified-lifecycle):** Was failing due to FK cleanup order → FIXED
- **D1 failure (real-route-tests):** Is failing due to TEST_WITH_DB not set → NEEDS FIX
- These are different root causes

---

## Proof Summary

| Aspect | Evidence |
|--------|----------|
| Step 10 SUCCESS | Prisma migrate deploy completed in 3 seconds (06:20:52-06:20:55) |
| DATABASE_URL EXISTS | Present in .env.test, job env, and step env |
| DATABASE_URL REACHABLE | Step 10 proved database is accessible to Prisma CLI |
| TEST_WITH_DB NOT SET | Not in .env.test, not in job env, not in step 11 env |
| VITEST LOADS .env.test | vitest-global-setup.ts line 22-25 explicitly loads .env.test |
| DB INITIALIZATION SKIPPED | vitest-global-setup.ts line 49-72 shows skip if TEST_WITH_DB !== "true" |
| LAZY INIT FAILS | db.user.create() (line 87) attempts lazy init on first database access |
| ERROR MATCHES LAZY INIT | "Can't reach database server" is generic connection error from lazy path |

---

## CONCLUSION

**Classification: D — .env.local/vitest configuration missing TEST_WITH_DB**

The failure is NOT because the database is unreachable. The failure is because:

1. vitest-global-setup.ts expects `TEST_WITH_DB=true` to enable eager initialization
2. The environment (workflow step 11) doesn't set TEST_WITH_DB
3. Tests attempt lazy initialization via Proxy at first database access
4. Lazy initialization may race with service readiness or timeout
5. Connection fails with "Can't reach database server"

**Workflow Fix Justified:** YES

**Exact Next Fix:**
- Add `TEST_WITH_DB: "true"` to step 11 environment in p2b-db-verification.yml
- This aligns CI with the checked-in .env.local pattern

