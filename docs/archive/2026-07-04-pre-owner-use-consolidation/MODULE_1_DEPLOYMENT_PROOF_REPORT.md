# Module 1 Deployment Proof Report

Date: 2026-06-10
Branch: `claude/vibrant-ramanujan-mdqej8`
HEAD: `3b57e55` (contains `5fc46a0 OWNER_RECOVERY_MODE_PROVEN_RUNTIME`)

## Executive Verdict

Status: **BLOCKED_REAL_DATABASE_CREDENTIAL_MISSING**

Module 1 (Owner Recovery V1) is confirmed present, valid, and buildable in HEAD, and was previously proven end-to-end against a *local* ephemeral PostgreSQL (documented in `OWNER_RECOVERY_RUNTIME_PROOF_REPORT.md`). However, **real/staging deployment proof cannot be performed from this environment.** A real database URL with credentials does exist in `.env.local` (`DIRECT_URL` and `DATABASE_URL_TEST`, both Neon), but: (1) this sandbox's network policy **blocks all outbound egress** — TCP 5432 to both Neon hosts is unreachable and even `8.8.8.8:53` is blocked — confirmed by Prisma `P1001: Can't reach database server`; and (2) the primary pooled `DATABASE_URL` in `.env.local` is a **placeholder** (`REPLACE_POOLED_HOST/REPLACE_DB`). No reachable, usable real/staging DB is available here, so `prisma migrate deploy`, deployed-app commit proof, owner-access proof, and a real business cycle against the real DB are all blocked. The migration is additive and safe to deploy — it just must be run from an environment that has network egress to the Neon database.

## Repo Baseline

| Check | Result |
|---|---|
| `git status --short` | clean (no uncommitted changes) |
| `git branch --show-current` | `claude/vibrant-ramanujan-mdqej8` |
| `git log --oneline -5` | `3b57e55`, **`5fc46a0 OWNER_RECOVERY_MODE_PROVEN_RUNTIME`**, `81b63eb`, `99d2ff3`, `466ae9e` |
| HEAD contains `5fc46a0` | YES (`git merge-base --is-ancestor 5fc46a0 HEAD` → true) |
| Migration in HEAD | PRESENT: `prisma/migrations/20260610120000_owner_recovery_mode/migration.sql` (6 CREATE TABLE, 8 FK, 14 INDEX) |
| Owner recovery route | PRESENT: `src/app/(authenticated)/owner/recovery/page.tsx` |
| Owner recovery APIs | PRESENT: 8 routes under `src/app/api/owner/recovery/` |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully; `/owner/recovery` + all 8 APIs emitted |
| `npx vitest run src/__tests__/founder-recovery/` | 8 files passed, 1 skipped (the `[db]` DB suite, gated by `TEST_WITH_DB`); 38 passed, 8 skipped. (Note: task path `src/tests/founder-recovery/` does not exist; actual path is `src/__tests__/founder-recovery/`.) |

## Database Target

Inspection of env files (secrets never printed; passwords masked; hosts redacted where shown):

| Source | Var | Host kind | Host/cred state | Usable here? |
|---|---|---|---|---|
| runtime shell | DATABASE_URL / DIRECT_URL / DATABASE_URL_TEST | — | all **unset** at runtime | No |
| `.env.local` | DATABASE_URL | OTHER | `REPLACE_POOLED_HOST` → **PLACEHOLDER** | No |
| `.env.local` | DIRECT_URL | Neon (ap-southeast-1) | REAL host, credentials present | Network-blocked |
| `.env.local` | DATABASE_URL_TEST | Neon (us-east-1) | REAL host, credentials present | Network-blocked |
| `.env.test` | DATABASE_URL | localhost | local only | n/a (not staging; DB not running) |
| `.env.staging.example` / `.env.postgres` / `.env.example` | DATABASE_URL | localhost | example/placeholder | No |

- **Which env var is needed**: a reachable `DATABASE_URL` (pooled, for the app) and a `DIRECT_URL` (non-pooling, for Prisma migrations) pointing at the staging/dev Neon database. Prisma reads the datasource from `prisma.config.ts`, which loads `.env.local` with `override: true`, so the real value must be present there (or `migrate dev --url`).
- **Whether DATABASE_URL exists**: only as a placeholder in `.env.local`; the real values live in `DIRECT_URL`/`DATABASE_URL_TEST`.
- **Direct/non-pooling URL needed for migration**: YES — Neon requires the direct (non-pooled) URL for `migrate deploy`; `DIRECT_URL` is the intended value.
- **Target classification**: `DIRECT_URL` host = a Neon `neondb` (dev/primary); `DATABASE_URL_TEST` = a Neon test DB. Neither is labelled `staging` explicitly. Production: not configured here.
- **Safe to run `prisma migrate deploy`**: the migration itself is **safe and additive** (6 new tables, 0 changes to existing tables) — but it **cannot be run from this sandbox** because the DB is unreachable (network egress blocked).

## Migration Deployment Result

**BLOCKED — not applied to any real/staging DB.**
- `npx prisma migrate status` (against the real `DIRECT_URL`, with secrets filtered) → `Error: P1001: Can't reach database server at [neon-host-redacted]:5432`.
- Reachability tests: `TCP [neon-host]:5432` → UNREACHABLE on both Neon hosts; `8.8.8.8:53` → blocked. The environment's network policy denies outbound egress.
- `prisma migrate deploy` was therefore **not run** against the real DB (it would only fail with the same P1001). No `migrate reset`, `db push`, or destructive SQL was run anywhere. `.env.local` was temporarily repointed to read the real URL for the status check and **restored byte-for-byte** (git shows it clean).

Exact command that would prove this once run from a network-enabled environment:
```
# In an environment WITH egress to Neon, with DIRECT_URL set as the datasource:
npx prisma migrate status
npx prisma migrate deploy        # applies 20260610120000_owner_recovery_mode (additive)
```

## Real Table / Constraint Verification

**NOT PERFORMED against real DB (unreachable).** From the committed migration (`HEAD`), the deploy will create:
- Tables: `owner_businesses`, `owner_metric_snapshots`, `recovery_cycles`, `recovery_findings`, `recovery_actions`, `recovery_verifications` (6).
- Unique constraint: `owner_metric_snapshots(business_id, period_start, period_end)`.
- Foreign keys (8): snapshot→business, cycle→business/snapshot/previous-cycle, finding→cycle, action→cycle/finding, verification→action.
- Indexes (14): workspace_id and relational indexes per table.
(These were verified applied against the local proof DB in the prior task; they are NOT yet verified on the real DB.)

## Deployed App Commit Proof

**NOT VERIFIED.** No deployed/staging app URL is reachable from this sandbox (outbound blocked), and no deployed app URL/build-info endpoint is configured in the available env. Cannot confirm the deployed app runs `5fc46a0` or later. (Local build is on HEAD, which includes `5fc46a0`.)

## Owner Access Proof

**NOT RE-VERIFIED in this task (no reachable runtime).** Owner access was proven in the prior task against the local server (401 unauth, 403 non-owner, 404 cross-workspace, 200/201 owner, capability-gated nav). To prove on the real deployment, an owner-authorized account is required with: a `WorkspaceMembership` (role `admin_or_portfolio_manager`) and a matching `UserRoleAssignment` (role `admin_or_portfolio_manager`, scope `workspace`, scopeId = the workspace), which grant `OWNER_VIEW` + `OWNER_MANAGE` (per `src/policies/capability-check.ts`). No such account can be exercised here without a reachable app/DB.

## Real / Staging Business Cycle Proof

**NOT PERFORMED (no reachable DB/app).** A Tumbledry Mukundapur (laundry_local_service, INR) cycle was proven end-to-end at service + HTTP level against the *local* DB in the prior task (snapshot → diagnosis → findings → actions → status updates → before/after verify `verified_improved` → dashboard → second linked cycle). That is **LOCAL proof, not real/staging deployed proof**, and the local DB is no longer running.

## Dashboard Reflection Proof

**NOT RE-VERIFIED in this task.** Previously proven locally (dashboard surfaced findings/actions/verification status + metric movement). Not proven on real/staging.

## Before/After Verification Proof

**NOT RE-VERIFIED in this task.** Previously proven locally (baseline 30 → after 60 → `verified_improved`, movement 30) at DB and HTTP. Not proven on real/staging.

## Second Cycle Proof

**NOT RE-VERIFIED in this task.** Previously proven locally (cycle 2 linked via `previousCycleId`, resolved findings). Not proven on real/staging.

## Threshold Calibration Notes

Calibration requires real laundry/local-service data, which is unavailable here (no reachable DB, no real Tumbledry numbers entered). All 12 thresholds are therefore **NOT_ENOUGH_REAL_DATA** at this time:

| Finding threshold | Status |
|---|---|
| LOW_REVENUE (revenue decline %) | NOT_ENOUGH_REAL_DATA |
| HIGH_COST_RATIO (net margin %) | NOT_ENOUGH_REAL_DATA |
| WEAK_REPEAT_RATE (repeat %) | NOT_ENOUGH_REAL_DATA |
| DISCOUNT_LEAKAGE (% gross) | NOT_ENOUGH_REAL_DATA |
| QUALITY_FAILURE (complaint+rewash %) | NOT_ENOUGH_REAL_DATA |
| DELIVERY_COST_LEAKAGE (% revenue) | NOT_ENOUGH_REAL_DATA |
| B2B_CONCENTRATION (B2B share %) | NOT_ENOUGH_REAL_DATA |
| LOW_STAFF_PRODUCTIVITY (period drop %) | NOT_ENOUGH_REAL_DATA |
| SLOW_TURNAROUND (hours) | NOT_ENOUGH_REAL_DATA |
| RECEIVABLES_PRESSURE (% revenue) | NOT_ENOUGH_REAL_DATA |
| POOR_CAMPAIGN_CONVERSION (conv/1000) | NOT_ENOUGH_REAL_DATA |
| LOW_AOV (period drop %) | NOT_ENOUGH_REAL_DATA |

No thresholds changed (none obviously broken; calibration deferred until real data exists, per instruction).

## Commands Run

```
git status --short ; git branch --show-current ; git log --oneline -5
git merge-base --is-ancestor 5fc46a0 HEAD            # true
git cat-file -e HEAD:prisma/migrations/20260610120000_owner_recovery_mode/migration.sql   # present
npx prisma validate                                  # valid
npm run build                                         # compiled, routes present
npx vitest run src/__tests__/founder-recovery/        # 38 passed / 8 skipped
# DB target inspection (secrets masked, never printed)
# reachability: /dev/tcp to neon hosts:5432 -> UNREACHABLE ; 8.8.8.8:53 -> blocked
npx prisma migrate status   (DATABASE_URL temporarily = real DIRECT_URL)  # P1001 unreachable
# .env.local restored from backup (git clean)
```

## Failed / Blocked Commands

| Command | Result | Reason |
|---|---|---|
| TCP connect Neon `:5432` (both hosts) | UNREACHABLE | Sandbox network egress blocked |
| TCP `8.8.8.8:53` | blocked | Sandbox has no general outbound internet |
| `npx prisma migrate status` (real DIRECT_URL) | **P1001 Can't reach database server** | DB unreachable from sandbox |
| `npx prisma migrate deploy` (real DB) | NOT RUN | Would fail identically (P1001); not attempted to avoid hanging |
| Deployed-app build-info probe | NOT RUN | No reachable deployed URL configured |

No failures were hidden. No destructive command was run. No secret was printed (URLs masked/redacted).

## Remaining Gaps

1. **Network egress**: this environment cannot reach the Neon DB or the internet. Real-DB proof must run from an environment with egress (Neon SQL editor, CI with network, or the deploy platform).
2. **Primary `DATABASE_URL` is a placeholder** in `.env.local`; the real values are in `DIRECT_URL`/`DATABASE_URL_TEST`. The deploy must use the real direct URL.
3. No real Tumbledry data entered → no real cycle, no threshold calibration, no case study.
4. Deployed app commit (does staging run `5fc46a0`+?) unverified.

## Final Go / No-Go

1. Is Module 1 implemented in repo? **YES, PROVEN**
2. Is Module 1 migration applied to real/staging DB? **NO, NOT PROVEN** (DB unreachable from here)
3. Is deployed app on correct commit? **NO, NOT PROVEN** (no reachable deployment)
4. Is owner access proven? **PARTIAL** (proven locally previously; not on real/staging)
5. Is one recovery cycle proven? **PARTIAL** (proven locally previously; not on real/staging)
6. Is before/after verification proven? **PARTIAL** (proven locally previously; not on real/staging)
7. Can founder use Owner Recovery V1 now? **NO, NOT PROVEN** (not deployed/migrated to a reachable real DB)
8. Can public/SaaS mode resume? **NO, NOT PROVEN** (No-Go rules unmet: no real-DB deploy, no real data, no real cycle, no case study)

Verdict: **BLOCKED_REAL_DATABASE_CREDENTIAL_MISSING** — precisely, the real DB URL exists but is unreachable from this sandbox (network egress blocked) and the pooled `DATABASE_URL` is a placeholder; deployment proof must be executed from a network-enabled environment.
