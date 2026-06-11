# Owner-Only End-to-End Mode — Implementation Report

Date: 2026-06-10
Branch: `claude/vibrant-ramanujan-mdqej8`
Latest commit at write time: `81b63eb` (no new commit — see "Commit policy" below).

## Final Status

**OWNER_MODE_PARTIAL** — The full owner-only recovery loop is implemented end-to-end in code (route, APIs, models, services, UI, nav) with the real calculation/diagnosis/verification logic **PROVEN by 33 passing unit tests**, `prisma validate` passing, and `npm run build` passing. It is marked PARTIAL (not PROVEN) because **live database persistence/authorization could not be exercised at runtime** in this environment (no `DATABASE_URL`/PostgreSQL). The DB-backed layer is type-checked and built but not runtime-proven here.

## 1. Existing owner-mode: reused, extended, or replaced?

**Decision C — CREATE_SEPARATE_FOUNDER_RECOVERY_MODE, reusing internal primitives.** (See `OWNER_MODE_RECONCILIATION_REPORT.md` and `OWNER_ONLY_MODE_IMPLEMENTATION_PLAN.md`.)

- **Reused (unchanged):** `withCanonicalEnforcement` (auth + workspace + capability + audit), `db`, `emitAuditEvent`, `parseRequestBody`/`parseOrThrow`/`uuidSchema`, `canonicalJson`, the `OWNER_VIEW`/`OWNER_MANAGE` capabilities, and the role→capability policy.
- **Bypassed (not built on):** the legacy `Action` status enum and `outcome/verification.ts` — both proven broken in prior audits. The recovery mode uses its own correct status machine and a real before/after verification engine.
- **Not modified:** the existing `owner-mode` portfolio dashboard, the diagnosis flow, and the legacy action/verification primitives (no regression risk).

## 2. What was implemented

A complete owner-only recovery loop answering the 9 owner questions:
1. What's wrong → diagnosis findings from real metrics.
2. What proves it → each finding cites source metric + value + threshold + evidence.
3. Likely impact → per-finding financial/operational impact estimate (in business currency).
4. What first → severity-ranked findings → prioritized actions.
5. Who → action `assignedToRole` (+ optional `assignedToUserId`).
6. By when → action `dueAt` from severity-based windows.
7. What metric should improve → action `metricToMove` + `targetValue` + `direction`.
8. Did it improve → before/after verification with explicit status.
9. What next → repeated, linked cycles with trend comparison.

## 3. Routes created/wired

- UI: **`/owner/recovery`** (`src/app/(authenticated)/owner/recovery/page.tsx`) — business selector, create-business form, metric-snapshot form, run-cycle, findings, actions (assign/start/complete/block/verify), verification badges, cycle history, and explicit empty states.
- Nav: added **"Owner Recovery"** entry to `src/ui/shell/sidebar-nav.tsx`.

## 4. APIs created/wired (all under `/api/owner/recovery/*`)

| Method | Path | Capability |
|---|---|---|
| GET/POST | `/api/owner/recovery/businesses` | OWNER_VIEW / OWNER_MANAGE |
| GET/PATCH | `/api/owner/recovery/businesses/[businessId]` | OWNER_VIEW / OWNER_MANAGE |
| GET/POST | `/api/owner/recovery/businesses/[businessId]/snapshots` | OWNER_VIEW / OWNER_MANAGE |
| GET/POST | `/api/owner/recovery/businesses/[businessId]/cycles` | OWNER_VIEW / OWNER_MANAGE |
| GET | `/api/owner/recovery/cycles/[cycleId]` | OWNER_VIEW |
| GET/PATCH | `/api/owner/recovery/actions/[actionId]` | OWNER_VIEW / OWNER_MANAGE |
| POST | `/api/owner/recovery/actions/[actionId]/verify` | OWNER_MANAGE |
| GET | `/api/owner/recovery/dashboard` | OWNER_VIEW |

All gated by `withCanonicalEnforcement` with `requireWorkspace: true` and workspace-scoped queries.

## 5. Prisma models created/changed

New models in `prisma/schema.prisma` (self-contained, workspace-isolated):
`OwnerBusiness`, `OwnerMetricSnapshot` (28 metric fields + unique `[businessId, periodStart, periodEnd]`), `RecoveryCycle` (linked via `previousCycleId`), `RecoveryFinding`, `RecoveryAction` (keeps owner/due/metric/baseline/target/verificationWindow/direction), `RecoveryVerification`.
`npx prisma validate` → valid. `npx prisma generate` → client generated.

## 6. Existing defects fixed (minimal, justified)

- **`OWNER_MANAGE` granted to `ADMIN_OR_PORTFOLIO_MANAGER`** in `src/policies/capability-check.ts`. Previously `OWNER_MANAGE` was granted to **no** role except `system_admin`, so the owner/portfolio persona could not perform any owner write (including the pre-existing `/api/owner/config` POST). This one-line grant makes the owner persona able to use the recovery mode. (The broken legacy `Action` enum and hardcoded `outcome/verification.ts` were **bypassed**, not edited, to avoid touching the consultant/public flow.)
- Added recovery audit-event names to `src/domain/constants/audit-events.ts`.

## 7. Tests added/updated

New pure-logic unit tests (no DB), all passing — `src/__tests__/founder-recovery/`:
- `metrics.test.ts` — margins, rates, ratios, trends, cash pressure, null-safety, currency.
- `diagnosis.test.ts` — 12 laundry findings, evidence/threshold presence, severity ordering, healthy = no findings, revenue-decline needs prior period.
- `recovery-actions.test.ts` — owner/due/metric/baseline/target/window preserved; finding linkage; critical → tight due dates.
- `verification.test.ts` — improved (up/down), missed target, wrong-direction, missing after/baseline, disputed, no-hardcoded-success.
- `action-status.test.ts` — valid/invalid transitions, terminal states, legacy enum values rejected, completion-evidence rule.
- `validation.test.ts` — required period/currency, negative rejection (profit allowed), impossibility checks, missing-critical flagging, staleness.
- `closed-loop.test.ts` — two cycles: cycle-1 diagnosis → action baseline; cycle-2 trend comparison + before/after verification resolves the finding.

## 8. Commands run

| Command | Result |
|---|---|
| `git status --short` / `git branch --show-current` / `git log -1 --oneline` | clean → working tree, branch `claude/vibrant-ramanujan-mdqej8`, commit `81b63eb` |
| `npx prisma validate` | **valid** |
| `npx prisma generate` | client generated to `src/generated/prisma` |
| `npx vitest run src/__tests__/founder-recovery/` | **7 files, 33 tests passed** |
| `npm run build` | **Compiled successfully**; all `/owner/recovery` routes + page present |
| `npm test` (full suite) | **5446 passed, 151 skipped, 16 failed** (failures isolated to one pre-existing live-HTTP file — see below) |

## 9. Passing commands

- `npx prisma validate` ✓
- `npx prisma generate` ✓
- `npm run build` ✓
- `npx vitest run src/__tests__/founder-recovery/` ✓ (33/33)
- Full suite: 5446 unit tests pass, including all founder-recovery logic.

## 10. Failed / blocked commands

- **`npm test` — 16 failures, all in `src/__tests__/security/ops-endpoints-auth.test.ts`.** These call `fetch("http://localhost:3000/...")` against a server that is not running → `ECONNREFUSED`. Pre-existing, environment-bound (live-server integration), **not** caused by these changes and **not** touching founder-recovery code.
- **DB-backed runtime proof: BLOCKED_BY_ENVIRONMENT.** No `DATABASE_URL`/PostgreSQL is provisioned (test env logs "DATABASE_URL not configured for local testing, skipping DB initialization"). Therefore live persistence, the snapshot→cycle→action→verify round-trip against a real DB, and route authorization at runtime were not executed here. The service/route/UI layers are type-checked and built, and the pure logic they call is unit-proven.
- **Migrations not created** (per the standing constraint): the schema validates and the client is generated, but `prisma migrate` was not run (requires a DB). A migration must be generated before deployment.

## 11. What remains partial

- DB-backed end-to-end runtime proof (persistence + authorization) — blocked by missing DB.
- A Prisma migration for the 6 new tables must be generated against a database before use.
- Sidebar visibility is currently shown to all authenticated users; the **route** is capability-gated server-side (`OWNER_VIEW`), but hiding the nav item by capability needs the user's capabilities passed into `AppShell` (follow-up; does not affect access control).
- Snapshot editing (vs. create-only) and per-action assignment-to-specific-user UI are minimal (assignment-to-user is supported by API, basic in UI).

## 12. Can the owner use it on Tumbledry now?

**PARTIAL.** The code path is complete and correct: an owner can create a laundry business (currency INR), enter a real metric snapshot (revenue, costs, orders, B2C/B2B, repeat customers, complaints, rewashes, receivables, delivery cost, marketing, turnaround, etc.), run a diagnosis cycle that produces evidence-backed findings with thresholds and impact, get a prioritized recovery plan with owner/due/metric/target, track execution through a valid status machine, and verify real before/after improvement across repeated cycles — all proven by unit tests and a passing build. It is **not yet YES, PROVEN** only because this environment has no database to demonstrate live persistence and authorization, and a migration has not been generated.

## 13. Public subscription-ready?

**NO, NOT PROVEN.** This work delivers an owner-only/internal recovery surface. Public subscription readiness (billing, demo/real separation, onboarding, multi-tenant hardening, live-runtime proof) is explicitly out of scope and not built.

## Commit policy (constraint honored)

The task instructed: **do not commit, do not push**, and if a hook tries to force commit/push, **stop and report the conflict**. No `git commit`/`git push` was run. If the repository stop-hook flags untracked files and asks to commit/push, that is the conflict to surface — these changes were deliberately left uncommitted per the task.

## Acceptance criteria status

| # | Criterion | Status |
|---|---|---|
| 1 | Owner-only route exists | ✅ `/owner/recovery` |
| 2 | Route protected | ✅ `OWNER_VIEW`/`OWNER_MANAGE` + workspace |
| 3 | Create/select business | ✅ API + UI |
| 4 | Enter real metric snapshot | ✅ API + UI (28 fields) |
| 5 | Metrics persisted | ✅ code/build; ⛔ live DB blocked |
| 6 | Diagnosis from persisted metrics | ✅ `runCycle` reads snapshot; logic unit-proven |
| 7 | Findings include source metric/evidence/threshold | ✅ unit-proven |
| 8 | Recovery actions persisted | ✅ code/build; ⛔ live DB blocked |
| 9 | Actions include owner/due/metric/target | ✅ persisted fields + unit-proven specs |
| 10 | Action status update | ✅ status machine + API |
| 11 | Verification compares before/after | ✅ unit-proven engine + service |
| 12 | Dashboard shows findings/actions/status/verification | ✅ UI + dashboard API |
| 13 | At least one repeated cycle | ✅ cycle linkage + two-cycle test |
| 14 | Prisma validates | ✅ |
| 15 | Build passes | ✅ |
| 16 | Core tests pass | ✅ 33/33 founder-recovery; 5446 suite |
| 17 | Missing DB/runtime explicitly reported | ✅ this report |
