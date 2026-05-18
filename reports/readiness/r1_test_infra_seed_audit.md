# R1 Test Infrastructure Seed Audit — Phase B

**Date**: 2026-05-18  
**Objective**: Audit seed system and determine why no test user exists in the database

---

## Executive Summary

The seed system is **incomplete and non-functional**. Three seed mechanisms exist but none are wired correctly:

1. **src/infra/seed.ts** — Isolated, never called, references non-existent models
2. **scripts/seed-test-db.ts** — Correct structure but fails on missing required fields
3. **src/seed.ts** — Empty file (1 line, no content)

No npm script, no prisma.seed configuration, no automatic bootstrap. The seed-test-db.ts script is **the only viable path** but requires fixes to pass all required Prisma validation.

---

## Detailed Audit Findings

### 1. Seed File Locations & Status

| File | Status | Purpose | Issues |
|------|--------|---------|--------|
| **src/infra/seed.ts** | Orphaned | Demo data seeding | Targets old v1 models (old User/ClientAccount API), never called, no reference in codebase |
| **scripts/seed-test-db.ts** | Broken | Test data bootstrap (only active path) | Missing required `updatedAt` on User create, missing fields on other models |
| **src/seed.ts** | Empty | Unknown | 1 line, no content |

### 2. Seed Invocation Path

**Current state**: No prisma.seed configuration exists.

```bash
# Checked in package.json — No seed script
npm run seed  # ❌ Not defined

# Checked in prisma/schema.prisma — No seed configuration  
# No `seed` parameter in `generator client` block

# Checked in .env — No PRISMA_SEED variable
```

**Result**: The only way to seed is manual execution:
```bash
DATABASE_URL="..." npx tsx scripts/seed-test-db.ts
```

But this **fails** on validation errors (see Section 3).

### 3. Seed Script Validation Failures

#### Error 1: User Model Missing `updatedAt`

**File**: scripts/seed-test-db.ts, line 65-73  
**Error**: 
```
PrismaClientValidationError:
Argument `updatedAt` is missing.
```

**Root cause**: User model schema requires `updatedAt`:
```prisma
model User {
  id        String @id @db.Uuid
  email     String @unique
  name      String?
  updatedAt DateTime @map("updated_at")  // ← NO @default, REQUIRED
}
```

**Current seed code**:
```typescript
const user = await prisma.user.upsert({
  where: { id: TEST_USER_ID },
  update: {},
  create: {
    id: TEST_USER_ID,
    email: "test-seed@example.com",
    name: "Test Seed User",
    // Missing: updatedAt
  },
});
```

#### Models with Required `updatedAt` (no @default)

Scanning schema.prisma reveals many models with `updatedAt DateTime @map("updated_at")` but **no @default**:

- **User** ❌
- **Action** ❌
- **AIProposalSandbox** ❌
- **Account** ❌
- **BusinessConditionProfile** ❌
- **ClientAccount** ❌
- **ClientContact** ❌
- **Decision** ❌
- **EngagementMembership** ❌
- **Evidence** ❌
- **Finding** ❌
- **FinancialBaseline** ❌
- **KPI** ❌
- **OperatorItem** ❌
- **Recommendation** ❌
- **RecommendationLegacy** ❌
- **Stage** ❌
- **User** ❌(referenced again in engagementMemberships)

**Models with @default**:
- **Workspace**: `updatedAt DateTime @default(now()) @map("updated_at")`
- **Engagement**: Missing updatedAt entirely

### 4. Seed Data Bootstrap Logic

#### User Creation (scripts/seed-test-db.ts, lines 63-74)

**Current approach**: upsert with deterministic TEST_USER_ID

```typescript
const user = await prisma.user.upsert({
  where: { id: TEST_USER_ID },
  update: {},
  create: {
    id: TEST_USER_ID,
    email: "test-seed@example.com",
    name: "Test Seed User",
    // ❌ MISSING FIELDS:
    // - updatedAt (required)
    // - hashedPassword (optional but needed for login)
  },
});
```

**Why it fails**: `updatedAt` is required by schema but not provided.

#### Workspace Creation (lines 76-89)

**Current approach**: upsert by slug

```typescript
const workspace = await prisma.workspace.upsert({
  where: { slug: "test-seed-workspace" },
  update: {},
  create: {
    id: TEST_WORKSPACE_ID,
    name: "Test Seed Workspace",
    slug: "test-seed-workspace",
    createdBy: TEST_USER_ID,
    description: "Test workspace for seed verification",
  },
});
```

**Status**: ✓ Should work (updatedAt has @default(now()))

#### WorkspaceMembership (lines 91-107)

**Current approach**: upsert by composite key (workspaceId_userId)

```typescript
const membership = await prisma.workspaceMembership.upsert({
  where: {
    workspaceId_userId: {
      workspaceId: TEST_WORKSPACE_ID,
      userId: TEST_USER_ID,
    },
  },
  update: {},
  create: {
    workspaceId: TEST_WORKSPACE_ID,
    userId: TEST_USER_ID,
    role: "owner",
  },
});
```

**Status**: ✓ Should work (check schema for updatedAt requirements)

#### ClientAccount Creation (lines 109-121)

```typescript
const client = await prisma.clientAccount.upsert({
  where: { id: TEST_CLIENT_ID },
  update: {},
  create: {
    id: TEST_CLIENT_ID,
    name: "Test Seed Client",
    industry: "Technology",
    status: "active",
  },
});
```

**Status**: ❓ Unknown if `updatedAt` required (ClientAccount has required updatedAt)

#### Engagement Creation (lines 123-141)

```typescript
const engagement = await prisma.engagement.upsert({
  where: { code: "TEST-SEED-001" },
  update: {},
  create: {
    id: TEST_ENGAGEMENT_ID,
    code: "TEST-SEED-001",
    title: "Test Seed Engagement",
    clientId: TEST_CLIENT_ID,
    workspaceId: TEST_WORKSPACE_ID,
    serviceTier: "standard",
    engagementMode: "expert",
    description: "Test engagement for seed verification",
    status: "draft",
    healthStatus: "healthy",
  },
});
```

**Status**: ⚠️ Engagement schema shows no `updatedAt` field in definition (need to verify)

### 5. Auth Bootstrap Logic

No explicit auth bootstrap exists. The seed script does NOT:
- Hash passwords
- Create sessions
- Set auth tokens
- Create API keys

**For browser testing to work**, manual steps would be needed:
1. Sign up via /signup endpoint (creates user + password hash)
2. Or manually insert hashed password via seed

### 6. Role Assignment & Membership Bootstrap

Seed currently creates:
- **User** + **Workspace** membership (owner role)
- **User** + **Engagement** membership (lead role)

This follows correct pattern but depends on User creation succeeding.

### 7. Test Factories Status

**File**: src/__tests__/prisma-mock-factory.ts  
**Status**: Mock factory for unit tests, NOT used for integration testing  
**Coverage**: Creates vi.fn() stubs for all major models

```typescript
export function createPrismaMock() {
  return {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), ... },
    workspace: { /* mocks */ },
    engagement: { /* mocks */ },
    // ... etc
  };
}
```

**Purpose**: For isolating business logic tests from database  
**Not applicable to**: Integration/end-to-end seed

---

## Root Cause Analysis

### Why No Test User Exists

1. **Seed system is disconnected**
   - No npm script
   - No prisma.seed configuration
   - Must be manually invoked

2. **Seed script fails on validation**
   - Tries to create User without required `updatedAt` field
   - Fails before any database writes
   - No error recovery or logging

3. **No automation in dev workflow**
   - `npm run dev` does NOT call seed
   - `npm run build` does NOT call seed
   - `npm test` does NOT call seed
   - Manual `npx tsx scripts/seed-test-db.ts` required

### Migration vs Schema Mismatch

Checked: `npx prisma migrate status` during Phase A — **No mismatches found**. Migrations have been applied correctly. The issue is NOT a schema drift problem; it's a seed input validation problem.

---

## Fix Approach

### Option A: Fix Seed Script (Minimal, Recommended)

Modify scripts/seed-test-db.ts to provide all required fields:

```typescript
const user = await prisma.user.upsert({
  where: { id: TEST_USER_ID },
  update: {},
  create: {
    id: TEST_USER_ID,
    email: "test-seed@example.com",
    name: "Test Seed User",
    hashedPassword: bcrypt.hashSync("test-password", 10),  // ← Add
    updatedAt: new Date(),                                  // ← Add
  },
});
```

Scan ALL models in seed script and add missing required fields before attempting upsert.

### Option B: Add prisma.seed Configuration (Future)

Add to prisma/schema.prisma:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
  seed     = "tsx scripts/seed-test-db.ts"
}
```

Add to package.json:

```json
{
  "scripts": {
    "db:seed": "prisma db seed"
  }
}
```

Then `npx prisma db seed` would auto-run. But requires Option A to succeed first.

### Option C: Add Seed Invocation to npm run dev

Modify dev script to run seed on startup. But difficult to ensure DB ready and migrations applied first.

---

## Acceptance Criteria for Phase C Fix

When seed script is fixed, these must succeed:

```bash
# 1. Seed completes without error
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsiq_test" \
npx tsx scripts/seed-test-db.ts
# Output: ✓ Test database seeded successfully

# 2. User exists in database
psql -U postgres -d opsiq_test -c "SELECT id, email, name FROM users LIMIT 1;"
# Output: One row with test-seed@example.com

# 3. Workspace exists
psql -U postgres -d opsiq_test -c "SELECT id, slug FROM workspaces LIMIT 1;"
# Output: One row with test-seed-workspace

# 4. User can authenticate (later in Phase E)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test-seed@example.com","password":"test-password-123"}'
# Output: HTTP 200 with session token
```

---

## Summary Table

| Component | Status | Root Cause | Fix Required |
|-----------|--------|-----------|-------------|
| Seed invocation | ❌ Missing | No prisma.seed config, no npm script | Wire scripts/seed-test-db.ts to package.json or prisma schema |
| Seed script validation | ❌ Failing | Missing required `updatedAt` + other fields on User/ClientAccount | Provide all required fields in upsert create block |
| Auth bootstrap | ❌ Incomplete | No password hashing in seed | Add bcrypt hashing or use signup endpoint |
| Test factories | ✓ OK | Mocks exist but not for integration tests | Use only for unit tests |
| Demo seed (src/infra/seed.ts) | ❌ Orphaned | References old API, never called | Remove or archive |
| Workspace/Engagement bootstrap | ✓ OK | Correctly structured, depends on User success | Will work once User creation fixed |

---

## Phase C: Seed Script Fixes — COMPLETED ✓

**Objective**: Fix seed script to successfully create test user + bootstrap data.

**Work completed**:
1. ✓ Identified all required fields missing in seed script
2. ✓ Added bcrypt password hashing for User model
3. ✓ Added `updatedAt: new Date()` to User, ClientAccount, Engagement
4. ✓ Added `id` field to EngagementMembership
5. ✓ Fixed adapter selection (PrismaPg for localhost, PrismaNeon for remote)
6. ✓ Tested: `DATABASE_URL="..." npx tsx scripts/seed-test-db.ts`

**Test result**: ✅ Seed script completes successfully

```
🌱 Seeding test database...
  ✓ Created user: 10000000-0000-0000-0000-000000000001 (test-seed@example.com)
  ✓ Created workspace: 20000000-0000-0000-0000-000000000001 (test-seed-workspace)
  ✓ Created workspace membership: 4f22f554-11f5-4b45-bcc1-49240eca485f
  ✓ Created client: 30000000-0000-0000-0000-000000000001 (Test Seed Client)
  ✓ Created engagement: 40000000-0000-0000-0000-000000000001 (TEST-SEED-001)
  ✓ Created engagement membership: 41000000-0000-0000-0000-000000000001
✓ Test database seeded successfully
```

**Data created**:
- **User**: test-seed@example.com (password: test-password-123, hashed)
- **Workspace**: test-seed-workspace (owner: test user)
- **Client**: Test Seed Client
- **Engagement**: TEST-SEED-001 (Premium level)
- **Memberships**: User linked to workspace (owner) and engagement (lead)

**Readiness check after seed**: ✓ is_ready=true
- Database: healthy
- Queue: healthy (depth: 0)
- Cache: healthy
- External services: reachable (Stripe, HubSpot)

---

## Next Step: Phase D

**Objective**: Install Playwright for browser automation testing.

**Expected**: npm install @playwright/test, configure playwright.config.ts, prepare for Phase E auth flow testing.
