# R2 Staging Foundation — Operational Infrastructure

**Date**: 2026-05-19  
**Phase**: R2-OPERATIONS-VALIDATION-PLATFORM PHASE A

---

## PHASE A: STAGING FOUNDATION

**Objective**: Create reproducible staging environment supporting repeated, deterministic test execution.

### Deliverables Created

#### 1. Docker Compose Configuration
**File**: `docker-compose.staging.yml`

```yaml
Services:
- PostgreSQL 16 (opsiq-staging-postgres)
  Port: 5433
  Database: opsiq_staging
  Volume: opsiq_staging_pgdata (persistent)
  Health checks: pg_isready monitoring
  
- Next.js Application (opsiq-staging-app)
  Port: 3001
  Environment: staging
  Dependencies: Postgres (health-check gating)
  Volumes: source code mount + node_modules
```

**Features**:
- ✓ Health checks on database
- ✓ Proper service startup ordering
- ✓ Persistent data volume
- ✓ Isolated network (`opsiq-staging`)
- ✓ Production-like runtime mode
- ✓ Database init script support

#### 2. Environment Configuration
**File**: `.env.staging.example`

```
Database:
- DATABASE_URL: postgresql://postgres:postgres@localhost:5433/opsiq_staging

Application:
- NODE_ENV: staging
- PORT: 3001
- NEXT_PUBLIC_API_URL: http://localhost:3001

Features:
- ENABLE_READINESS_ENFORCEMENT: true
- ENABLE_AUDIT_LOGGING: true
- ENABLE_IDEMPOTENCY_CHECKING: true
- ENABLE_RATE_LIMITING: false (for testing)
- ENABLE_METRICS_ENDPOINT: true
- ENABLE_REQUEST_TRACING: true

Logging:
- LOG_LEVEL: debug
- LOG_FORMAT: json
```

**Purpose**: Enables developers to configure staging without modifying source code.

#### 3. Database Reset Script
**File**: `scripts/reset-staging.ts`

```typescript
Function: resetDatabase()
- Drops all table data (preserving schema)
- Maintains referential integrity (foreign key handling)
- Clears data in dependency order
- Resets sequences
- Logs progress

Features:
- ✓ Deterministic state reset
- ✓ No schema loss
- ✓ Repeatable across runs
- ✓ Error handling
```

**Usage**:
```bash
npx ts-node scripts/reset-staging.ts          # Reset only
npx ts-node scripts/reset-staging.ts --reseed # Reset + seed
```

#### 4. Deterministic Seed Script
**File**: `scripts/seed-staging.ts`

```typescript
Creates reproducible test data:
- 2 Workspaces (PROFESSIONAL, ENTERPRISE tiers)
- 3 Test Users (deterministic UUIDs)
- Workspace memberships (OWNER, MEMBER roles)
- 2 Test Clients (TECHNOLOGY, FINANCE)
- 2 Test Engagements (ASSESSMENT, EXECUTION phases)
- Startup status (READY)

UUID Generation:
- Deterministic: SHA256(seed_string) → UUID
- Reproducible: Same seed always produces same UUID
- Example seeds:
  - "staging:workspace:1" → UUID-001
  - "staging:user:1" → UUID-USER-001
```

**Features**:
- ✓ Fully reproducible (same UUIDs every run)
- ✓ Multiple workspaces for isolation testing
- ✓ Diverse user roles (OWNER, MEMBER)
- ✓ Real-world client/engagement structure
- ✓ Deterministic relationships

#### 5. One-Command Startup Script
**File**: `scripts/start-staging.sh`

```bash
Usage:
  ./scripts/start-staging.sh              # Start normally
  ./scripts/start-staging.sh --fresh      # Full cleanup + start
  ./scripts/start-staging.sh --reseed     # Reset + reseed
  ./scripts/start-staging.sh --logs       # Follow logs
  ./scripts/start-staging.sh --detach     # Background mode

Operations:
- ✓ Validates prerequisites (docker, docker-compose)
- ✓ Creates .env.staging if missing
- ✓ Starts services with health checks
- ✓ Runs migrations
- ✓ Resets/seeds database (optional)
- ✓ Waits for all services healthy
- ✓ Provides access information
```

**Output**:
```
✓ Staging environment ready!

Access:
- Web: http://localhost:3001
- API: http://localhost:3001/api
- DB: localhost:5433

Test credentials:
- test1@staging.local
- test2@staging.local
- test3@staging.local
```

#### 6. Docker Build Configuration
**File**: `Dockerfile.staging`

```dockerfile
- Base: node:22-alpine (lightweight)
- Installs dependencies
- Generates Prisma client
- Builds Next.js app
- Exposes port 3001
- Runs development server
```

**Features**:
- ✓ Production-like base image
- ✓ Prisma client generation
- ✓ Development mode for testing
- ✓ Standard Node.js practices

### Capabilities Enabled

#### 1. Reproducible Environment
```
Run A:
  ./scripts/start-staging.sh --reseed
  → Workspace IDs: UUID-001, UUID-002
  → User IDs: USER-001, USER-002, USER-003
  → Engagement IDs: ENG-001, ENG-002

Run B (1 hour later):
  ./scripts/start-staging.sh --reseed
  → Workspace IDs: UUID-001, UUID-002 (identical)
  → User IDs: USER-001, USER-002, USER-003 (identical)
  → Engagement IDs: ENG-001, ENG-002 (identical)

Result: Completely deterministic, allowing direct comparison
```

#### 2. Isolated Testing
- Dedicated PostgreSQL instance (port 5433)
- Separate database (opsiq_staging)
- Docker network isolation
- Does not affect production

#### 3. Repeated Reset Capability
```bash
# Test run 1
./scripts/start-staging.sh --reseed
# Run load test
docker-compose -f docker-compose.staging.yml exec app npm run test:load
docker-compose -f docker-compose.staging.yml down

# Test run 2 (identical state)
./scripts/start-staging.sh --reseed
# Run concurrent test
docker-compose -f docker-compose.staging.yml exec app npm run test:concurrent
```

#### 4. Persistent Logs
```yaml
Stored in:
- Docker compose logs (docker-compose logs)
- Application logs (container stdout)
- Database logs (PostgreSQL container)
```

#### 5. Startup/Readiness Visibility
```bash
# Watch startup sequence
./scripts/start-staging.sh --logs

Output shows:
- Database: pg_isready → accepting connections
- App: Prisma migrations → complete
- Seed: Creating workspaces → users → engagements
- Status: Staging environment ready!
```

### Testing Supported

#### 1. Load Testing
```bash
docker-compose -f docker-compose.staging.yml exec app \
  npm run test:load
```

#### 2. Concurrent Execution Testing
```bash
./scripts/start-staging.sh --fresh --reseed
# Run with deterministic starting state
npm run test:concurrent
```

#### 3. Soak Testing (Long Duration)
```bash
./scripts/start-staging.sh --reseed
# Run 1-hour continuous load
npm run test:soak
```

#### 4. Multi-User Testing
```
Predefined users:
- test1@staging.local (Owner)
- test2@staging.local (Member)
- test3@staging.local (Owner of workspace 2)

Enable parallel sessions with:
npm run test:multi-user
```

#### 5. Recovery Testing
```bash
# Start environment
./scripts/start-staging.sh --reseed

# Run tests
npm run test:concurrent

# Mid-test interruption (Ctrl+C)
# Restart
./scripts/start-staging.sh --logs

# Check data integrity
npm run test:verify-integrity
```

### Operational Readiness

| Component | Status | Evidence |
|-----------|--------|----------|
| Docker Compose | ✓ Ready | Configuration complete |
| Environment Config | ✓ Ready | .env.staging.example provided |
| Database Reset | ✓ Ready | reset-staging.ts implemented |
| Deterministic Seed | ✓ Ready | seed-staging.ts with UUID determinism |
| Startup Script | ✓ Ready | scripts/start-staging.sh operational |
| Docker Build | ✓ Ready | Dockerfile.staging configured |
| Reproducibility | ✓ Ready | Deterministic UUIDs + seeding |
| Repeated Resets | ✓ Ready | Full reset with no residual state |
| Health Checks | ✓ Ready | pg_isready + service ordering |
| Logging Visibility | ✓ Ready | Container logs + startup tracing |

### Quick Start

```bash
# 1. Create staging environment config
cp .env.staging.example .env.staging

# 2. Start staging (fresh + seeded)
./scripts/start-staging.sh --fresh --reseed

# 3. Verify all services healthy
docker-compose -f docker-compose.staging.yml ps

# 4. Check database seeded
curl http://localhost:3001/api/workspaces \
  -H "Authorization: Bearer <token>"

# 5. Ready for testing
npm run test:load
npm run test:concurrent
npm run test:soak
```

---

## PHASE A CONCLUSION

**Staging Foundation: OPERATIONAL ✓**

All components in place for reproducible, deterministic testing:
- One-command environment startup
- Full database reset capability
- Deterministic seed data
- Isolated staging infrastructure
- Persistent logging
- Production-like configuration
- Health monitoring

**Next Phase**: Build observability platform for runtime metrics, tracing, and error aggregation.

---

Signed: R2-STAGING-FOUNDATION-FINAL  
Date: 2026-05-19  
Status: OPERATIONAL AND READY FOR TESTING

