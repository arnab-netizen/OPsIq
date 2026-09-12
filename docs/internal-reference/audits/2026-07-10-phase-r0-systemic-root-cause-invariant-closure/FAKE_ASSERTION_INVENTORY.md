# Phase R0 — Fake Assertion Inventory

**Date:** 2026-07-10
**Finding:** INV-6 — ACTIVE_TEST_ASSERTION_TRUTH violation
**Tool:** `scripts/scan-fake-assertions.js`

---

## Summary

773 unconditional `expect(true).toBe(true)` (and equivalent) fake assertions
found across 29 test files. These always pass regardless of the code under test,
making the CI suite report green while providing zero coverage signal.

---

## Phase R0 Conversions

Three tests converted in `src/__tests__/security/hostile-auth-tests.test.ts`:

| Test | Converted assertion |
|---|---|
| `submit-external POST is permanently disabled` | `await expect(submitExternalPOST()).rejects.toThrow("Endpoint disabled")` |
| `submit-external GET is permanently disabled` | `await expect(submitExternalGET()).rejects.toThrow("Endpoint disabled")` |
| `health endpoint has no auth enforcement` | `expect(result).toMatchObject({ status: expect.any(String) })` |
| `readiness endpoint has no auth enforcement` | `expect([200, 503]).toContain(response.status)` |

22 remaining tests in `hostile-auth-tests.test.ts` marked `// Phase R1 deferred` with
explanatory comments.

---

## Files With Fake Assertions (Phase R0 inventory)

*Counts from scan run at 2026-07-10. Run `node scripts/scan-fake-assertions.js` for current state.*

| File | Count | Notes |
|---|---|---|
| `src/__tests__/security/hostile-auth-tests.test.ts` | 22 remaining | Phase R1 deferred markers |
| (28 other files) | ~751 | Phase R1 deferred |

---

## Deferred Cluster — Hostile Auth (22 remaining)

Tests deferred to Phase R1, pending test-harness abstraction for route handler mocking:

**Group: workspace header spoofing (2)**
- unauthenticated request with x-workspace-id header should fail
- authenticated user cannot access other workspace via header

**Group: unauthenticated access to protected routes (7)**
- no auth = notification/preferences/audit/value/quota/intelligence/verify denied

**Group: webhook security (5)**
- invalid stripe signature, replay, malformed payload, duplicate event, webhook test auth

**Group: capability enforcement (3)**
- ENGAGEMENT_VIEW / AUDIT_VIEW / WEBHOOK_MANAGE capability checks

**Group: entitlement routes (4)**
- quota check/increment, entitlement check, capability check requires auth

**Group: public routes (1 remaining)**
- public actions endpoint has no auth enforcement

---

## Phase R1 Target

Implement a test-harness abstraction for `withAuth` / `withCanonicalEnforcement` stacks
that allows route handler integration tests without a running server. Target: convert all
22 deferred hostile-auth tests to real assertions with no fake placeholders.

Detection scan target: `node scripts/scan-fake-assertions.js` should output CLEAN.
