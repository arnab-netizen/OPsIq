# Post-Gap-Fix LANE_B Verification Report

**Date:** 2026-06-19
**Branch:** `claude/cool-ptolemy-dxrpm7`
**Final verified commit:** `cdd00a17`
**LANE_B run ID:** 27850296940
**Job ID:** 82427900653

---

## Summary

LANE_B (db-verification.yml) has passed on commit `cdd00a17` with a fresh postgres:16 throwaway container. All schema migrations deployed cleanly. All DB tests passed with 0 failures.

---

## Migration History for This Validation Pass

| Run ID | Commit | Step 10 (deploy) | Step 11 (DB tests) | Conclusion |
|--------|--------|-------------------|--------------------|------------|
| 27847834527 | 0ec66b70 | ❌ FAIL — migration sort order | N/A | FAIL |
| 27850036798 | 49003984 | ✅ PASS | ❌ FAIL — fixture missing `outcomeRecordedAt` | FAIL |
| 27850296940 | cdd00a17 | ✅ PASS | ✅ PASS | **✅ PASS** |

---

## Root Causes Fixed

### Fix 1: Migration Sort Order (commit 49003984)

**Error:** `relation "controlled_learning_candidates" does not exist`

**Root cause:** Migration directory `20260619_high3_high4_high5_scenario29_rollout_outcome_window` alphabetically sorted before `20260619_phase29_controlled_learning_candidates` (`h` < `p`), causing the `ALTER TABLE` to execute before `CREATE TABLE` on the fresh postgres:16 container.

**Fix:** Renamed migration directory to `20260619_z_gap_fix_high3_high4_high5_scenario29` — the `z_` prefix ensures it sorts after all phase29–phase35 migrations.

### Fix 2: DB Test Fixture Missing `outcomeRecordedAt` (commit cdd00a17)

**Error:** Tests expecting Guards 4/5/6 to fire were instead blocked at Guard 2b with "Outcome timestamp not recorded — outcome window cannot be verified server-side"

**Root cause:** `eligibleCandidate` fixture in `controlled-learning-admission.db.test.ts` was written before HIGH-3 was implemented. The Guard 2b check blocks admission when `outcomeRecordedAt` is null on the DB candidate record, which was the case for the test fixture.

**Fix:** Added `outcomeRecordedAt: new Date("2026-04-01T00:00:00Z")` to `eligibleCandidate`. This is 79 days before `baseInput().admittedAt` (2026-06-19), satisfying the ≥30 day window requirement. All 9 previously failing tests now pass correctly.

---

## LANE_B Step Results (Run 27850296940, Commit cdd00a17)

| Step | Name | Result |
|------|------|--------|
| 1 | Set up job | ✅ success |
| 2 | Initialize containers | ✅ success |
| 3 | Checkout code | ✅ success |
| 4 | Setup Node.js | ✅ success |
| 5 | Install dependencies | ✅ success |
| 6 | Verify rolldown native binding | ✅ success |
| 7 | Configure local test environment | ✅ success |
| 8 | Generate Prisma client | ✅ success |
| 9 | Prisma validate | ✅ success |
| 10 | Prisma migrate deploy (throwaway container) | ✅ success |
| 11 | Run full DB test suite | ✅ success |

---

## Schema Migration Verified

**File:** `prisma/migrations/20260619_z_gap_fix_high3_high4_high5_scenario29/migration.sql`

```sql
ALTER TABLE "controlled_learning_candidates"
  ADD COLUMN IF NOT EXISTS "outcomeRecordedAt" TIMESTAMP(3);
```

Applied cleanly on postgres:16 with all prior migrations in the correct order. No foreign key errors, no relation-not-found errors.

---

## DB Tests Verified (step 11)

All DB guard tests in `src/__tests__/api/owner/controlled-learning-admission.db.test.ts` pass, including:

- BLOCKER-2 (review gate): admission blocked when no APPROVED review; admitted when review exists; query scoped correctly
- BLOCKER-3 (DB eligibility): LEARNING_INELIGIBLE_UNVERIFIED blocks; LEARNING_INELIGIBLE_AI_GENERATED blocks; DB status written to record not caller value
- HIGH-6 (CRITICAL harm): admission blocked when unmitigated CRITICAL harm exists; query scoped to severity=CRITICAL, mitigated=false
- Forbidden origins: all 4 forbidden origins blocked before any DB lookup
- Workspace isolation: cross-workspace blocks; list scoped to workspace; get returns null for other-workspace
- Duplicate guard: blocks if admission record already exists

---

## LANE_B Classification

**LANE_B_DB_VERIFIED** — commit `cdd00a17`, run 27850296940, postgres:16, 2026-06-19
