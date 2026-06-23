# Post-Main Merge E2E Test Report

**Date:** 2026-06-23  
**Branch:** `main` (post-merge commit `1cc6dd02`)  
**Phase:** D — Post-merge E2E testing

---

## Test Runs Summary

All runs performed on `main` after merge commit `1cc6dd02`.

---

### Test 1: Owner Mode SMB Benchmark

| Item | Detail |
|------|--------|
| Command | `npm run test:owner-real-world-smb` |
| Result | **455/455 PASS** |
| Test files | 14 passed |
| Duration | ~298s |
| Failures | 0 |
| Pre-existing? | N/A |
| Blocks owner readiness? | No |

**DB errors noted:** `PrismaClientKnownRequestError` on `startupStatus.deleteMany/upsert` — pre-existing (no `TEST_DATABASE_URL` in this env). Tests pass despite these; startup status has graceful fallback.

---

### Test 2: Owner Mode Real-World Simulation

| Item | Detail |
|------|--------|
| Command | `npm run test:owner-real-world-simulation` |
| Result | **335/335 PASS** |
| Test files | 7 passed |
| Duration | ~281s |
| Failures | 0 |
| Pre-existing? | N/A |
| Blocks owner readiness? | No |

Includes: simulation regression lock (77 assertions), sidecar validator (all simulation cases), simulation structural tests, normalizer tests.

---

### Test 3: TypeScript Typecheck

| Item | Detail |
|------|--------|
| Command | `npx tsc --noEmit` |
| Result | **CLEAN (exit 0)** |
| Errors | 0 |
| Pre-existing? | N/A |
| Blocks owner readiness? | No |

---

### Test 4: Prisma Schema Validation

| Item | Detail |
|------|--------|
| Command | `npx prisma validate` |
| Result | **VALID** |
| Warning | Preview feature `driverAdapters` deprecated (cosmetic, pre-existing) |
| Pre-existing? | Yes (cosmetic warning, not an error) |
| Blocks owner readiness? | No |

---

### Test 5: ESLint

| Item | Detail |
|------|--------|
| Command | `npm run lint` |
| Result | 11895 problems (6861 errors, 5034 warnings) |
| Pre-existing? | **YES** — pre-existing repo-wide lint debt (ratchet baseline exists) |
| Owner mode specific | 7 warnings in `tests/owner-mode/` (unused vars — cosmetic) |
| Blocks owner readiness? | No — pre-existing debt, not introduced by Phases 1-6 |

Lint ratchet script (`scripts/lint-ratchet.mjs`) and `.claude/lint-baseline.json` control this. No new errors introduced by Owner Mode work.

---

### Test 6: DB Integration (LANE_B)

| Item | Detail |
|------|--------|
| Command | Requires `TEST_DATABASE_URL` in environment |
| Result | **NOT RUN** — `TEST_DATABASE_URL` not available in this environment |
| Pre-existing? | Yes — Neon test DB is a GitHub Actions secret |
| Blocks owner readiness? | No — LANE_B gap is pre-existing and documented; Phases 5/6 are LANE_A (no DB) |
| Workflow | `.github/workflows/db-verification.yml` exists for CI |

---

## Overall E2E Gate Result

| Gate | Result | Blocks? |
|------|--------|---------|
| SMB benchmark 455/455 | PASS | — |
| Simulation 335/335 | PASS | — |
| TypeScript clean | PASS | — |
| Prisma valid | PASS | — |
| ESLint | Pre-existing debt (not new) | No |
| LANE_B DB | Env unavailable (pre-existing) | No |

**E2E GATE: PASS** — all gates that can run in this environment pass.
