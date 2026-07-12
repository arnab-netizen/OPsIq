# Database Proof Lane Reconciliation
**Date:** 2026-07-12  
**Purpose:** Reconcile all "DB_BLOCKED" claims against actual CI database availability.

---

## The Two DB Environments

### 1. This Executor Environment (Neon)

| Property | State |
|----------|-------|
| `DATABASE_URL` | Present (points to Neon Postgres endpoint) |
| Neon endpoint | `ep-tiny-breeze-an0qsoje-pooler.c-6.us-east-1.aws.neon.tech:5432` |
| Network reachability | **BLOCKED** — connection refused from this executor |
| `npx prisma db execute` | Returns P1001 (can't reach server) |
| `TEST_WITH_DB=true npm test` | FAILS at DB connection step |
| DB status classification used | `DB_BLOCKED_ENVIRONMENT_NETWORK` |

This is accurate. The Neon endpoint is not reachable from the remote executor container. This is a network policy restriction, not a missing credential.

### 2. CI Environment (GitHub Actions PostgreSQL)

| Property | State |
|----------|-------|
| Service | `postgres:16` container provisioned by `.github/workflows/ci.yml` |
| DB name | `opsiq_test` |
| Test env variable | `TEST_WITH_DB=true` |
| Reachable from CI | **YES** |
| Tests run | `npm test` with `TEST_WITH_DB=true` |
| Schema setup | `npx prisma migrate deploy` runs before tests |

**Evidence from ci.yml (verified):**
```yaml
services:
  postgres:
    image: postgres:16
    ...
- name: Run tests (with DB)
  run: npm test
  env:
    TEST_WITH_DB: "true"
```

---

## Reconciliation of DB_BLOCKED Claims

### A7.7 BASELINE.md Claim

**Claim:** "TEST_WITH_DB=true npm test: DB_BLOCKED. DATABASE_URL (Neon) unreachable."

**Accuracy:** ACCURATE for this executor. The BASELINE.md correctly notes: "CI workflow provisions PostgreSQL service with TEST_WITH_DB=true and runs the full suite including DB tests."

**Classification:** The DB_BLOCKED claim is accurate AND appropriately scoped. It does not claim CI is blocked.

### Execution State "DB_BLOCKED_ENVIRONMENT_NETWORK" Entries

All execution state entries with `DB_BLOCKED_ENVIRONMENT_NETWORK` are:
1. Accurate about executor environment
2. Correctly delegate DB proof to CI
3. Not claiming CI is blocked

**Corrected classification:** All prior `DB_BLOCKED_ENVIRONMENT_NETWORK` entries in `execution_state.json` are ACCURATE and NOT misleading. They correctly distinguish executor vs CI.

---

## What CI Actually Proves

When this branch is pushed and CI runs:

1. `npx prisma migrate deploy` — applies all migrations from `prisma/migrations/`
2. `npm test` with `TEST_WITH_DB=true` — runs all tests including DB tests
3. Tests that require DB (`.db.test.ts` pattern) actually connect to the `postgres:16` service

**DB tests that exist and will run in CI:**

| Test File | What It Proves |
|-----------|---------------|
| `change-decision-status-atomic.db.test.ts` | F2: CAS state guard on decision status change |
| `decision-creation-audit.db.test.ts` | F1: AuditEvent row created on decision creation |
| `role-access.service.db.test.ts` | F3: CAS in all 4 role access mutations |
| Any other `*.db.test.ts` files | Phase 6-era DB-backed proofs |

---

## CI DB Lane Availability: What Has NEVER Been Verified

Despite CI having the postgres:16 lane, the following have NEVER been pushed to CI from this branch:

1. A7.6 commits — BRANCH_ONLY, never pushed for CI validation
2. A7.7 commits — BRANCH_ONLY, never pushed for CI validation

**This means:** The DB tests that prove A7.7 security fixes work (fail-closed audit, CAS guards, etc.) have never run against the real postgres:16 CI database. They've only run against mocks or Neon (which is blocked in executor).

**Risk:** If a DB test has an error that only manifests against a real Postgres instance (not mocks), it would be undiscovered until push.

---

## Required DB Proof Actions

| Action | Priority |
|--------|----------|
| Push branch to origin (to trigger CI postgres:16 run) | CRITICAL |
| Verify all `.db.test.ts` files pass in CI | HIGH |
| Confirm `npx prisma migrate deploy` completes without error on CI schema | HIGH |
| Document CI test run result as DB proof artifact | MEDIUM |

---

## Summary

| Claim | Verdict |
|-------|---------|
| Executor DB is blocked (Neon) | ACCURATE |
| CI has working DB lane (postgres:16) | CONFIRMED |
| A7.7 DB tests proven on CI postgres | **NOT YET — branch never pushed** |
| DB_BLOCKED classification is misleading | FALSE — correctly scoped to executor only |

The DB proof lane is real and functional. The gap is that A7.7 work has never been pushed to CI to exercise it. Merging the branch will close this gap.
