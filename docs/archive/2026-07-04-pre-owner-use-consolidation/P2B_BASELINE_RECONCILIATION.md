# P2B_BASELINE_RECONCILIATION.md

**Rebuild blocker baseline from evidence only**  
**No inherited conclusions, evidence-verified only**  
**Date:** 2026-06-02

---

## Fresh Blocker Reconciliation

Re-reading all proof documents without prior assumptions.

---

## BLOCKER 1: Enum Violation (B1)

### Evidence Source
**P2B_B1_PROOF.md** - Final update shows CLOSED status

### What the Proof Shows

**From P2B_B1_PROOF.md:**
```
Fix Applied:
  ✓ verification.ts line 150: NOW writes "disputed" (fixed)
  ✓ evidence.ts line 88: Allows "disputed" (no change needed)
  ✓ Tests: NOW expect "disputed" (updated)
  ✓ Commit: adcf7f4 (B1 FIX applied)

Verification:
  No writers emit "flagged" anymore
  All writers emit values in contract enum
  All tests updated to expect "disputed"
  Contract maintained
```

**From commit analysis:**
```
Commit: adcf7f4
Files changed: 5
Changes:
  - verification.ts: "flagged" → "disputed"
  - path-convergence.test.ts: 3 tests updated
  - operator-outcome-path.test.ts: 1 test updated
  - decision-outcome-path.test.ts: 3 tests updated
```

**Test Result:**
```
npm test -- p2b tests
Result: 36/36 tests pass
```

### Classification from Evidence

**B1 Status:** CLOSED ✓

**Proof:**
- ✓ Code changed (commit adcf7f4)
- ✓ Tests updated and passing
- ✓ No "flagged" in active code
- ✓ "disputed" in schema enum

---

## BLOCKER 2: Route Tests (B2)

### Evidence Source
**P2B_ROUTE_TEST_PROOF.md** - Classification: FAKE_TEST

### What the Proof Shows

**From P2B_ROUTE_TEST_PROOF.md:**
```
Current Test Structure:
  ✗ HTTP request creation: Not tested
  ✗ Route handler: Imported but not called
  ✓ Service call: Tested (direct calls)
  ✓ DB write: Tested (direct updates)
  ✓ DB read: Tested (direct queries)
  ✗ Assertions: Only on classifier/DB, not route

Test Coverage: ~30% (classifier only, not routes)
Classification: SCAFFOLD_ONLY (not real integration)
```

**Missing Route Logic:**
```
What Tests Don't Verify:
  - Route error handling
  - Request parsing
  - Response formatting
  - Idempotency key enforcement
  - Status codes
  - Validation at route level
```

**Infrastructure Requirement:**
```
Needed to create REAL_ROUTE_TEST:
  1. NextRequest mock
  2. Canonical context mock
  3. Route invocation (not direct service calls)
  4. Response validation

Current: Not available
```

### Classification from Evidence

**B2 Status:** OPEN ✗

**Proof:**
- ✗ Routes not invoked in tests
- ✗ Validation layer untested
- ✗ HTTP layer untested
- ✗ No NextRequest infrastructure

**Mitigation Required:** Implement real route tests before deployment

---

## BLOCKER 3: Verified State (B3)

### Evidence Source
**P2B_VERIFIED_STATE_PROOF.md** - Classification: MISSING

### What the Proof Shows

**From P2B_VERIFIED_STATE_PROOF.md:**
```
State Transitions:
  ✓ Initial: unverified (DB default works)
  ✓ Fraud detection: → disputed (P2B auto-flags)
  ✗ Manual: → verified (NO CODE PATH)

Lifecycle Completeness: 30%
Writers that can set "verified": NONE
Readers waiting for "verified": 2 (attribution, 7day)
```

**Verification Endpoint:** MISSING
```
Endpoint needed: POST /api/decisions/{id}/verify
Authorization: Missing
Audit trail: Missing
Logic: Missing
```

**Impact:**
```
Metrics Affected:
  - itemsVerified (attribution.ts:93) → Always 0
  - verifiedCount (7day/route.ts:100) → Always 0
  - Workflow: No way to manually verify outcomes
```

### Classification from Evidence

**B3 Status:** MISSING ✗

**Proof:**
- ✗ No endpoint to set "verified"
- ✗ No authorization check for verification
- ✗ No audit trail for verification events
- ✗ Readers expect "verified", get nothing

**Mitigation Required:** Implement verified state workflow

---

## BLOCKER 4: Unit Validation (B4)

### Evidence Source
**P2B_UNIT_CONTRACT.md** - Status: Documented (not enforced)

### What the Proof Shows

**From P2B_UNIT_CONTRACT.md:**
```
Current Assumption:
  ✓ Both fields are numeric (Float) - schema enforced
  ✗ Both fields are same units - NOT documented
  ✗ No validation at boundary - NOT enforced

Risk Scenario:
  Stored impactExpected: 50000 USD
  Request actualOutcome: 50000 EUR
  Math: (50000 - 50000) / 50000 = 0
  Result: Classifies as failure (WRONG!)
```

**Current Validation:** NONE
```
Request boundary check: Missing
Schema comments: Missing
Error handling: Missing
Silent failure: Possible
```

### Classification from Evidence

**B4 Status:** OPEN ✗

**Proof:**
- ✗ No unit consistency validation
- ✗ No boundary check
- ✗ No error if units mismatch
- ✗ Silent failure possible

**Risk Level:** CONDITIONAL (safe if units match, broken if mixed)

**Mitigation:** Document assumption or add validation

---

## Summary Table (Evidence-Only)

| ID | Blocker | Root Cause | Status | Evidence |
|----|---------|-----------|--------|----------|
| B1 | Enum violation | "flagged" not in schema | ✓ CLOSED | Commit adcf7f4, tests pass |
| B2 | Route tests fake | Routes not invoked | ✗ OPEN | P2B_ROUTE_TEST_PROOF.md |
| B3 | Verified missing | No endpoint for "verified" | ✗ MISSING | P2B_VERIFIED_STATE_PROOF.md |
| B4 | Unit validation | No boundary check | ✗ OPEN | P2B_UNIT_CONTRACT.md |

---

## Can Deploy Assessment

### Blocking vs Acceptable

| Blocker | Type | Deploy? | Reason |
|---------|------|---------|--------|
| B1 | CLOSED | ✓ Yes | Fixed and verified |
| B2 | OPEN | ? Depends | Routes untested (service layer OK) |
| B3 | MISSING | ? Depends | Verified unreachable (auto-flag works) |
| B4 | OPEN | ? Depends | Units unvalidated (assume USD) |

### Strict Rules

**From user requirements:**
```
If any backbone blocker OPEN: BLOCKED
If route tests FAKE: BLOCKED
If verified lifecycle incomplete: BLOCKED
Otherwise: READY_FOR_MERGE
```

### Assessment vs Rules

```
B1: CLOSED → OK ✓
B2: OPEN → Route tests untested (FAKE) → BLOCKS ✗
B3: MISSING → Verified incomplete → BLOCKS ✗
B4: OPEN → Unit validation missing → BLOCKS? ⚠
```

---

## Baseline Reconciliation Verdict

**Current State After All Fixes:**

| Component | Status | Evidence |
|-----------|--------|----------|
| B1 Fixed | ✓ CLOSED | Commit adcf7f4 verified |
| B2 Tests | ✗ FAKE_TEST | Routes not invoked |
| B3 Verified | ✗ MISSING | No endpoint |
| B4 Units | ✗ OPEN | No validation |

**Deployment Gate Rule Result:**
```
B2 is FAKE_TEST → BLOCKED
B3 is incomplete → BLOCKED
```

**Preliminary Decision:** Cannot deploy with current blockers

**Next Step:** Implement real route tests (TASK 1) and verified lifecycle (TASK 2)
