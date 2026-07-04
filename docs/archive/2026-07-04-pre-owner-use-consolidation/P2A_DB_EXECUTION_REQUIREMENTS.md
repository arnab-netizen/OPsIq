# P2A Production-Path Test Execution Requirements

**Test File:** `src/__tests__/p2a/p2a-production-path.test.ts`  
**Date Generated:** 2026-06-02  
**Source:** Repository inspection (schema.prisma, env files, test setup)

---

## Database Requirements

### PostgreSQL Version
- **Minimum:** PostgreSQL 13+
- **Tested With:** PostgreSQL 14+ (recommended)
- **Source:** prisma/schema.prisma datasource uses standard PostgreSQL

### Database Instance Details
```
Protocol: postgresql
Default Host: localhost (configurable via DATABASE_URL)
Default Port: 5432
Test Database Name: opsiq_test (per .env.test)
Connection Pool: 5 (Prisma default)
```

---

## Environment Variables Required

### Primary
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/opsiq_test"
```

**Components:**
- Protocol: `postgresql://` (required, case-sensitive)
- User: database user with CREATE/INSERT/UPDATE/DELETE/SELECT permissions
- Password: (if required by database config)
- Host: `localhost` or remote host
- Port: `5432` (standard PostgreSQL)
- Database: `opsiq_test` (test database name)

### Supporting
```bash
NODE_ENV=test
```
(loads .env.test overrides)

**Source:** .env.test file (reference)

---

## Required Tables & Schema

### Core Tables (for test data setup)

The test performs `beforeAll()` setup creating these entities:

#### 1. workspaces
```sql
-- From: prisma/schema.prisma (Workspace model)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. client_accounts
```sql
-- From: prisma/schema.prisma (ClientAccount model)
CREATE TABLE client_accounts (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. engagements
```sql
-- From: prisma/schema.prisma (Engagement model, lines 271-326)
CREATE TABLE engagements (
  id UUID PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  client_id UUID NOT NULL REFERENCES client_accounts(id),
  service_tier VARCHAR(50) NOT NULL,
  engagement_mode VARCHAR(50) NOT NULL,
  workspace_id UUID REFERENCES workspaces(id),
  status VARCHAR(50) DEFAULT 'draft',
  health_status VARCHAR(50) DEFAULT 'healthy',
  intervention_mode VARCHAR(50) DEFAULT 'recovery',
  intervention_phase VARCHAR(50) DEFAULT 'triage',
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_blocked BOOLEAN DEFAULT FALSE,
  visibility VARCHAR(50) DEFAULT 'internal'
);
```

#### 4. evidence
```sql
-- From: prisma/schema.prisma (Evidence model, lines 359-386)
CREATE TABLE evidence (
  id UUID PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  source VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  evidence_type VARCHAR(100),
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. findings
```sql
-- From: prisma/schema.prisma (Finding model, lines 487-530)
CREATE TABLE findings (
  id UUID PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  primary_evidence_id UUID NOT NULL REFERENCES evidence(id),
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL,
  impact_area VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'identified',
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. recommendations
```sql
-- From: prisma/schema.prisma (Recommendation model, lines 756-793)
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  finding_id UUID REFERENCES findings(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  rationale TEXT,
  priority VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  constraints_considered JSON,
  version INT DEFAULT 1,
  visibility VARCHAR(50) DEFAULT 'internal',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 7. audit_events
```sql
-- From: prisma/schema.prisma (AuditEvent model, lines 58-80)
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  event_name VARCHAR(255) NOT NULL,
  actor_id UUID,
  entity_type VARCHAR(100),
  entity_id UUID,
  payload JSON,
  workspace_id UUID REFERENCES workspaces(id),
  visibility VARCHAR(50) DEFAULT 'internal',
  occurred_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Required Migrations

### Status Check
```bash
$ npx prisma migrate status
```

**Expected Output:**
```
Following migration have not yet been applied:
  (none - all migrations applied)
```

### Apply Pending Migrations
```bash
npx prisma migrate deploy
```

**Source:** prisma/migrations/ directory

**Validation:** All migration files in prisma/migrations/ must be applied to test database before test execution.

---

## Seed Data Requirements

### Automatic Setup (Test Handles)
The test file contains `beforeAll()` hook that creates:

1. **Workspace** (test data)
   ```
   id: <generated UUID>
   name: "P2A Test Workspace"
   slug: "p2a-test-<timestamp>"
   ```

2. **ClientAccount**
   ```
   id: <generated UUID>
   name: "P2A Test Client"
   ```

3. **Engagement**
   ```
   id: <generated UUID>
   code: "P2A-<timestamp>"
   title: "P2A Test Engagement"
   clientId: <from ClientAccount>
   serviceTier: "tier_1"
   engagementMode: "strategic_planning"
   workspaceId: <from Workspace>
   ```

4. **Evidence**
   ```
   id: <generated UUID>
   engagementId: <from Engagement>
   title: "P2A Test Evidence"
   description: "Test evidence for P2A"
   source: "test"
   status: "validated"
   ```

5. **Finding**
   ```
   id: <generated UUID>
   engagementId: <from Engagement>
   primaryEvidenceId: <from Evidence>
   title: "P2A Test Finding"
   summary: "Test finding for P2A"
   severity: "high"
   impactArea: "operational"
   ```

**Manual Seed Required:** NO (test creates all needed data)

---

## Prisma Client Requirements

### Generation
```bash
npx prisma generate
```

**Output Location:** `src/generated/prisma` (per schema.prisma generator config)

**Validation:** Must succeed without errors

### Database Adapter
```
Provider: @prisma/adapter-pg
(from: prisma/schema.prisma, line 1-5)
```

**Installation Check:**
```bash
npm list @prisma/adapter-pg
```

**Expected:** `@prisma/adapter-pg@*.*.*` (installed)

---

## Startup Sequence (Exact Order)

### 1. Environment Setup
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/opsiq_test"
export NODE_ENV=test
```

### 2. Database Connectivity Check
```bash
psql $DATABASE_URL -c "SELECT 1" # Should output: 1
```

**Expected:** Connection succeeds, query returns 1

### 3. Prisma Client Generation
```bash
npx prisma generate
```

**Expected:** No errors, client generated to src/generated/prisma

### 4. Apply Migrations
```bash
npx prisma migrate deploy
```

**Expected:** All migrations applied (0 pending)

### 5. Verify Schema
```bash
npx prisma db push --skip-generate
```

**Expected:** Schema in sync (no warnings)

### 6. Execute Test
```bash
npm test -- --run src/__tests__/p2a/p2a-production-path.test.ts
```

---

## Expected Test Execution Command

```bash
npm test -- --run src/__tests__/p2a/p2a-production-path.test.ts
```

### Environment Context
- **Working Directory:** `/home/user/OPsIq/` (repo root)
- **Node Version:** 18+ (from package.json engines)
- **Test Runner:** vitest (from package.json devDependencies)
- **Database:** PostgreSQL running, DATABASE_URL configured

### Expected Execution Duration
- **Setup:** ~2-3 seconds (test data creation)
- **Test Execution:** ~1-2 seconds (9 tests)
- **Cleanup:** ~1 second (teardown, data removal)
- **Total:** ~5-6 seconds

---

## Expected Pass Criteria

### All Tests Must Pass
```
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    ~5s
```

### Individual Test Expectations

#### Test 1: Import Check
```
✓ should import actual createRecommendation function
```
(verifies function is importable)

#### Test 2: Import Check
```
✓ should import actual updateRecommendation function
```

#### Test 3: Import Check
```
✓ should import actual getRecommendation function
```

#### Test 4: CREATE Path
```
✓ should call real createRecommendation with expectation fields
```
(verifies function callable with expectation fields: why_now, cost_of_inaction, expected_metric, expected_direction, expected_target)

#### Test 5: Database Persistence
```
✓ should verify expectation fields stored in constraintsConsidered JSON
```
(verifies all 5 fields present in Recommendation.constraintsConsidered JSON)

#### Test 6: GET Path
```
✓ should call real getRecommendation function
```

#### Test 7: UPDATE Path
```
✓ should call real updateRecommendation with expectation field changes
```

#### Test 8: UPDATE Persistence
```
✓ should verify expectation field changes persisted
```
(verifies fields updated in database)

#### Test 9: Audit Trail
```
✓ should verify audit events were emitted
```
(verifies audit_events table contains entries for recommendation operations)

---

## Failure Diagnostics

### If Tests Fail: Database Connection

**Error Pattern:**
```
Can't reach database server at 127.0.0.1:5432
```

**Checklist:**
- [ ] PostgreSQL running: `psql -l` succeeds
- [ ] DATABASE_URL set: `echo $DATABASE_URL` shows valid URL
- [ ] Credentials correct: `psql $DATABASE_URL -c "SELECT 1"` succeeds
- [ ] Host/port accessible: `nc -zv localhost 5432` shows open port

### If Tests Fail: Schema/Migrations

**Error Pattern:**
```
Invalid table name or column does not exist
```

**Checklist:**
- [ ] Migrations applied: `npx prisma migrate status` shows 0 pending
- [ ] Tables exist: `psql $DATABASE_URL -c "\dt"` lists all tables
- [ ] Prisma generated: `ls src/generated/prisma/` is not empty

### If Tests Fail: Test Logic

**Error Pattern:**
```
Expected X to be Y (assertion failure)
```

**Checklist:**
- [ ] Recommendation.constraintsConsidered JSON field exists (schema)
- [ ] createRecommendation accepts why_now, cost_of_inaction, expected_metric, expected_direction, expected_target (service.ts)
- [ ] Audit events being emitted (audit service integration)

---

## Validation Checklist

Before executing test, confirm:

- [ ] PostgreSQL 13+ running
- [ ] DATABASE_URL environment variable set to test database
- [ ] `psql $DATABASE_URL -c "SELECT 1"` succeeds
- [ ] `npx prisma migrate status` shows 0 pending migrations
- [ ] `npm list @prisma/adapter-pg` shows installed
- [ ] `npx prisma generate` completes without error
- [ ] Test file exists: `ls -l src/__tests__/p2a/p2a-production-path.test.ts`
- [ ] Node version 18+: `node --version`
- [ ] vitest installed: `npm list vitest`

---

## Repository Truth Sources

| Requirement | Source |
|-------------|--------|
| Schema & Tables | prisma/schema.prisma (models) |
| Migrations | prisma/migrations/ directory |
| Environment | .env.test, .env.example |
| Database Adapter | prisma/schema.prisma line 1-5 |
| Test Config | vitest.config.ts, tsconfig.json |
| Node Version | package.json engines field |
| Dependencies | package.json dependencies, devDependencies |

---

## Next Steps

When database is available:

1. **Prepare:** Configure DATABASE_URL and start PostgreSQL
2. **Verify:** Run pre-flight checklist above
3. **Execute:** Run test command
4. **Validate:** Confirm 9/9 tests pass
5. **Close Debt:** Update TEST_DEBT_REGISTER.md, mark P2A-001 CLOSED
6. **Approve:** Enterprise readiness signoff

