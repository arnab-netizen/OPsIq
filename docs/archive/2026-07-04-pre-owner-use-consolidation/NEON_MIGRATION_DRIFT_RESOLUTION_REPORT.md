# Neon Migration Drift Resolution Report

**Date:** 2026-06-19
**Branch:** claude/cool-ptolemy-dxrpm7
**Investigates:** LANE_A failure from run 27795140566
**Supersedes:** `NEON_MIGRATION_DRIFT_INVESTIGATION.md` (investigation only; this document includes resolution actions)

---

## 1. DB Classification

| Field | Value |
|---|---|
| Database | `neondb` at `ep-tiny-breeze-an0qsoje.c-6.us-east-1.aws.neon.tech` |
| Classification | **TEST DATABASE** |
| Evidence | `TEST_DATABASE_URL` secret (non-pooler, direct Neon endpoint); used by DB test suite in CI; no production data; confirmed by LANE_A workflow design comment ("NEVER runs against production") |
| Confirmed throwaway? | **YES** — test DB, no persistent user data |

---

## 2. Environment Variable Findings

| Variable | Status in this environment | Status in GitHub Actions CI |
|---|---|---|
| `DATABASE_URL` | ✅ Valid Neon pooler URL | ✅ GitHub Secret (valid) |
| `TEST_DATABASE_URL` | ✅ Valid Neon direct URL | ✅ GitHub Secret (valid) |
| `MIGRATION_DATABASE_URL` | ❌ Set to literal string `TEST_DATABASE_URL` (not a URL) | ✅ GitHub Secret (actual direct URL — confirmed by LANE_A run 27795140566 which reached the DB) |

**Finding:** `MIGRATION_DATABASE_URL` in the Claude Code remote environment is misconfigured (contains the variable name as a literal string, not the URL). This is a remote environment–only issue. GitHub Actions receives the correct secret value. No code fix required — the GitHub Secret is correct.

**For `prisma migrate status` in this environment:** Must override with `MIGRATION_DATABASE_URL="$TEST_DATABASE_URL"`. Port 5432 (direct Neon) is blocked in this remote environment, so the command cannot reach the Neon DB from here.

---

## 3. Network Policy Finding

| Port | Status | Implication |
|---|---|---|
| Neon direct (port 5432, non-pooler host) | ❌ BLOCKED (P1001: Can't reach `ep-tiny-breeze-an0qsoje:5432`) | Cannot run `prisma migrate status` or `prisma migrate deploy` from this environment |
| Neon pooler (port 5432, pooler host) | ✅ REACHABLE (test suite connects, DB initialized) | Application runtime works; Prisma CLI migrations do not |

**Implication:** `prisma migrate deploy` must be run from GitHub Actions (LANE_A network) or owner's local machine. It cannot be run from this remote Claude Code session.

---

## 4. Migration Status (from LANE_A run 27795140566)

| Metric | Value |
|---|---|
| Last common migration | `20260511_add_aggregate_locks` |
| Pending migrations (local, not in Neon) | **22** (from `20260518_add_startup_status` to `20260615114500_b24_s1_private_mode_access`) |
| Ghost migration (in Neon, not local) | **1** — `1778679447_add_aggregate_locks` |
| Migration timestamp decoded | 2026-05-13 13:37:27 UTC |
| Ghost SQL conflict risk | **NONE** — uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` |

---

## 5. Drift Classification

**D + E combined:**

- **D** = ghost migration exists in DB but missing locally (`1778679447_add_aggregate_locks` — never in git)
- **E** = 22 local migrations exist but not applied to DB (all 22 pending migrations)

Primary root cause: out-of-band `prisma migrate dev` or `prisma db push` session against Neon on 2026-05-13. Created a `_prisma_migrations` record with Unix epoch name; folder was never committed. Subsequent development added 22 more migrations against the local DB without deploying to Neon.

---

## 6. Safe Resolution Path

**Chosen: Run `prisma migrate deploy` via new GitHub Actions workflow (Path B)**

Rationale:
- DB is a confirmed TEST database (throwaway)
- `migrate deploy` is the production-safe, non-destructive deploy command
- Ghost migration uses `IF NOT EXISTS` — no SQL conflicts
- 22 pending migrations operate on different tables (startup_status, approval_workflow, finance modules, etc.)
- Port 5432 is blocked in this environment → must use CI/local machine
- A dedicated, gated workflow (`migrate-neon-test.yml`) provides the one-click resolution path

**Rejected paths:**
- `CREATE_FRESH_NEON_TEST_DB` — not necessary; `migrate deploy` is sufficient and simpler
- `prisma migrate reset` — forbidden; destructive
- `prisma db push` — forbidden; bypasses migration history
- Manual `_prisma_migrations` edit — unnecessary; ghost uses `IF NOT EXISTS`, deploy will succeed

---

## 7. Commands Run

| Command | Result |
|---|---|
| `npx prisma validate` | ✅ Schema valid |
| `MIGRATION_DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate status` | ❌ `P1001: Can't reach database server at ep-tiny-breeze-an0qsoje:5432` (network policy) |

---

## 8. Commands Explicitly NOT Run

| Command | Reason not run |
|---|---|
| `prisma migrate deploy` | Port 5432 blocked in this environment; deferred to CI workflow |
| `prisma migrate reset` | Forbidden by mission ABSOLUTE RULES |
| `prisma db push` | Forbidden by mission ABSOLUTE RULES |
| `prisma db execute` | Not needed |
| Any `DROP TABLE` or `DELETE FROM` | Forbidden by mission ABSOLUTE RULES |
| Any `INSERT INTO _prisma_migrations` | Unnecessary; `migrate deploy` handles this |

---

## 9. Resolution Action Taken

**Added:** `.github/workflows/migrate-neon-test.yml`

A new GitHub Actions workflow with 4 safety gates before running `prisma migrate deploy`:
1. `MIGRATION_DATABASE_URL` must be a real PostgreSQL URL (not a placeholder string)
2. `MIGRATION_DATABASE_URL` must be a direct URL (not contain `-pooler`)
3. `MIGRATION_DATABASE_URL` must not contain placeholder values (including literal `TEST_DATABASE_URL`)
4. Prisma schema must validate before any DB operation

The workflow runs `migrate status` (read-only) before deploy so the CI log shows exactly what will be applied. After deploy, it runs `migrate status` again to confirm all migrations are applied.

**The workflow requires explicit `confirm_test_db_only=yes` to proceed** — it will not run on `no` (the default).

---

## 10. Owner Action Required

### Step 1 — Trigger `migrate-neon-test.yml`

1. Go to: **GitHub → Actions → "Migrate Neon Test Database"**
2. Click **"Run workflow"**
3. Set `confirm_test_db_only` = **yes**
4. Click **"Run workflow"**

**Precondition:** Verify that the `MIGRATION_DATABASE_URL` GitHub Secret contains the actual direct Neon URL (not the string `TEST_DATABASE_URL` and not a pooler URL). The workflow's safety gates will catch misconfiguration and fail fast.

Expected result: 22 pending migrations applied, workflow exits 0.

### Step 2 — Confirm with LANE_A

After `migrate-neon-test.yml` succeeds:

1. Go to: **GitHub → Actions → "DB Verification"**
2. Click **"Run workflow"**
3. Set `use_neon_secrets` = **true**
4. Click **"Run workflow"**

Expected result: LANE_A passes — `migrate status` shows "Database schema is up to date!" (ghost entry `1778679447_add_aggregate_locks` will still appear as a warning — this is cosmetic and acceptable for a test DB). DB test suite 174/174 pass.

### Step 3 — Phase 29 DB Slice Unblocked

Once LANE_A passes, Phase 29 DB slice may proceed:
- Schema: `controlled_learning_candidates` table with workspaceId isolation
- Run migration and verify via LANE_B and LANE_A

---

## 11. Final Status

| Item | Status |
|---|---|
| DB target | Neon TEST database (`ep-tiny-breeze-an0qsoje.c-6.us-east-1.aws.neon.tech/neondb`) |
| DB classification | TEST DATABASE (confirmed throwaway) |
| Direct URL confirmed | ✅ `TEST_DATABASE_URL` = direct non-pooler Neon URL |
| `MIGRATION_DATABASE_URL` in CI | ✅ Correct (confirmed by LANE_A run 27795140566 reaching DB) |
| `MIGRATION_DATABASE_URL` in this env | ❌ Misconfigured (literal string `TEST_DATABASE_URL`, not URL) — CI-only issue |
| Network to Neon port 5432 | ❌ BLOCKED in remote Claude Code session |
| Migration status | 22 pending, 1 ghost (D+E combined drift) |
| Ghost SQL conflict | ✅ NONE (`IF NOT EXISTS` guards) |
| Drift classification | D + E (ghost + pending) |
| Destructive commands run | **NONE** |
| `migrate deploy` run | **NOT YET** — requires CI or local machine (port 5432 blocked here) |
| Resolution workflow added | ✅ `.github/workflows/migrate-neon-test.yml` |
| Phase 29 DB slice unblocked | **PENDING** — unblocked after owner runs Step 1 + Step 2 above |
