# DATABASE EXECUTION PATH SELECTION

**Selected Path:** C - Docker PostgreSQL

**Decision Date:** 2026-06-02

---

## Path Decision Matrix

| Criterion | Path A: Local | Path B: Neon | **Path C: Docker** | Path D: Temp DB |
|-----------|---------------|--------------|-------------------|-----------------|
| **Available** | ❌ NO | ❌ NO | ✅ YES | ⚠️ SETUP REQUIRED |
| **Setup Time** | N/A | N/A | ~30s | ~3-5m |
| **Startup Time** | N/A | N/A | ~5-10s | ~10-30s |
| **Infrastructure** | None | Cloud | Local Docker | Cloud/External |
| **Risk Level** | N/A | N/A | MINIMAL | MODERATE |
| **Cleanup** | N/A | N/A | Simple | Simple |
| **Cost** | N/A | N/A | FREE | Depends |
| **Ready Now** | ❌ NO | ❌ NO | ✅ YES | ❌ NO |

---

## Selected Path: C - Docker PostgreSQL

### Why This Path?

**1. Fastest Time-to-Test**
- Docker is already installed (Docker 29.3.1 available)
- Single `docker run` command starts PostgreSQL
- Startup time: ~5-10 seconds
- No configuration needed beyond CONNECTION_STRING

**2. Lowest Risk**
- Container is ephemeral (no persistent state)
- Isolated from system PostgreSQL (if any)
- Can restart cleanly without cleanup complexity
- No external dependencies or API keys needed

**3. No Infrastructure Changes**
- Uses existing Docker installation
- No network configuration required
- No credentials or authentication setup
- Matches test environment expectations perfectly

**4. Minimal Cleanup**
- Single `docker stop` and `docker rm` commands
- No database state left behind
- No config file changes needed

**5. Test Compatibility**
- Database runs on localhost:5432 (matches .env.test expectation)
- PostgreSQL version can be chosen to match schema
- Full compatibility with existing Prisma config

---

## Rejected Paths

### Path A: Local PostgreSQL ❌
**Why Rejected:**
- PostgreSQL is NOT installed/running on host
- Would require system installation
- Takes longer than Docker (OS-specific installation steps)
- More complex cleanup
- Less isolated from development environment

**Alternative Timeline:**
- macOS: `brew install postgresql` → 5-10 minutes
- Linux: `apt-get install postgresql` → 5-10 minutes
- Windows: Windows installer → 15+ minutes
- Then: Start service, initialize database → 5+ minutes
- **Total: 20-30 minutes vs 30 seconds with Docker**

### Path B: Neon ❌
**Why Rejected:**
- Neon is NOT configured in .env.test
- Requires:
  1. Create Neon account (requires email verification)
  2. Create project (1-2 minutes)
  3. Get connection string
  4. Update .env.test
  5. Wait for network (5-30 seconds per request)
- No benefit over local Docker
- Adds network latency to tests
- Requires cloud credentials
- **Timeline: 10-20 minutes setup + ongoing latency**

### Path D: Temporary Dedicated Database ❌
**Why Rejected:**
- Which service? (AWS RDS, Azure, DigitalOcean, etc.)
- Requires:
  1. Choose provider
  2. Create account/credentials
  3. Provision database
  4. Wait for DNS propagation
  5. Update connection string
  6. Network configuration
- Overkill for temporary test execution
- Adds ongoing cost
- Network latency
- **Timeline: 20-40 minutes setup + cleanup complexity**

---

## Docker PostgreSQL Execution Plan

### Image Selection
**Image:** `postgres:16-alpine`
- Lightweight Alpine Linux base
- PostgreSQL 16 (current stable)
- Small download/startup (~100MB)

### Container Command
```bash
docker run -d \
  --name opsiq-test-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=opsiq_test \
  -p 5432:5432 \
  postgres:16-alpine
```

### Verification Command
```bash
timeout 5 psql -h localhost -U postgres -d opsiq_test -c "SELECT 1"
```

### Run Tests Command
```bash
npm test -- --run \
  src/__tests__/p2b/verified-lifecycle.test.ts \
  src/__tests__/p2b/real-route-tests.test.ts \
  src/__tests__/p2b/operator-outcome-path.test.ts \
  src/__tests__/p2b/decision-outcome-path.test.ts
```

### Cleanup Command
```bash
docker stop opsiq-test-db && docker rm opsiq-test-db
```

---

## Timeline Estimate

| Step | Time | Total |
|------|------|-------|
| 1. Docker run | 5-10s | 5-10s |
| 2. Connection verify | 2-3s | 8-13s |
| 3. Prisma migrate | 2-5s | 10-18s |
| 4. Run 42 tests | 30-60s | 40-78s |
| **Total** | | **~60-90 seconds** |

---

## Risk Assessment

**Technical Risk:** MINIMAL
- Docker is standard tool
- PostgreSQL image is official
- No custom configuration
- Test cleanup is automatic (isolated container)

**Test Reliability Risk:** NONE
- Same database engine as production
- Full feature support
- No mocking or scaffolding
- Real database writes verified

**Execution Risk:** LOW
- Container auto-cleanup on stop
- No state persists
- No side effects on host system
- Can run multiple times without issues

---

## Why Not Hybrid?

**Considered:** Start Docker container first, but also support local PostgreSQL fallback

**Rejected:** 
- Adds complexity (checking which is available)
- Docker is already available (no fallback needed)
- Single path is clearer
- P2B testing requirement is specific

---

## Decision Confirmation

**Selected Path:** C - Docker PostgreSQL  
**Rationale:** Fastest (60-90s total), lowest risk, already available, no infrastructure changes  
**Alternative Support:** None required (Docker is available)  
**Contingency:** None needed (Docker guarantees consistency)

---

**Path Selection Complete:** Ready for Task 3 (Execution Checklist)
