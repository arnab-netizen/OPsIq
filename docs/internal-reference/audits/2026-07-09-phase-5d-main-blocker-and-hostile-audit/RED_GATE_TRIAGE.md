# Phase 5D — main RED-gate triage (report-only)

**Date:** 2026-07-09
**Main HEAD:** `5badd9b` (Phase 5D Wave 1, PR #206 merged)
**Why this report exists:** Wave 1's main-push CI shows two red checks. Per the multi-wave rules, a required
red gate blocks the next wave, so both reds are triaged here before any further implementation. **No product
code changed. No PR merged. Read-only classification.**

## Red #1 — `CI - Build & Test #3001` (main push) → **FLAKY maintained suite** (NOT a regression)

**Evidence (decisive):** the *identical commit* `5badd9b` produced opposite results on the same workflow:
| run | context | result | duration |
|-----|---------|--------|----------|
| `CI - Build & Test #3000` | PR #206 (pull_request) | ✅ success | 30m 57s |
| `CI - Build & Test #3001` | main (push) | ❌ failure | 29m 20s |

Same tree, full maintained suite both times, opposite outcome ⇒ **nondeterministic (flaky) test** in the
blocking lane. The failing step was "Run maintained test suite (blocking; quarantine excluded)"; every prior
step (governance, tsc, prisma validate/migrate/generate, build, wrapped-handlers) passed. The 3 known
concurrency-flake files (`phase-3-serialization-hardening`, `phase-3-concurrency-proofs`,
`e2-replay-determinism-proof`) are already quarantined/excluded, so this is a *different* nondeterministic
test still in the blocking lane.

**CI Postgres logs** for #3001 showed only expected negative-path errors (drift-simulation tests dropping
`workspace_memberships.primary_auth_method`, append-only `canonical_events` delete attempts, idempotency
dup-keys, snapshot FK cleanup ordering) — no product stack traces.

**Candidate flake locus (unconfirmed):** a local full-suite reproduction on this environment saw the local
Postgres become **unreachable mid-run** (`Can't reach database server at 127.0.0.1:5433`, `totalFailed`
100→600) during the `flood-protection-audit-isolation` audit-flood test
(`src/infra/flood-protection-audit-isolation.ts` `AuditPersistenceQueue.persistBatch`). That points at
**DB-connection exhaustion / timeout under audit-flood load** as a plausible flaky class, but the local repro
was itself contaminated by the local DB dropping, so this is a lead, not a proof.

**Classification: NON-DETERMINISTIC FLAKE on a required gate.** Not caused by Wave 1 (test-only reactivation
of 2 non-DB unit files). The clean remedy is a re-run of `CI - Build & Test #3001` (owner/account can
"Re-run failed jobs"; the automation integration gets HTTP 403 on `rerun-failed-jobs`) or the next legitimate
main push. Do **not** weaken/skip/quarantine to go green.

## Red #2 — `Smoke - Production Dashboard #562` → **known production schema drift** (BLOCKED, not a product failure)

Red on **every** recent main commit: #562(`5badd9b`), #561(`f953b32`), #560(`f92aaec`), #559(`4ae217d`),
#558(`ff131191`). Log excerpt (run 29011765212):
```
1️⃣ POST /api/auth/login → 200 ✓ session established
2️⃣ GET / (dashboard page) → 200 ✓
2️⃣·5️⃣ GET /api/internal/demo-permission-proof → 500
🟠 SCHEMA_DRIFT — deployed database is behind on a migration (BLOCKED, not a product failure)
   Missing column: workspace_memberships.designation
   Introduced by migration: 20260625120000_owner_mode_execution_tables
   Smoke result: BLOCKED_SCHEMA_DRIFT   (exit code 2)
```
This is exactly the honest classifier Phase 4 built. It is the production-migration residual, is **non-required**
(merges succeed), and is **blocked on the owner approval phrase** "I approve running the production migration."
(not received). It is **not** a product regression and **not** one of the hostile-audit findings — the smoke
stops at the drift before reaching findings/KPI endpoints.

## Net
- No Wave-1 regression. Both reds are pre-existing/transient: a blocking-lane **flake** (needs a re-run) and the
  **owner-migration-gated drift** (needs the approval phrase).
- Wave 2 remains **on hold** until main's required `build-and-test` is green (re-run required).
- Safety intact: no production migration, no production DB touched, no secrets, no test weakened/skipped.
