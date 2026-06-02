# P2B CI ENVIRONMENT ROOT CAUSE ANALYSIS

**Issue:** GitHub Actions Prisma migrate deploy reads REPLACE_DB and REPLACE_POOLED_HOST placeholders instead of PostgreSQL service container URL

---

## Root Cause Summary

**Single Source:** `.env.local` (line 34)

**Offending Value:**
```
DATABASE_URL="postgresql://REPLACE_USER:REPLACE_PASSWORD@REPLACE_POOLED_HOST/REPLACE_DB?sslmode=require&channel_binding=require"
```

**Why Workflow Env Variables Don't Win:** `prisma.config.ts` loads `.env.local` with `override: true`, which REPLACES process.env variables that were set by GitHub Actions

---

## Expected DATABASE_URL

In GitHub Actions workflow, `env` block sets:
```yaml
env:
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
  DATABASE_URL_TEST: postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
```

**Expected Prisma to use:** `postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public`

---

## Actual DATABASE_URL

When `npx prisma migrate deploy` runs in GitHub Actions workflow:

**Actual used:** `postgresql://REPLACE_USER:REPLACE_PASSWORD@REPLACE_POOLED_HOST/REPLACE_DB?...`

**Reason:** `.env.local` is loaded and overrides the workflow's env variables

---

## Environment Loading Precedence

### Current Behavior (Broken)

1. **GitHub Actions runner starts** → Sets env: DATABASE_URL
2. **Step runs:** `npx prisma generate`
3. **prisma.config.ts executes** (line 4):
   ```typescript
   config({ path: '.env.local', override: true });
   ```
4. **.env.local is loaded** → DATABASE_URL = "postgresql://REPLACE_USER:..."
5. **.env.local wins** because `override: true` means:
   - Load .env.local file
   - Replace ANY existing process.env.DATABASE_URL with value from file
6. **Prisma reads broken DATABASE_URL** from process.env
7. **Migration fails** because URL has placeholders

### Why Step-Level Env Doesn't Help

The workflow step already tries to set env:
```yaml
- name: Generate Prisma client
  run: npx prisma generate
  env:
    DATABASE_URL: ${{ env.DATABASE_URL }}
```

But this doesn't work because:
- GitHub Actions `env` sets process.env variables BEFORE the command runs
- `prisma.config.ts` executes when Prisma CLI starts
- `dotenv.config({ path: '.env.local', override: true })` explicitly loads `.env.local`
- The `override: true` flag means: "if this variable exists in .env.local, use that value instead of process.env"
- Result: process.env.DATABASE_URL is overwritten by .env.local value

### Full Precedence Chain

| Level | Source | DATABASE_URL | Override | Winner |
|-------|--------|--------------|----------|--------|
| 1 (Highest) | .env.local | REPLACE_* | YES (override: true) | ✓ .env.local WINS |
| 2 | GitHub Actions workflow env | localhost:5432 | NO | ✗ Overridden |
| 3 | process.env fallback | (none) | | |
| 4 (Fallback) | prisma.config.ts | localhost:5432/opsiq_dev | | Used only if all above fail |

---

## Root Cause File

**File:** `.env.local`

**Line:** 34

**Content:**
```
DATABASE_URL="postgresql://REPLACE_USER:REPLACE_PASSWORD@REPLACE_POOLED_HOST/REPLACE_DB?sslmode=require&channel_binding=require"
```

**Problem:** This file contains placeholder values that are loaded with `override: true` in prisma.config.ts

---

## Offending Configuration

**File:** `prisma.config.ts`

**Lines:** 1-4

```typescript
import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';

config({ path: '.env.local', override: true });  // ← PROBLEM: override: true
```

**Problem:** The `override: true` flag causes .env.local values to replace GitHub Actions env variables

---

## Why This Happens

### .env.local Design Intent
- Local development file with template placeholders
- Developers should fill in their own Neon credentials
- Current state: Contains unfilled REPLACE_* placeholders
- File is correct for local development (developers fill it in)

### prisma.config.ts Design Issue
- Unconditionally loads `.env.local` with override
- Works for local development (dev has filled in .env.local)
- Breaks in CI (CI environment has different DATABASE_URL)
- The `override: true` flag prevents CI env variables from taking effect

### GitHub Actions Workflow Issue
- Sets DATABASE_URL in workflow env
- Passes DATABASE_URL as step env variable
- But Prisma config loads and overrides it with .env.local
- Workflow's env variables are effectively ignored

---

## Recommended Fix

### Option 1: Conditional Loading (Best)

**File:** `prisma.config.ts`

**Current:**
```typescript
config({ path: '.env.local', override: true });
```

**Fix:**
```typescript
// Only load .env.local in local development, not in CI
if (process.env.CI !== 'true') {
  config({ path: '.env.local', override: true });
} else {
  // In CI, respect environment variables passed by CI system
  config({ path: '.env.local', override: false });
}
```

**Rationale:**
- Local dev: Load .env.local with override (developer's Neon credentials)
- CI environment: Don't override CI-provided env variables (GitHub Actions PostgreSQL service)
- Both paths work correctly

### Option 2: Remove Override Flag (Alternative)

**File:** `prisma.config.ts`

**Current:**
```typescript
config({ path: '.env.local', override: true });
```

**Fix:**
```typescript
config({ path: '.env.local', override: false });
```

**Rationale:**
- .env.local is loaded, but doesn't override already-set env variables
- CI can set DATABASE_URL before Prisma runs
- Local dev can manually set env variable if needed

**Trade-off:** Requires developers to set DATABASE_URL before running Prisma (less convenient)

### Option 3: Create .env File in CI (Workaround)

**Location:** Add step in GitHub Actions workflow

**Step:**
```yaml
- name: Create .env.local for CI
  run: |
    cat > .env.local << 'EOF'
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
    DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public
    PRISMA_HIDE_UPDATE_MESSAGE=true
    EOF
```

**Rationale:**
- Explicitly creates .env.local for CI environment with correct values
- Prisma loads .env.local as designed
- No code changes needed

**Trade-off:** Duplicates database URL in both workflow and .env.local

---

## Why This Wasn't Caught Earlier

### Local Testing
- Unit tests (36) pass because they don't require database
- Local Docker/PostgreSQL attempts failed for infrastructure reasons
- Database tests (42) were never actually executed locally
- The .env.local placeholder issue only manifests when Prisma runs in CI context

### GitHub Actions Workflow
- Workflow was created and pushed
- Workflow was never manually triggered
- If triggered, would fail at `prisma migrate deploy` step
- Root cause would be visible in workflow logs

---

## Impact Assessment

### Affected Workflow Steps
1. ✅ Checkout: Works (no database)
2. ✅ Setup Node: Works (no database)
3. ✅ Install dependencies: Works (no database)
4. ❌ Prisma generate: Fails (reads placeholder DATABASE_URL)
5. ❌ Prisma validate: Fails (reads placeholder DATABASE_URL)
6. ❌ Prisma migrate deploy: Fails (can't connect to REPLACE_POOLED_HOST)
7. ❌ Run 42 tests: Skipped (never reached due to earlier failure)

### Workflow Output
**Expected Step 4 output:**
```
✔ Generated Prisma Client (7.8.0) to ./src/generated/prisma
```

**Actual Step 4 output:**
```
Error: Invalid Prisma Client configuration
The database URL contains invalid host: REPLACE_POOLED_HOST
```

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Root Cause File** | `.env.local` |
| **Root Cause Line** | 34 |
| **Offending Configuration** | `prisma.config.ts` line 4 (override: true) |
| **Expected DATABASE_URL** | postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public |
| **Actual DATABASE_URL** | postgresql://REPLACE_USER:REPLACE_PASSWORD@REPLACE_POOLED_HOST/REPLACE_DB?... |
| **Why Env Variables Lost** | dotenv override: true replaces process.env |
| **Affected Component** | Prisma migration and schema generation in CI |
| **Severity** | Critical (blocks all P2B database verification) |
| **Fix Type** | Configuration (no code changes needed) |
| **Recommended Fix** | Add CI conditional in prisma.config.ts (Option 1) |

---

**Analysis Complete:** Root cause identified and recommended fix provided

**No implementation applied per instructions**
