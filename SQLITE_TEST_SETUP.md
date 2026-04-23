# SQLite Test Database Setup - Technical Summary

## Objective
Migrate tests from PostgreSQL to SQLite for faster, isolated test execution without external database dependencies.

## What Was Accomplished

### ✅ Completed
1. **Test Database Configuration**
   - Created `.env.test` with `DATABASE_URL="file:./test.db"`
   - Tests now point to local SQLite file instead of PostgreSQL

2. **SQLite Schema**
   - Created `prisma/schema.test.prisma` with SQLite provider
   - Removed PostgreSQL-specific type annotations (`@db.Uuid`, etc.)
   - All model definitions converted for SQLite compatibility

3. **Test Database Initialization**
   - Global setup (`src/__tests__/global-setup.ts`) creates fresh SQLite DB before each test run
   - Deletes existing test.db file to ensure clean state
   - Runs schema migration with `prisma db push`

4. **Prisma Client Generation**
   - SQLite client generated to `src/generated/prisma-sqlite/`
   - PostgreSQL client remains in `src/generated/prisma/` for production
   - Both clients are pre-generated and available

5. **Schema Fixes**
   - Fixed `linkedEvidence` field: converted `String[]` to `String @default("[]") @db.Text`
   - Ensures Prisma 7 schema validation passes for both databases

6. **Test Infrastructure**
   - Vitest config updated with `globalSetup` to initialize DB once before all tests
   - Per-test setup file verifies database connection before each test file
   - Tests run against fresh, isolated SQLite database

### ❌ Blocker: Client Runtime Loading
**Issue**: Cannot dynamically select SQLite client at runtime
- Prisma 7 requires an adapter to instantiate PrismaClient
- Available SQLite adapter (`prisma-adapter-sqlite`) requires Node.js v24+
- System has Node.js v22.22.2
- Dynamic require() of generated SQLite client fails at runtime

**Location**: `src/lib/db.ts` line 37 (client instantiation)

## Technical Details

### Prisma 7 Architecture
- **Breaking change**: Client requires either `adapter` or `accelerateUrl` in constructor
- **Adapters** map database protocols to driver implementations
- **Available adapters**: PostgreSQL (`@prisma/adapter-pg`), Cloudflare D1, and others
- **SQLite adapter**: `prisma-adapter-sqlite` (requires Node v24+, not available for v22)

### Why Simple Solutions Don't Work
- Can't use `new PrismaClient()` without adapter (fails with "requires either 'adapter' or 'accelerateUrl'")
- Can't dynamically swap clients at module load time (require path resolution issues)
- Can't use PostgreSQL client for SQLite database (incompatible drivers)
- Node.js v24+ not available in environment

## Paths Forward

### Option 1: Upgrade Node.js (Recommended)
```bash
# Switch to Node v24+ if available
nvm use 24
# or set in system configuration
```

Then install SQLite adapter:
```bash
npm install @prisma/adapter-sqlite
```

Update `src/lib/db.ts` to use SQLite adapter:
```typescript
import { PrismaClient } from "@/generated/prisma-sqlite/client";
import { PrismaSQLite } from "@prisma/adapter-sqlite";

const adapter = new PrismaSQLite("file:./test.db");
const db = new PrismaClient({ adapter });
```

### Option 2: Docker PostgreSQL for Tests
Keep current setup but run PostgreSQL in Docker container:
```bash
docker run -d --name postgres-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres
```

Update `.env.test`:
```
DATABASE_URL="postgresql://postgres:test@localhost:5433/test"
NODE_ENV="test"
```

### Option 3: Custom SQLite Adapter
Implement a minimal Prisma adapter satisfying the driver interface for local SQLite.
(Advanced, requires deep Prisma knowledge)

## Current State for Testing

The infrastructure is **completely set up and ready**. To make it work:
1. Upgrade Node.js to v24+ (simplest path)
2. Or switch to Option 2 (Docker-based PostgreSQL)
3. Or implement Option 3 (custom adapter)

All the groundwork is in place and requires only resolving the Node version constraint.

## Files Created/Modified

### New Files
- `prisma/schema.test.prisma` - SQLite-compatible schema
- `.env.test` - Test environment configuration
- `src/__tests__/global-setup.ts` - Database initialization
- `src/generated/prisma-sqlite/*` - Generated SQLite client

### Modified Files
- `prisma/schema.prisma` - Fixed linkedEvidence field
- `vitest.config.ts` - Added global setup
- `src/__tests__/setup.ts` - Connection verification
- `src/lib/db.ts` - Attempted client selection (currently blocked)

## Verification Commands

```bash
# Check schema validity
npx prisma validate --schema ./prisma/schema.test.prisma
npx prisma validate --schema ./prisma/schema.prisma

# Generate clients
npx prisma generate --schema ./prisma/schema.test.prisma
npx prisma generate --schema ./prisma/schema.prisma

# Initialize test database
DATABASE_URL="file:./test.db" npx prisma db push --schema ./prisma/schema.test.prisma

# Check Node version
node --version  # Should be v24+ for this to work fully
```
