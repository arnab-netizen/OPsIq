# P2B DATABASE EXECUTION CHECKLIST

**Purpose:** Verify database environment before running 42 P2B tests

**Execution Path:** Docker PostgreSQL (postgres:16-alpine)

---

## PRE-EXECUTION CHECKLIST

### Step 0: Clean State Verification

- [ ] No opsiq-test-db container running
  ```bash
  docker ps | grep opsiq-test-db || echo "✓ No existing container"
  ```

- [ ] No PostgreSQL processes on port 5432
  ```bash
  lsof -i :5432 || echo "✓ Port 5432 available"
  ```

---

## PHASE 1: ENVIRONMENT SETUP

### Step 1.1: Docker Container Start

**Command:**
```bash
docker run -d \
  --name opsiq-test-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=opsiq_test \
  -p 5432:5432 \
  postgres:16-alpine
```

**Expected Output:**
```
<container-id>
```

**Verification:**
```bash
docker ps | grep opsiq-test-db
```

- [ ] Container is running
- [ ] Port 5432 is mapped
- [ ] Database opsiq_test exists

**Stop on Failure:** Cannot proceed to Prisma verification without running PostgreSQL

---

### Step 1.2: Startup Wait

**Command:**
```bash
sleep 5 && echo "✓ PostgreSQL startup complete"
```

**Why:** PostgreSQL needs time to initialize database

**Verification:**
```bash
docker logs opsiq-test-db | grep "database system is ready"
```

- [ ] PostgreSQL is ready to accept connections

**Stop on Failure:** Connection errors in next step indicate PostgreSQL not ready

---

### Step 1.3: Connection Verification

**Command:**
```bash
timeout 5 psql -h localhost -U postgres -d opsiq_test -c "SELECT 1" || \
  (echo "FAILED: Cannot connect to opsiq_test database"; exit 1)
```

**Expected Output:**
```
 ?column?
──────────
        1
(1 row)
```

- [ ] psql command succeeds
- [ ] Database query returns result
- [ ] Connection timeout does NOT occur

**If psql not installed:**
```bash
docker exec opsiq-test-db psql -U postgres -d opsiq_test -c "SELECT 1"
```

**Stop on Failure:** Cannot proceed with Prisma without database connectivity

---

## PHASE 2: PRISMA VERIFICATION

### Step 2.1: Prisma Generate

**Command:**
```bash
npx prisma generate
```

**Expected Output:**
```
✔ Generated Prisma Client (7.8.0) to ./src/generated/prisma in Xms
```

**Verification:**
```bash
ls -la src/generated/prisma/index.d.ts
```

- [ ] Prisma Client generated without errors
- [ ] Client output directory exists
- [ ] No TypeScript errors in generation

**Stop on Failure:** Prisma client must be generated

---

### Step 2.2: Prisma Validate

**Command:**
```bash
npx prisma validate
```

**Expected Output:**
```
The schema at prisma/schema.prisma is valid 🚀
```

- [ ] Schema validation passes
- [ ] No critical warnings (deprecation warnings OK)

**Stop on Failure:** Invalid schema cannot connect to database

---

### Step 2.3: Environment Variable Verification

**Command:**
```bash
echo "Test DATABASE_URL:" && \
  cat .env.test | grep DATABASE_URL && \
  echo "" && \
  echo "Current environment DATABASE_URL:" && \
  echo "${DATABASE_URL:-UNSET}"
```

**Expected Output:**
```
Test DATABASE_URL:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsiq_test"

Current environment DATABASE_URL:
UNSET
```

**Verification:**
```bash
grep "DATABASE_URL" .env.test | grep "localhost:5432"
```

- [ ] .env.test has localhost:5432 connection string
- [ ] Connection string matches running container

**Note:** Tests load .env.test automatically, main DATABASE_URL should remain UNSET

---

## PHASE 3: MIGRATION VERIFICATION

### Step 3.1: Prisma Migrate Status

**Command:**
```bash
npx prisma migrate status
```

**Expected Output:**
```
Migrations to apply:
  20260415_000000_init
  ... (all 41 migrations)
  20260602_add_recommendation_attribution
```

**Verification:**
- [ ] Shows list of migrations ready to apply
- [ ] 41 migrations listed
- [ ] P2B migrations included (20260602_*)

**If all migrations already applied:**
```
Database schema is up to date!
```

This is OK - migrations may be applied on demand

---

### Step 3.2: Prisma Migrate Apply (if needed)

**Command:**
```bash
npx prisma migrate deploy
```

**Expected Output:**
```
Migrations to apply:
  20260415_000000_init
  ... (migrations listed)

✔ Database migrated successfully
```

Or if already migrated:
```
No pending migrations to apply.
```

**Verification:**
```bash
npx prisma db execute --stdin <<EOF
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public';
EOF
```

- [ ] Migration succeeds (or all already applied)
- [ ] Database tables created
- [ ] No migration errors

**Stop on Failure:** Cannot run tests without schema

---

### Step 3.3: P2B Schema Fields Verification

**Command:**
```bash
docker exec opsiq-test-db psql -U postgres -d opsiq_test -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='operator_item' \
   AND column_name IN ('actualOutcome', 'verificationStatus', 'verificationMethod') \
   ORDER BY column_name;"
```

**Expected Output:**
```
      column_name
──────────────────
 actualOutcome
 verificationMethod
 verificationStatus
(3 rows)
```

- [ ] actualOutcome column exists
- [ ] verificationStatus column exists
- [ ] verificationMethod column exists

**If columns missing:** P2B migrations were not applied; run Step 3.2 again

---

## PHASE 4: SEED VERIFICATION (OPTIONAL)

### Step 4.1: Database Isolation Check

**Command:**
```bash
docker exec opsiq-test-db psql -U postgres -d opsiq_test -c \
  "SELECT COUNT(*) as test_data_count FROM operator_item;"
```

**Expected Output:**
```
 test_data_count
─────────────────
               0
(1 row)
```

- [ ] Database is empty (no pre-existing test data)
- [ ] Tests will create their own data

**If data exists:** May indicate incomplete cleanup from prior run
- Option 1: Proceed (tests use unique IDs via Date.now())
- Option 2: Drop and restart container:
  ```bash
  docker stop opsiq-test-db && docker rm opsiq-test-db
  # Then return to Step 1.1
  ```

---

## PHASE 5: TEST EXECUTION

### Step 5.1: Pre-Test Sanity Check

**Command:**
```bash
npm test -- --run src/__tests__/p2b/outcome-classifier.test.ts 2>&1 | tail -5
```

**Expected Output:**
```
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

- [ ] Unit test still passes (confirms test infrastructure works)

**If fails:** Stop and investigate test environment

---

### Step 5.2: Run All 42 P2B Database Tests

**Command:**
```bash
npm test -- --run \
  src/__tests__/p2b/verified-lifecycle.test.ts \
  src/__tests__/p2b/real-route-tests.test.ts \
  src/__tests__/p2b/operator-outcome-path.test.ts \
  src/__tests__/p2b/decision-outcome-path.test.ts
```

**Expected Output Pattern:**
```
 Test Files  4 passed (4)
      Tests  42 passed (42)
   Start at  HH:MM:SS
   Duration  XXs (transform XXms, setup XXms, import XXms, tests XXms, environment XXms)
```

**Verification Checklist:**
- [ ] Test Files: All 4 test files pass
- [ ] Tests: All 42 tests pass
- [ ] No skipped tests (e.g., .skip or .only)
- [ ] No mocked or stubbed database calls
- [ ] Database writes actually persisted
- [ ] Audit trail entries created
- [ ] Evidence blobs stored intact
- [ ] Cleanup (afterEach) executed successfully

**Test Breakdown:**
- [ ] verified-lifecycle.test.ts: 12 PASS
- [ ] real-route-tests.test.ts: 6 PASS
- [ ] operator-outcome-path.test.ts: 10 PASS
- [ ] decision-outcome-path.test.ts: 14 PASS

---

### Step 5.3: Log Analysis

**Command:**
```bash
npm test -- --run src/__tests__/p2b/verified-lifecycle.test.ts 2>&1 | grep -E "(PASS|FAIL|✓|✗|error)" | tail -20
```

- [ ] No errors in output
- [ ] No connection failures
- [ ] No timeout errors
- [ ] All assertions passed

---

## PHASE 6: POST-TEST CLEANUP

### Step 6.1: Container Cleanup

**Command:**
```bash
docker stop opsiq-test-db && docker rm opsiq-test-db
```

**Expected Output:**
```
opsiq-test-db
opsiq-test-db
```

**Verification:**
```bash
docker ps | grep opsiq-test-db || echo "✓ Container removed"
```

- [ ] Container stopped
- [ ] Container removed
- [ ] Port 5432 freed

---

## PASS/FAIL CRITERIA

### PASS Condition (All Required)
✅ Docker container starts successfully  
✅ PostgreSQL is reachable at localhost:5432  
✅ Prisma generates without errors  
✅ Prisma schema validates  
✅ All migrations apply successfully  
✅ P2B schema fields exist (actualOutcome, verificationStatus, verificationMethod)  
✅ All 4 test files execute  
✅ All 42 tests pass  
✅ No tests are skipped  
✅ No tests are mocked or stubbed  
✅ Database writes are verified (values read back from DB match written values)  
✅ Audit trail entries persist  
✅ Evidence blobs store and retrieve correctly  
✅ Cleanup completes without errors  
✅ Container stops and removes successfully  

**If ANY above is missing:** FAIL

### FAIL Condition (Any of)
❌ Docker container fails to start  
❌ PostgreSQL port 5432 unreachable after startup  
❌ Prisma generate fails  
❌ Prisma schema validation fails  
❌ Migrations fail to apply  
❌ P2B schema fields missing from database  
❌ Any test file fails to execute  
❌ Any of 42 tests fail  
❌ Any test is skipped (e.g., test.skip())  
❌ Database queries are mocked instead of real  
❌ Database values don't persist (read-back differs from written)  
❌ Audit trail not appended  
❌ Evidence blobs truncated or malformed  
❌ Cleanup fails  

---

## Remediation (If Fails)

### If Docker fails to start:
```bash
docker run -it --rm -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=opsiq_test \
  postgres:16-alpine
```
Check error output; may need Docker daemon restart

### If PostgreSQL unreachable:
```bash
docker logs opsiq-test-db
```
Check if PostgreSQL is still initializing; wait longer

### If migrations fail:
```bash
npx prisma migrate reset
npx prisma migrate deploy
```
Reset and reapply all migrations (will lose data, but safe in test DB)

### If tests fail:
```bash
npm test -- --run src/__tests__/p2b/verified-lifecycle.test.ts --reporter=verbose
```
Run single test file with verbose output to identify failure

---

## Checklist Duration Estimate

| Phase | Time |
|-------|------|
| Phase 1: Environment Setup | 10-15s |
| Phase 2: Prisma Verification | 5-10s |
| Phase 3: Migration Verification | 3-5s |
| Phase 4: Seed Verification | 2-3s |
| Phase 5: Test Execution | 40-80s |
| Phase 6: Cleanup | 2-3s |
| **TOTAL** | **60-120s** |

---

**Checklist Complete:** Ready for Task 4 (Dry Run)
