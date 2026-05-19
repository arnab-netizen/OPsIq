# R2 Phase B: Observability Foundation — Production-Grade Telemetry

**Date**: 2026-05-19  
**Phase**: R2-OPERATIONS-VALIDATION-PLATFORM PHASE B

---

## EXECUTION SUMMARY

Built production-grade operational visibility layer enabling runtime debugging and failure diagnosis.

### Components Implemented

#### 1. Structured Logging Service
**File**: `src/infra/structured-logger.ts`

```typescript
Features:
- JSON-formatted output (machine-parseable)
- Correlation ID tracking
- Request ID generation
- Workspace/actor scoping
- Secret redaction (passwords, tokens, keys)
- Payload hashing (non-invasive fingerprinting)
- Metric collection (latencies, errors)

Log Fields:
- level: DEBUG | INFO | WARN | ERROR | CRITICAL
- category: APP | MUTATION | DATABASE | IDEMPOTENCY | INFRASTRUCTURE
- message: Human-readable message
- correlation_id: Across-request tracking
- request_id: Unique request identifier
- workspace_id: Workspace scope
- actor_id: User/actor ID
- route: API endpoint
- method: HTTP method
- latency_ms: Operation duration
- status_code: HTTP status
- readiness_state: System readiness
- mutation_type: Type of mutation
- idempotency_key: Deduplication key
- error_code: Machine error classification
- error_message: Error description (redacted)
- db_latency_ms: Database operation timing
- payload_hash: SHA256 fingerprint (first 8 chars)
- tags: Array of categorical tags
```

**Redaction Rules**:
- `password` → [REDACTED]
- `authorization` → [REDACTED]
- `token` → [REDACTED]
- `secret` → [REDACTED]
- `api_key` / `api-key` → [REDACTED]

**Example Log Output**:
```json
{
  "level": "INFO",
  "category": "MUTATION",
  "message": "Mutation starting: createEngagement",
  "correlation_id": "corr_1726854621_abcd1234",
  "request_id": "req_1726854621_xyz9999",
  "workspace_id": "30000000-0000-0000-0000-000000000002",
  "actor_id": "20000000-0000-0000-0000-000000000001",
  "route": "/api/engagements",
  "method": "POST",
  "mutation_type": "createEngagement",
  "idempotency_key": "engagement-1726854621-abc123",
  "payload_hash": "a7f3e8c2",
  "timestamp": "2026-05-19T01:10:21.000Z",
  "tags": ["mutation_start"]
}
```

#### 2. Request + Mutation Tracing Service
**File**: `src/infra/request-tracer.ts`

```typescript
Features:
- End-to-end request lifecycle tracing
- Nested span tracking (parent/child operations)
- Mutation lifecycle tracking
- Database operation timing
- Audit event correlation
- Idempotency collision detection
- Rollback tracking
- Retry detection

Trace Structure:
{
  correlation_id: string
  request_id: string
  route: string
  method: string
  start_time: number (ms)
  end_time: number (ms)
  duration_ms: number
  spans: [
    {
      span_id: string
      operation: string (e.g., "mutation:createEngagement")
      parent_span_id?: string
      start_time: number
      end_time: number
      duration_ms: number
      status: PENDING | SUCCESS | FAILED | ROLLED_BACK
      tags: {
        mutation_type?: string
        idempotency_key?: string
        db_operations?: [{ operation, latency_ms, rows }]
        audit_event_id?: string
        collision_detected?: boolean
      }
    }
  ]
  final_status: SUCCESS | FAILED | ROLLED_BACK
  error_classification?: string
}
```

**Lifecycle Example** (Engagement Create):
```
Request START (correlation_id=corr_abc123)
  └─ Span: idempotency_check
       ├─ DB query: SELECT idempotency_records WHERE key=...
       ├─ Duration: 2ms
       └─ Result: NOT_FOUND (isNew=true)
  
  └─ Span: mutation:createEngagement
       ├─ DB mutation: INSERT engagements
       ├─ Duration: 15ms
       └─ Result: engagement_id=uuid-001
  
  └─ Span: audit_event
       ├─ DB mutation: INSERT audit_events
       ├─ Duration: 3ms
       └─ Result: audit_id=uuid-002
  
  └─ Span: idempotency_cache
       ├─ DB mutation: UPDATE idempotency_records status=COMPLETED
       ├─ Duration: 2ms
       └─ Result: cached

Request END (duration=25ms, status=SUCCESS)
```

#### 3. Operational Metrics Collection
**Infrastructure**: Built into StructuredLogger and RequestTracer

```typescript
Collected Metrics:
- Total requests (count)
- Total errors (count)
- Recent error history (last 10)
- Readiness transitions (last 20)
- Idempotency collisions (tracking)
- Average request latency (ms)
- P95 request latency (ms)
- Average DB latency (ms)
- P95 DB latency (ms)
- Active requests (gauge)
- Memory usage (heap/external/RSS)
```

#### 4. Operational Metrics Endpoints

**A. GET /api/ops/runtime** - Real-time operational status
```json
{
  "timestamp": "2026-05-19T01:10:21.000Z",
  "runtime": {
    "active_requests": 3,
    "active_traces": 3,
    "memory_usage": {
      "heapUsed": 102400000,
      "heapTotal": 204800000,
      "external": 10240000,
      "rss": 307200000
    }
  },
  "performance": {
    "avg_request_latency_ms": 45,
    "p95_request_latency_ms": 120,
    "avg_db_latency_ms": 15,
    "p95_db_latency_ms": 45
  },
  "errors": {
    "total_count": 3,
    "recent": [
      {
        "correlation_id": "corr_...",
        "error_classification": "DB_FAILURE",
        "timestamp": "2026-05-19T01:09:15.000Z"
      }
    ]
  },
  "idempotency": {
    "collision_count": 2,
    "collisions": [
      { "key": "eng-...", "collision_count": 3 }
    ]
  }
}
```

**B. GET /api/ops/metrics** - Prometheus-compatible metrics
```json
{
  "counters": {
    "http_requests_total": 1250,
    "http_request_errors_total": 5,
    "http_request_success_rate_percent": 99.6,
    "idempotency_collisions_total": 2
  },
  "gauges": {
    "memory_heap_used_bytes": 102400000,
    "memory_heap_usage_percent": 50.0,
    "active_requests": 3
  },
  "latencies": {
    "request_latency_ms": {
      "avg": 45,
      "p95": 120
    },
    "db_latency_ms": {
      "avg": 15,
      "p95": 45
    }
  },
  "errors_by_classification": {
    "DB_FAILURE": 2,
    "AUTH_FAILURE": 1,
    "VALIDATION_FAILURE": 2
  }
}
```

**C. GET /api/ops/errors** - Error history with classification
```json
{
  "errors": {
    "count": 5,
    "by_classification": {
      "DB_FAILURE": 2,
      "AUTH_FAILURE": 1,
      "VALIDATION_FAILURE": 2
    },
    "recent": [
      {
        "correlation_id": "corr_...",
        "route": "/api/engagements",
        "classification": "DB_FAILURE",
        "spans_with_errors": [
          {
            "operation": "mutation:createEngagement",
            "error": "FK constraint violation",
            "duration_ms": 10
          }
        ]
      }
    ]
  },
  "idempotency_issues": {
    "collision_count": 2,
    "recent_collisions": [
      {
        "correlation_id": "corr_...",
        "idempotency_key": "eng-abc123",
        "timestamp": "2026-05-19T01:08:30.000Z"
      }
    ]
  },
  "slow_requests": {
    "count": 3,
    "slow_traces": [
      {
        "correlation_id": "corr_...",
        "route": "/api/decisions/[id]/execute",
        "duration_ms": 1240
      }
    ]
  }
}
```

**D. GET /api/ops/readiness** - Readiness state history
```json
{
  "current": {
    "status": "READY",
    "last_updated": "2026-05-19T01:00:00.000Z",
    "duration_ms": 621000
  },
  "history": [
    {
      "event_name": "system_ready",
      "occurred_at": "2026-05-19T01:00:00.000Z"
    },
    {
      "event_name": "readiness_check_passed",
      "occurred_at": "2026-05-19T00:59:55.000Z"
    }
  ],
  "protected_routes_operational": true,
  "system_health": "HEALTHY"
}
```

---

## OBSERVABILITY CAPABILITIES

### Real-Time Visibility

✓ **Request Lifecycle Tracing**:
- Track single request from entry to exit
- Visualize all internal operations (spans)
- Measure operation timing (DB queries, mutations, audits)
- Detect failed operations (rollbacks, errors)
- Correlate with idempotency state

✓ **Mutation Tracking**:
- When mutation starts: type, idempotency key, payload hash
- During mutation: DB operations, latencies
- When mutation completes: duration, success/failure
- Idempotency collision detection
- Rollback visibility

✓ **Database Operation Visibility**:
- Per-operation latency tracking
- Query preview (first 20 chars)
- Rows affected (optional)
- DB connection pool pressure (via active request count)

✓ **Concurrency Visibility**:
- Active request count (gauge)
- Active trace count (concurrent request tracking)
- Correlation IDs distinguish concurrent requests
- Idempotency collision detection
- Parallel operation timing

### Failure Diagnosis

✓ **Error Classification**:
- Categorized error types
- Correlated to requests
- Classified in structured logs
- Tracked in error endpoints

✓ **Rollback Visibility**:
- Detect rollback events in traces
- Identify which operation failed
- See final transaction state

✓ **Audit Trail Linkage**:
- Correlation IDs link requests to audit events
- Audit endpoint shows which requests created events
- Audit events appear as spans in request trace

### Performance Monitoring

✓ **Latency Metrics**:
- Average request latency
- P95 percentile (slow request threshold)
- DB latency separately tracked
- Slow request detection (>1000ms)

✓ **Resource Monitoring**:
- Heap memory usage
- Heap percentage
- External memory
- RSS (resident set size)

✓ **Operational Metrics**:
- Request count
- Error count
- Success rate
- Idempotency collision frequency

---

## FAILURE CLASSIFICATION SCHEME

| Classification | Scope | Detection |
|---|---|---|
| AUTH_FAILURE | Authentication/authorization | Session invalid, capability check failed |
| READINESS_FAILURE | System readiness | startup_status != READY |
| DB_FAILURE | Database operations | Connection error, query failure, constraint violation |
| IDEMPOTENCY_COLLISION | Duplicate request | UNIQUE constraint on idempotency_key |
| WEBHOOK_FAILURE | Webhook processing | Webhook signature verification, event processing |
| CONCURRENCY_FAILURE | Concurrent mutation | Lost update, stale write, constraint violation |
| RATE_LIMIT_FAILURE | Rate limiting | Workspace rate limit exceeded |
| VALIDATION_FAILURE | Input validation | Zod schema failure, business logic validation |
| UNKNOWN_FAILURE | Unclassified | Generic error |

---

## OBSERVABILITY READY FOR

✓ **Load Testing** - Metrics visible during sustained load  
✓ **Concurrency Testing** - Trace individual concurrent requests  
✓ **Failure Analysis** - Errors classified and correlated  
✓ **Performance Debugging** - Latency metrics identify bottlenecks  
✓ **Audit Correlation** - Requests linked to audit events  
✓ **Production Monitoring** - All logs machine-parseable for aggregation  

---

## NEXT STEPS: PHASES C-F

With observability foundation in place, can now proceed to:

**PHASE C**: Load + Concurrency Harness
- k6 load testing (metrics visible)
- Concurrent request execution (traced)
- Latency collection

**PHASE D**: Browser Automation  
- E2E tests with observable failures
- Multi-user workflows traced
- Performance baseline collection

**PHASE E**: Stripe Runtime Validation
- Webhook delivery traced
- Error classification on failures
- Audit event correlation

**PHASE F**: Soak + Stability Testing
- 1-hour runtime metrics
- Memory/connection monitoring
- Latency drift detection

---

## OBSERVABILITY STATUS

| Component | Status | Evidence |
|-----------|--------|----------|
| Structured Logging | ✓ OPERATIONAL | JSON output, correlation IDs, secret redaction |
| Request Tracing | ✓ OPERATIONAL | Span tracking, lifecycle visibility |
| Mutation Tracing | ✓ OPERATIONAL | Mutation start/end, DB timing, audit correlation |
| Metrics Collection | ✓ OPERATIONAL | Real-time metrics aggregation |
| /api/ops/runtime | ✓ OPERATIONAL | Active requests, memory, performance metrics |
| /api/ops/metrics | ✓ OPERATIONAL | Prometheus-compatible output |
| /api/ops/errors | ✓ OPERATIONAL | Error history with classification |
| /api/ops/readiness | ✓ OPERATIONAL | Readiness state and transitions |
| Concurrent Visibility | ✓ OPERATIONAL | Correlation IDs distinguish parallel requests |
| Audit Tracing | ✓ OPERATIONAL | Audit events appear in request traces |

---

Signed: R2-OBSERVABILITY-FOUNDATION-FINAL  
Date: 2026-05-19  
Status: OPERATIONAL AND READY FOR TESTING

