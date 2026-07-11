# Phase R0 — Root-Cause Invariant Matrix

**Date:** 2026-07-10
**Branch:** `claude/phase-r0-systemic-root-cause-invariant-closure`
**Purpose:** Prevent future instance-by-instance security fixes by naming and enforcing the invariant families that produced all confirmed bugs in Phases 6I–6J.

---

## Invariant Families

### INV-1: PRISMA_CREATE_SELECT_INTEGRITY

**Statement:** Every Prisma `select` or `include` block that references a model field MUST reference a field that exists in `prisma/schema.prisma` for that model.

**Why it matters:** Phantom field references cause `PrismaClientValidationError` at runtime, producing raw HTTP 500 on any request that reaches the query. The error is silent in CI when the query path requires real DB connectivity.

**Confirmed violations:** D1-01 — `do-not-repeat.service.ts:63` selected `code` from `Finding`, which has no `code` field.

**Fix applied:** Removed `code: true` from the interface and select call. Removed dead `if (finding?.code) keys.add(finding.code)` key derivation.

**Detection tool:** `scripts/scan-prisma-integrity.js`

---

### INV-2: GOVERNED_MUTATION_IDEMPOTENCY

**Statement:** Every POST route that creates a governed record (SpendEntry, Decision, Finding, Recommendation, etc.) MUST enforce an `idempotency-key` header and deduplicate via `checkIdempotencyKey` before any DB write.

**Why it matters:** Duplicate POSTs (network retry, user double-click, client timeout + retry) silently create duplicate governed records. In financial and compliance contexts this produces incorrect aggregates and double-counting.

**Confirmed violations:** D3-01 — `POST /api/owner/budget/spend` created `SpendEntry` without idempotency guard.

**Fix applied:** Added idempotency-key header check + `checkIdempotencyKey` / `recordIdempotencyResponse` / `recordIdempotencyError` to budget spend route.

**Detection tool:** `scripts/scan-prisma-integrity.js` (route inventory column `idempotency`)

---

### INV-3: GOVERNED_AUDIT_ATOMICITY

**Statement:** Every service that creates a governed record AND emits an audit event MUST wrap both in a single `db.$transaction`. An audit failure must roll back the record write.

**Why it matters:** If the record write succeeds but the audit write fails, the system has a mutation with no audit trail — violating the `All meaningful mutations must emit audit events` hard rule. The record is silently untracked.

**Confirmed violations:** D3-03 — `createFinancialSnapshot` called `emitAuditEvent` outside the snapshot create transaction.

**Fix applied:** Wrapped `tx.ownerFinancialSnapshot.create` + `emitAuditEvent(input, tx)` in `db.$transaction`. Transaction client `tx` passed as second arg to `emitAuditEvent`.

---

### INV-4: WORKSPACE_TENANT_AUTHORIZATION

**Statement:** Any route that accepts `workspaceId` from an untrusted source (request body, query param, header) MUST validate that the authenticated caller is an active member of that workspace BEFORE any DB write (idempotency, mutation, audit).

**Why it matters:** Without membership validation, any authenticated user can poison idempotency caches, trigger engine calls, and embed their chosen `workspaceId` in persisted records — cross-tenant data contamination.

**Confirmed violations:** D4-01/02/03 — three diagnosis POST routes (`/api/diagnosis/maturity`, `/api/diagnosis/bottleneck`, `/api/diagnosis/root-cause`) accepted `body.workspaceId` without membership check.

**Fix applied (Phase 6J):** Inserted `db.workspaceMembership.findFirst` check after `parseRequestBody`, before `checkIdempotencyKey`, throwing `ForbiddenError` for non-members.

---

### INV-5: DUPLICATE_AUTH_RESOLUTION

**Statement:** No route may apply two distinct authentication wrappers (`withAuth` + `withCanonicalEnforcement`, or `withAuth` + `withEnforcementFull`). Each route must use exactly one canonical pattern appropriate to its security tier.

**Why it matters:** Duplicate auth wrappers create ambiguity about which context is authoritative. The outer wrapper may pass while the inner fails (or vice versa), producing inconsistent audit trails and capability checks.

**Confirmed violations:** Catalogued in inventory. No must-fix violations in Phase R0 scope.

**Status:** NOTED — inventory documented, pattern enforcement added to CLAUDE.md guidance.

---

### INV-6: ACTIVE_TEST_ASSERTION_TRUTH

**Statement:** No test file may contain `expect(true).toBe(true)` or equivalent tautological assertions without an explicit `// Phase R<N>: deferred` comment and a linked tracking note. Tests that always pass regardless of implementation state must be converted or removed.

**Why it matters:** Fake assertions make CI green while providing zero coverage. They hide broken code and erode confidence in the test suite.

**Confirmed violations:** 773 instances across 29 files. `hostile-auth-tests.test.ts` (25 tests, all tautological).

**Fix applied (Phase R0):** Converted three tests to real assertions (health, readiness, submit-external). Remaining 22 tests marked `// Phase R1 deferred`. Grand total reduction: 3 fake assertions removed from hostile-auth cluster.

**Detection tool:** `scripts/scan-fake-assertions.js`

---

### INV-7: CI_LANE_TRUTHFULNESS

**Statement:** CI lane names and test counts in audit documents must match actual passing test file outputs. Any discrepancy must be escalated immediately, not papered over.

**Why it matters:** False CI claims allow broken code to be tagged HONEST_GREEN and merged. This invariant prevents audit documents from misrepresenting test state.

**Confirmed violations:** None confirmed in Phase R0.

**Monitoring:** All Phase R0 test counts verified against actual jest runs before commit.

---

## Summary Table

| ID | Invariant | Phase R0 Status |
|---|---|---|
| INV-1 | PRISMA_CREATE_SELECT_INTEGRITY | FIXED (D1-01) |
| INV-2 | GOVERNED_MUTATION_IDEMPOTENCY | FIXED (D3-01) |
| INV-3 | GOVERNED_AUDIT_ATOMICITY | FIXED (D3-03) |
| INV-4 | WORKSPACE_TENANT_AUTHORIZATION | FIXED (D4-01, Phase 6J) |
| INV-5 | DUPLICATE_AUTH_RESOLUTION | NOTED, deferred |
| INV-6 | ACTIVE_TEST_ASSERTION_TRUTH | PARTIALLY FIXED, 3 converted |
| INV-7 | CI_LANE_TRUTHFULNESS | MONITORED |
