# DATABASE_URL Configuration Strategy

## CI/CD Environment (GitHub Actions)
**Status:** READY ✓

### PostgreSQL Service Configuration
- **Image:** postgres:16
- **User:** postgres
- **Password:** postgres
- **Database:** opsiq_test
- **Port:** 5432 (localhost in CI)
- **Health Check:** pg_isready with 5 retries, 10s start period

### CI Environment Variables
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/opsiq_test
NODE_ENV=test
```

### CI Workflow Steps
1. PostgreSQL service starts (health-checked)
2. `npm ci` - Install dependencies
3. `npx tsc --noEmit` - Type checking (no DB required)
4. `npx prisma validate` - Schema validation (requires DATABASE_URL)
5. `npx prisma migrate deploy` - Run migrations (requires DATABASE_URL, modifies DB)
6. `npm run build` - Next.js build (requires DATABASE_URL for dynamic routes)
7. `npm test` - Full test suite with DB access

### Expected CI Test Results
- **Phase 0-12 tests:** ✓ PASS (runtime-verified implementations)
- **Growth engine tests (Phase 9):** ✓ PASS (358/358 - all logic bugs fixed)
- **Phase 3 event sourcing tests:** ✓ PASS (once migrations run)
  - event-emitter-integration.test.ts (12 tests)
  - event-replay-engine.test.ts (18 tests)
  - hardening-proofs.test.ts (51 tests)

**Total expected:** 3845+ tests PASS

---

## Local Development Environment

### Current Status: NO LOCAL DATABASE
```bash
DATABASE_URL is not set (missing credentials)
```

### Option 1: Docker Compose (Recommended)
```bash
# Create docker-compose.yml in project root
version: '3.8'
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: opsiq_test
    ports:
      - 5432:5432
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Then run:
```bash
docker-compose up -d
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test
npx prisma migrate deploy
npm test
```

### Option 2: Local PostgreSQL Installation
```bash
# macOS
brew install postgresql@16
brew services start postgresql@16
createdb opsiq_test

# Linux
sudo apt-get install postgresql-16
sudo -u postgres createdb opsiq_test

# Set environment variable
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test
npx prisma migrate deploy
npm test
```

### Option 3: Skip Local DB Tests
```bash
# Run only non-DB tests locally
npm test -- --exclude "**/*db*" --exclude "**/phase-3-*" --exclude "**/event-*"

# Or set empty DATABASE_URL to fail-closed
unset DATABASE_URL
npm test  # Will skip DB tests gracefully
```

---

## Verification Commands

### Verify CI Workflow Ready
```bash
# Check workflow syntax
cat .github/workflows/ci.yml | grep -A 5 "postgres:"
cat .github/workflows/ci.yml | grep "DATABASE_URL"
cat .github/workflows/ci.yml | grep "prisma migrate"
```

### Verify Database Connectivity (if local DB available)
```bash
psql -U postgres -d opsiq_test -c "SELECT version();"
```

### Run Migrations
```bash
npx prisma migrate deploy
```

### Run Tests with Database
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test npm test
```

---

## Database Blocker Status

### Local Environment
- **Status:** BLOCKED_DB_REQUIRED
- **Reason:** DATABASE_URL not configured, no local PostgreSQL running
- **Remediation:** See "Option 1: Docker Compose" above
- **Impact:** 81 tests skipped (phase-3 event sourcing)

### CI Environment (GitHub Actions)
- **Status:** READY ✓
- **Postgres:** Provisioned in workflow service
- **Migrations:** Deployed before tests
- **Expected:** All 3845 tests PASS

### Test Verification Strategy
1. **Local:** Run non-DB tests only (358 growth tests pass)
2. **CI:** Full suite with real PostgreSQL (all 3845 tests expected to pass)
3. **Before Merge:** GitHub Actions must pass all 3845 tests
4. **Definition of Done (A3):** CI workflow passes 3845 tests AND npx prisma migrate deploy succeeds

---

## Implementation Checklist

- [x] PostgreSQL 16 service in CI workflow
- [x] DATABASE_URL env vars configured in CI
- [x] Health checks configured (pg_isready)
- [x] Prisma migrate deploy step added
- [x] NODE_ENV=test set
- [x] All CI steps require DATABASE_URL
- [ ] Local Docker Compose setup (optional - user chooses)
- [ ] Local test execution with DB (optional - user chooses)

## Notes for Team
- **Do not use SQLite** for testing - must be PostgreSQL 16
- **Do not mock event sourcing** - must use real persistence
- **CI is source of truth** - Local dev without DB is acceptable, but PR merge requires CI verification
- **Database blocker is legitimate** - Phase 3, B2, C2+ require database; local execution without DB should not claim completion
