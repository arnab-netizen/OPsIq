# PHASE 5: AUDIT FLOOD PROTECTION — RISK INVENTORY

**Generated**: 2024-05-14
**Status**: CRITICAL FINDINGS

---

## EXECUTIVE SUMMARY

System is vulnerable to audit amplification attacks that could:
- Block all requests during hostile load (138 blocking awaits)
- Exhaust audit database with unbounded writes
- Cause SOC blindness when flood protection kicks in
- Create recursive audit storms through error handling
- Exhaust memory with unbounded telemetry queues
- Allow cardinality explosion on per-IP/per-token aggregation

**Readiness**: NOT READY for production load testing

---

## VULNERABILITY INVENTORY

### CRITICAL: Synchronous Audit Blocking

**Finding**: 138 blocking `await emitAudit()` calls across codebase
- Location: `/src/services/**/*.ts` (67 files)
- Frequency: 274 total audit emission calls
- Impact: Every audit event serializes DB write into request path
- Attack vector: 10k/sec invalid auth attempts = 10k pending DB writes

**Evidence**:
```typescript
// pipeline-executor.ts:111
if (options.emitAudit) {
  await emitAudit(decision.auditClass as any, {  // BLOCKS HERE
    state: currentState,
    httpStatus: decision.httpStatus,
    reason: decision.telemetryClass,
  });
}
```

**Risk**: Under attack (credential stuffing, token fuzzing), audit system becomes DDoS vector.

---

### CRITICAL: Unbounded Audit Table Growth

**Finding**: No sampling on AUTH_FAILURE events
- Every invalid auth attempt creates audit row
- 10k/sec invalid auth = ~860M rows/day
- No TTL, no cardinality limits, no aggregation
- Database exhaustion in hours under sustained attack

**Evidence**:
```typescript
// audit.ts:26-59
export async function emitAuditEvent(input: AuditEventInput): Promise<string> {
  // ... no sampling, no rate limits, no aggregation
  const event = await db.auditEvent.create({...});  // UNBOUNDED
}
```

**Risk**: Audit table becomes operational blocker.

---

### HIGH: Memory Exhaustion from Telemetry Queue

**Finding**: Queue capped at 10k events but no bounded cardinality protection
- If sampling is not applied, 10k+ queued events can accumulate
- Each event is ~1.5KB = ~15MB per full queue
- Multiple queues (one per process) = memory explosion

**Evidence**: `/src/infra/telemetry-emitter.ts:22-23`
```typescript
const telemetryQueue: TelemetryEvent[] = [];
const MAX_QUEUE_SIZE = 10000;  // Bounded but no cardinality limits
```

**Risk**: Memory pressure under sustained attack.

---

### HIGH: Cardinality Explosion

**Finding**: No LRU or TTL on security signal aggregators
- Unlimited IP addresses can trigger aggregation
- Unlimited tokens can accumulate in replay detector
- Unlimited workspace IDs in denial counter

**Example Attack**: 
```
1. Distributed credential stuffing: 1M IPs attempt auth
2. Each IP: 1 aggregation bucket (no LRU eviction)
3. Memory: 1M × (counter + metadata) = unbounded
4. Result: OOM killer terminates system
```

---

### MEDIUM: Recursive Audit Emission

**Finding**: Audit emission can trigger error handling which emits audit
- Circuit open → emits CIRCUIT_OPEN audit
- Audit DB fails → emits DB_FAILURE audit
- Audit emission fails → error handler emits AUDIT_FAILURE
- Potential loop under high load

**Risk**: Audit storms amplify load instead of reducing it.

---

### MEDIUM: No Escalation Cooldown

**Finding**: Duplicate escalations possible if multiple processes emit incident
- Process 1: Detects credential stuffing → emit INCIDENT_OPENED
- Process 2: Detects same stuffing → emit INCIDENT_OPENED (duplicate)
- SOC gets flooded with duplicate escalations

---

### MEDIUM: Handler-Level Auth Failure Logging

**Finding**: Auth failures logged at multiple layers
- Pipeline executor logs on failure
- Error normalizer logs auth errors
- Handler may log (design unclear)
- Potential double/triple counting

---

### MEDIUM: Missing Isolation for Audit Persistence

**Finding**: Audit persistence not isolated from request path
- Current: `await db.auditEvent.create()`
- If DB is slow: request blocks
- If DB connection pool exhausted: cascade failure
- No circuit breaker, no isolation

---

## VECTOR SUMMARY

### Attack Scenario 1: Credential Stuffing (10k/sec)
```
10k invalid auth attempts/sec
  → 10k AUTH_FAILURE events queued
  → 10k audit rows written (blocking)
  → 10k telemetry events
  → Database saturated
  → Request latency spike: 100ms → 500ms
  → Legitimate users timeout
  → System cascades into service unavailability
```

### Attack Scenario 2: Token Fuzzing (1M unique tokens)
```
1M different bearer tokens attempted
  → Replay detector: 1M entries (no LRU)
  → Memory: 1M × 200B = 200MB per process
  → 10 processes = 2GB memory spike
  → OOM killer activates
  → System crashes
```

### Attack Scenario 3: Distributed Enumeration (1M IPs)
```
1M IPs attempt auth (each different source)
  → Security signal aggregator: 1M IP buckets
  → Cardinality explosion in per-IP counter
  → Memory: 1M × 400B = 400MB per process
  → OOM, system unavailable
```

---

## COMPLIANCE GAPS

| Requirement | Current State | Gap |
|---|---|---|
| Preserve critical incidents during attack | ✗ No tier separation | Critical incidents will be dropped if queue full |
| Remain observable during hostile load | ✗ Blocking audit | Observable until audit system becomes bottleneck |
| Avoid audit-table explosion | ✗ Unbounded writes | No sampling, no TTL |
| Avoid recursive telemetry storms | ✗ No isolation | Audit failures can trigger more audits |
| Avoid memory exhaustion | ✗ No LRU | Cardinality explosion on per-IP/token |
| Preserve attack visibility | ✗ No aggregation | 10k events = 10k noise, signal lost |
| Preserve replay visibility | ✗ Unbounded map | 1M tokens = OOM |
| Remain non-blocking | ✗ 138 blocking awaits | Auth path blocked on audit write |

---

## NEXT STEPS (PHASE 5)

1. **STEP 1** ✓ Inventory (complete — this report)
2. **STEP 2** Build audit stratification (3 tiers: always/adaptive/metrics)
3. **STEP 3** Build adaptive sampling engine (normal/elevated/high/critical)
4. **STEP 4** Build bounded cardinality protection (LRU, TTL, eviction)
5. **STEP 5** Build security signal aggregator (memory-safe)
6. **STEP 6** Build infrastructure signal aggregator (infra/auth separation)
7. **STEP 7** Build incident escalation engine (no duplicate escalations)
8. **STEP 8** Build audit persistence isolation (async, non-blocking)
9. **STEP 9** Build flood governance test suite (10k+ hostile load)
10. **STEP 10** Build flood governance scanner (CI enforcement)

---

## CRITICAL RULE FOR PHASE 5

**During attack conditions, signal quality matters more than event quantity.**

- Better to drop 90% of events and keep SOC observable
- Better to sample and aggregate than to lose visibility
- Better to emit incidents than to emit 10k noise events
- Better to preserve critical state than to audit every auth failure
