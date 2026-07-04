# P2B DATABASE VERIFICATION QUEUE

**Status:** 42 database-backed tests flagged for verification when PostgreSQL is reachable

**Current Blocker:** PostgreSQL/Neon not available in test environment (connection refused: 127.0.0.1:5432)

---

## Test Summary

| File | Test Count | Classification | Route/Service | Status |
|------|-----------|-----------------|---------------|--------|
| verified-lifecycle.test.ts | 12 | REAL_SERVICE_TEST | approveOutcomeVerification() | BLOCKED_DB_REQUIRED |
| real-route-tests.test.ts | 6 | REAL_ROUTE_TEST | POST /api/operator, recordDecisionOutcome() | BLOCKED_DB_REQUIRED |
| operator-outcome-path.test.ts | 10 | DB_INTEGRATION_TEST | POST /api/operator, classifyOutcome() | BLOCKED_DB_REQUIRED |
| decision-outcome-path.test.ts | 14 | DB_INTEGRATION_TEST | recordDecisionOutcome(), classifyOutcome() | BLOCKED_DB_REQUIRED |
| **TOTAL P2B** | **42** | | | |

---

## Test Details

### File 1: verified-lifecycle.test.ts (12 tests)

**Required Database:** PostgreSQL with operatorItem table

**Route/Service Under Test:** `approveOutcomeVerification()` service  
**Endpoint:** POST `/api/decisions/[id]/verify`

**Expected Pass Condition:**
- All 12 tests pass with verificationStatus transitions: unverified→verified, unverified→disputed, disputed→verified, verified→disputed
- All state transitions are validated
- Invalid transitions are rejected (verified→unverified impossible)
- Audit trail appends OUTCOME_VERIFIED entries
- adminVerification evidence captured with approvedBy, approvedAt, reason, previousStatus
- Evidence merging preserves prior fraud risk assessment data

**Blocker Cause:** PostgreSQL server at 127.0.0.1:5432 not reachable

**Database Operations:** 
- CREATE: operatorItem records with actualOutcomeValue, verificationStatus
- UPDATE: verificationStatus, verifiedAt, verifiedBy, verificationEvidence
- READ: Verify state persisted in database
- DELETE: Test cleanup in afterEach

**Exact Command to Run:**
```bash
npm test -- --run src/__tests__/p2b/verified-lifecycle.test.ts
```

**Test Breakdown:**
1. REAL: unverified → verified transition
2. REAL: unverified → disputed transition
3. REAL: disputed → verified transition
4. REAL: verified → disputed transition (re-flagging)
5. REAL: invalid transition rejected (verified → unverified)
6. REAL: invalid status rejected
7. REAL: missing reason rejected
8. REAL: cannot verify outcome without recorded outcome
9. REAL: audit trail captures verification metadata
10. REAL: multiple verifications appended to trail
11. REAL: adminVerification metadata captured
12. REAL: previous fraud assessment preserved in evidence

---

### File 2: real-route-tests.test.ts (6 tests)

**Required Database:** PostgreSQL with operatorItem table

**Routes Under Test:**
- POST `/api/operator` (operatorPost handler)
- Indirectly: recordDecisionOutcome() via decision lifecycle

**Expected Pass Condition:**
- Route invokes classifier and verification functions correctly
- actualOutcome populated from classifyOutcome()
- verificationStatus populated from captureOutcomeVerificationMetadata()
- Validation rejects failure without outcomeNotes
- Fraud detection auto-flags high-risk outcomes as "disputed"
- All database writes committed before response

**Blocker Cause:** PostgreSQL server at 127.0.0.1:5432 not reachable

**Database Operations:**
- CREATE: operatorItem records
- UPDATE: status, actualOutcomeValue, actualOutcome, verificationStatus, auditTrail
- READ: Verify route side effects persisted to database
- DELETE: Test cleanup

**Exact Command to Run:**
```bash
npm test -- --run src/__tests__/p2b/real-route-tests.test.ts
```

**Test Breakdown:**
1. REAL: route invocation → classifier → verification → database (100% success)
2. REAL: route validation rejects failure without notes
3. REAL: route fraud detection auto-flags as disputed
4. REAL: recordDecisionOutcome → classifier → verification → database (success path)
5. REAL: recordDecisionOutcome validation rejects uncertain without notes
6. REAL: recordDecisionOutcome auto-flags high fraud risk as disputed

---

### File 3: operator-outcome-path.test.ts (10 tests)

**Required Database:** PostgreSQL with operatorItem table

**Route Under Test:** POST `/api/operator`  
**Service Under Test:** classifyOutcome()

**Expected Pass Condition:**
- 100% achievement classified as "success"
- Zero achievement classified as "failure"
- 25% achievement classified as "partial"
- 5x expected (500% variance) classified as "uncertain"
- verificationStatus populated as "unverified" for normal outcomes
- verificationStatus populated as "disputed" for suspicious outcomes
- outcomeNotes optional for success/partial, required for failure/uncertain
- auditTrail populated with OUTCOME_RECORDED action

**Blocker Cause:** PostgreSQL server at 127.0.0.1:5432 not reachable

**Database Operations:**
- CREATE: operatorItem records
- UPDATE: actualOutcomeValue, actualOutcome, verificationStatus, status, outcomeNotes, auditTrail
- READ: Verify data persisted to database
- DELETE: Test cleanup

**Exact Command to Run:**
```bash
npm test -- --run src/__tests__/p2b/operator-outcome-path.test.ts
```

**Test Breakdown:**
1. should classify 100% achievement as success and populate actualOutcome
2. should require no outcomeNotes for success outcome
3. should classify zero as failure and populate actualOutcome
4. should require outcomeNotes for failure outcome
5. should classify 25% achievement as partial
6. should classify 5x expected as uncertain and populate actualOutcome
7. should require outcomeNotes for uncertain outcome
8. should populate verificationStatus as unverified for normal outcomes
9. should populate verificationStatus as disputed for suspicious outcomes
10. should populate auditTrail when outcome is recorded

---

### File 4: decision-outcome-path.test.ts (14 tests)

**Required Database:** PostgreSQL with operatorItem table

**Service Under Test:** recordDecisionOutcome()  
**Lifecycle:** EXECUTED → OUTCOME_RECORDED

**Expected Pass Condition:**
- 100% achievement recorded as "success"
- Failure outcomes require outcomeNotes
- Uncertain outcomes (>200% variance) require outcomeNotes and auto-flagged as "disputed"
- Partial outcomes (< 50% expected) recorded correctly
- verificationStatus matches operator route behavior (identical convergence)
- verificationMethod set to "customer_reported_unverified"
- verificationConfidence populated from fraud assessment
- verificationEvidence contains fraud risk assessment
- auditTrail appended with outcome recording action
- High fraud risk outcomes (variance >500%, retroactive modifications) auto-flagged

**Blocker Cause:** PostgreSQL server at 127.0.0.1:5432 not reachable

**Database Operations:**
- CREATE: operatorItem records in EXECUTED state
- UPDATE: actualOutcomeValue, actualOutcome, verificationStatus, status (→ outcome_recorded), outcomeNotes, verificationEvidence, auditTrail
- READ: Verify service execution chain persisted to database
- DELETE: Test cleanup

**Exact Command to Run:**
```bash
npm test -- --run src/__tests__/p2b/decision-outcome-path.test.ts
```

**Test Breakdown:**
1. should classify and record 100% achievement as success
2. should populate verificationStatus for success outcome
3. should require outcomeNotes for failure
4. should accept failure with outcomeNotes
5. should require outcomeNotes for uncertain
6. should accept uncertain with outcomeNotes and auto-flag
7. should classify and record partial outcome
8. should capture identical metadata to operator path
9. should emit audit event for outcome recording
10. should auto-flag when variance exceeds 500%
11. should not flag normal variances
12. should flag retroactive modifications
13. should use identical classifier as operator route
14. should use identical verification metadata

---

## Unified Execution Command

Run all 42 P2B database-backed tests in single command:

```bash
npm test -- --run src/__tests__/p2b/verified-lifecycle.test.ts src/__tests__/p2b/real-route-tests.test.ts src/__tests__/p2b/operator-outcome-path.test.ts src/__tests__/p2b/decision-outcome-path.test.ts
```

---

## Pass/Fail Criteria

**PASS Condition:**
- All 42 tests execute and pass
- No tests skipped
- No tests use mocks or stubs for database operations
- No tests scaffold or fake database layer
- Database server is reachable at 127.0.0.1:5432 (or configured PostgreSQL URL)
- Test cleanup (afterEach) executes successfully
- Audit trail entries persisted for all verification operations
- Evidence blobs (verificationEvidence) stored and retrieved intact
- All field mutations (actualOutcome, verificationStatus, verifiedAt, etc.) committed to database

**FAIL Condition:**
- Any test is skipped
- Any test uses database.skip() or .only()
- Any test mocks db.operatorItem calls
- Any test stubs database responses
- Any test uses in-memory database instead of live PostgreSQL
- Any test fails to cleanup (orphaned data in afterEach)
- Database connection error (ECONNREFUSED)
- Field values not persisted (read back values differ from written values)
- Audit trail entries not appended
- Evidence blobs truncated or malformed on retrieval

---

## Known Constraints

- **PostgreSQL URL:** Currently 127.0.0.1:5432 (local or docker)
- **Test Database:** opsiq_test (created during setup)
- **Prisma Adapter:** PostgreSQL with pg driver
- **Cleanup Strategy:** Each test cleans up its operatorItem records in afterEach
- **Idempotency:** Tests use Date.now() to ensure unique IDs across runs

---

## Verification Readiness

| Gate | Status |
|------|--------|
| TypeCheck | ✅ PASS |
| Build | ✅ PASS |
| Governance | ✅ PASS |
| Unit Tests (36) | ✅ 36 PASS |
| Database Tests (42) | ⏸️ BLOCKED_DB_REQUIRED |
| **Overall P2B** | **READY_FOR_DB_VERIFICATION** |

---

## Next Steps

1. When PostgreSQL is available at 127.0.0.1:5432 or equivalent:
   - Run unified command above
   - All 42 tests should execute without failures
   - Verify no tests are mocked or scaffolded
   - Confirm database writes are committed

2. If tests fail:
   - Investigate database connection first
   - Check Prisma migration status
   - Verify operatorItem schema has all required columns

3. Upon successful completion:
   - Create POST_VERIFICATION_P2B_STATUS.md
   - Document: "P2B_DB_VERIFICATION_COMPLETE"

---

**Created:** 2026-06-02  
**Branch:** main (commit fa5b1bcb)  
**P2B Status:** MERGED_WITH_DB_VERIFICATION_DEBT
