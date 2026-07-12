# Test Integrity Matrix — Invariant I8

Audit date: 2026-07-12

## Summary

3 findings, all WARN severity. No FAIL (tests exercise real code in part; none are pure mock-setup tests).

## Finding I8-001 — finance-snapshot-audit mocks calculateDataConfidence

**File:** `src/__tests__/services/finance-snapshot-audit-transaction-r0.test.ts:22`  
**Defect:** Test exercises `createFinancialSnapshot` service but mocks away `calculateDataConfidence` from `@/domain/owner-finance/data-confidence` with hardcoded return value `{ dataConfidenceScore: 0.8, missingCritical: false }`.

**Why this is a WARN:** The test's stated purpose is audit atomicity — it checks that the audit event is created in the same transaction as the snapshot. For that purpose, the domain calculation is irrelevant and mocking it is acceptable. However, the mock means any regression in `calculateDataConfidence` (wrong score, wrong missingCritical flag) would not surface in this test.

**Risk:** Domain regressions invisible to this test. A separate unit test for `calculateDataConfidence` directly is needed.

---

## Finding I8-002 — do-not-repeat test mocks evaluateDoNotRepeat

**File:** `src/__tests__/services/do-not-repeat-phantom-field-r0.test.ts:29`  
**Defect:** Test targets `enforceDoNotRepeatForPromotion` / `recordDoNotRepeat` in the service layer but mocks `evaluateDoNotRepeat` from `@/domain/owner-mode/do-not-repeat` with hardcoded `{ blocked: false, reason: null }`.

**Why this is a WARN:** The service is the system under test; the domain function is a dependency. Mocking dependencies is an accepted pattern. However, the current mock means the test does not validate that the service correctly interprets domain output in the blocked=true case. If `evaluateDoNotRepeat` returns `blocked: true` and the service ignores it, the test would still pass.

**Risk:** Missing coverage of the blocked branch through the full service path.

---

## Finding I8-003 — condition-route-hardening hollows out auth enforcement

**File:** `src/__tests__/p2c/condition-route-hardening.test.ts:27`  
**Defect:** Route test replaces `withCanonicalEnforcement` with a no-auth pass-through and stubs every service the route calls. Only the domain adapter `deriveHardeningContextFromConditionProfile` is actually exercised.

**Why this is a WARN:** This is a unit test of the domain adapter, not a route integration test. The file's name ("condition-route-hardening") implies it tests the route hardening, but the route's auth, validation, and service dispatch are all bypassed.

**Risk:** Route integration semantics are not validated. Auth enforcement on this route is only tested via system/E2E tests if they exist; this test provides false confidence that "the route" is tested.

**Recommended fix:** Either rename the test to reflect what it actually tests (`condition-domain-adapter.test.ts`), or add a separate integration test that exercises the route with real auth enforcement.
