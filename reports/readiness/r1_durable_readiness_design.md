# R1 Durable Readiness Design — PHASE B

**Date**: 2026-05-18  
**Purpose**: Design startup readiness that works across all runtime contexts

---

## DESIGN PRINCIPLE: Single Durable Source of Truth

Instead of memory, use a durable source that:
- All processes can read
- All contexts (middleware, handlers, Edge) can access safely
- Survives restart
- Supports scaling and distribution
- Supports observability and debugging

---

## OPTION 1: Database-Backed Readiness (RECOMMENDED)

### Architecture
```
┌─────────────────────────────────────────┐
│          Application Start              │
│                                         │
│  1. Check startup_status table          │
│     └─ SELECT * FROM startup_status     │
│                                         │
│  2. If NOT READY:                       │
│     └─ Run startup checks               │
│     └─ INSERT/UPDATE startup_status     │
│                                         │
│  3. If READY:                           │
│     └─ Use cached status                │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│       Middleware / Handler               │
│                                         │
│  1. Read startup_status table           │
│  2. Check: is_ready = true?             │
│  3. All code paths read same source     │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Database (PostgreSQL)           │
│                                         │
│  startup_status:                        │
│  ├─ id (UUID, primary key)              │
│  ├─ status (READY | FAILED | STARTING)  │
│  ├─ started_at (timestamp)              │
│  ├─ completed_at (timestamp)            │
│  ├─ error (text, nullable)              │
│  ├─ version (app version)               │
│  ├─ updated_at (timestamp)              │
│  └─ instance_id (hostname/pod ID)       │
│                                         │
└─────────────────────────────────────────┘
```

### Advantages
- ✓ Survives process restart
- ✓ Shared across all instances
- ✓ Persisted audit trail
- ✓ Works with Edge Runtime (reads via HTTP)
- ✓ Supports observability (query state anytime)
- ✓ Naturally handles horizontal scaling
- ✓ Handles multi-region deployments
- ✓ Can be read from middleware, handlers, health probes consistently

### Disadvantages
- ✗ Adds one DB read per middleware call (acceptable, small table)
- ✗ Requires startup_status table (one-time migration)
- ✗ DB must be available to read status (but already required)

### Schema
```sql
CREATE TABLE startup_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('NOT_STARTED', 'STARTING', 'READY', 'FAILED')),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  version TEXT NOT NULL,
  instance_id TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(instance_id) -- Only latest status per instance
);
```

### Implementation
```typescript
// src/services/startup-status.ts (replaces startup-state.ts)

export async function getStartupStatus(): Promise<{
  status: 'NOT_STARTED' | 'STARTING' | 'READY' | 'FAILED';
  started_at: Date;
  completed_at?: Date;
  error?: string;
}> {
  const result = await db.$queryRawUnsafe(`
    SELECT status, started_at, completed_at, error
    FROM startup_status
    WHERE instance_id = $1
    ORDER BY updated_at DESC
    LIMIT 1
  `, process.env.HOSTNAME || 'unknown');
  
  return result[0] || { status: 'NOT_STARTED', started_at: new Date() };
}

export async function setStartupStatus(
  status: string,
  error?: string
): Promise<void> {
  await db.$queryRawUnsafe(`
    INSERT INTO startup_status (status, error, version, instance_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (instance_id) DO UPDATE
    SET status = EXCLUDED.status, error = EXCLUDED.error, updated_at = CURRENT_TIMESTAMP
  `, status, error || null, process.env.npm_package_version || 'unknown', 
     process.env.HOSTNAME || 'unknown');
}
```

### Middleware Usage
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  
  // Allow public routes without checking startup
  if (allowedPublic.includes(pathname)) {
    return NextResponse.next();
  }
  
  // Read startup status from DB (via separate endpoint)
  const startupStatus = await getStartupStatus();
  
  if (startupStatus.status !== 'READY') {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Application starting up' },
      { status: 503 }
    );
  }
  
  return NextResponse.next();
}
```

### Handler Usage
```typescript
// src/app/api/auth/login/route.ts
export const POST = async (request: NextRequest) => {
  const status = await getStartupStatus();
  if (status.status !== 'READY') {
    throw new Error('Application not ready');
  }
  // ... rest of handler
};
```

---

## OPTION 2: Durable File-Based (NOT RECOMMENDED)

Store startup status in a file that both can read.

### Disadvantages
- ✗ File I/O slower than memory
- ✗ Doesn't work in serverless/ephemeral filesystems
- ✗ No durability in distributed systems (each instance different file)
- ✗ No transaction safety

### Rejected: Doesn't solve distribution problem

---

## OPTION 3: Redis-Backed Readiness (NOT RECOMMENDED)

Use Redis as shared state store.

### Disadvantages
- ✗ Adds Redis dependency
- ✗ Not simpler than DB (already have Postgres)
- ✗ Doesn't add features we don't already have
- ✗ Introduces failure mode (Redis down)

### Rejected: Over-engineering

---

## CHOSEN SOLUTION: Database-Backed Readiness

**Why**:
1. Already have PostgreSQL dependency
2. Single durable source of truth
3. Works across all contexts and instances
4. Supports observability
5. No additional infrastructure
6. Natural fit for OPSIQ's data model

---

## MIGRATION PATH

### Phase 1: Add startup_status Table
- Create migration
- Deploy without using it

### Phase 2: Implement getStartupStatus()
- New service reads from table
- Doesn't modify middleware yet
- Handlers can start calling it

### Phase 3: Switch Middleware
- Change middleware to read DB instead of globalThis
- All paths now read same source

### Phase 4: Remove globalThis State
- Delete startup-state.ts globals
- Delete promise synchronization logic
- Keep startup-orchestrator logic but make it DB-aware

### Phase 5: Verify Consistency
- Middleware and handlers see same state
- Restart resets state properly
- Multiple instances work independently
- Load balancer gets consistent responses

---

## FAILURE MODES HANDLED

| Scenario | Behavior |
|----------|----------|
| DB down at startup | Fail closed (503) |
| Startup fails | Error persisted in DB |
| Partial startup | Marked FAILED in DB |
| Restart after success | State reads as READY, resumes |
| Multiple instances | Each records own status |
| Network split | Each partition sees DB separately |

---

## CONSISTENCY GUARANTEES

✓ Middleware and handlers read same status (from DB)
✓ Status survives restart (durable)
✓ Status durable across instances (shared DB)
✓ Status observable (query anytime)
✓ Status auditable (timestamp, error recorded)
✓ Status atomic (INSERT/UPDATE transaction)

---

## NEXT: Implementation

See `r1_externalized_readiness_implementation.md`
