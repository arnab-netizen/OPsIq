# Phase 5D — Quarantine inventory (Wave 1)

**Date:** 2026-07-09
**Branch:** `claude/phase-5d-quarantine-reduction-wave-1`
**Base:** main @ `f953b32` (Phase 5B, verified GREEN)

There are **two independent quarantine mechanisms** in the repo:

| mechanism | count (start) | how it runs | reactivate by |
|-----------|---------------|-------------|---------------|
| `.claude/test-quarantine.json` | 21 files / 50 failing tests | **visible, non-blocking** lane in `ci.yml` (runs, never blocks) | fix the underlying failure, remove the entry |
| `src/__ignored_tests__/**` | **88 files** | **fully excluded** from vitest (`vitest.config.ts` `exclude: **/__ignored_tests__/**`) and from tsc (`tsconfig.json` `exclude`) | move the file into a normal `src/**` path (non-`*.integration.test.ts`, non-`*.placeholder.test.ts`) |

Wave 1 targets the **`__ignored_tests__`** backlog (the truly-dark tests). The 21 `test-quarantine.json`
files already run visibly and are tracked under `FULL_SUITE_TEST_DEBT_RECOVERY`; they are a separate,
later track (see §3).

---

## 1. `src/__ignored_tests__` backlog — 88 files by type

| type | count | required-lane eligible? | notes |
|------|-------|-------------------------|-------|
| unit/service (`*.test.ts`, not integration) | 67 | **yes** (if non-`[db]` or `[db]` in DB lane) | best Wave source |
| integration (`*.integration.test.ts`) | 12 | no — excluded by `**/*.integration.test.ts` even after move | need rename + heavier fixtures → later waves |
| UI (`*.test.tsx`) | 6 | browser/jsdom | later wave (UI) |
| placeholder (`*.placeholder.test.ts`) | 1 | no — excluded by `**/*.placeholder.test.ts` | intentional stub |
| (2 of the 67 are helpers: `__tests__/test-fixtures.ts`, `app/api/__tests__/test-utils.ts`, not tests) | | | |

### Reactivation gotchas discovered (apply to every wave)
- **tsc scope depends on target dir.** `tsconfig.json` excludes `**/__tests__/**` and `**/__ignored_tests__/**`.
  A file moved into a `__tests__/` dir stays tsc-excluded; a file moved elsewhere (e.g. `src/lib/`) becomes
  tsc-checked and may expose latent type errors that were dark while ignored.
- **eslint scans everything** (no `__ignored_tests__` ignore) — so moving a file does not change global lint
  counts, but the `lint:ratchet` **changed-file gate fails on any lint _error_ in a moved file**. Reactivation
  must leave each moved file error-clean.
- Stale API references are common (see rejected candidates §4).

## 2. Selection-priority scan (owner-facing reliability / auth / isolation, non-DB, required-lane safe)

Probed candidates against **current source** (copied to correct target paths, run with vitest; no commits):

| candidate | tests | result vs current source | verdict |
|-----------|-------|---------------------------|---------|
| `lib/auth-guard.test.ts` | 18 | **all pass** (no DB) | **REACTIVATE_NOW (Wave 1)** |
| `app/api/__tests__/rbac-enforcement.test.ts` | 34 | **all pass** (no DB) | **REACTIVATE_NOW (Wave 1)** |
| `workspace-isolation-enforcement.test.ts` | 23 | **4 fail** — static scanner flags current patterns in `entitlement.ts`, `execution-auditor.ts`, `diagnosis/route.ts` | OBSOLETE_BUT_NEEDS_PROOF — needs source review or contract update; too broad for Wave 1 |
| `services/__tests__/service-auth.test.ts` | ~13 | stale — builds `AuthContext{session,policy}` but `requireServiceAuth` now reads `verifiedActorId` (`CanonicalAuthContext`); half are `expect(true).toBe(true)` doc stubs | REWRITE_AS_CURRENT_CONTRACT — low value, defer |

## 3. `.claude/test-quarantine.json` — 21 files (separate track, NOT this wave)

Already run in the visible non-blocking lane; grouped by cluster with documented reasons:

| cluster | files | reason (from manifest) | recommended action |
|---------|-------|------------------------|--------------------|
| http-runtime-proof | rp2-hostile-http, rp3-operational-survivability | expect a running HTTP server not present in unit harness | REACTIVATE_LATER (needs server harness) |
| event-persistence | rp1-phase3-persistence, phase-3-event-emitter-integration | `EventEmitterService.getAggregateEvents` not present (stale API or defect) | OBSOLETE_BUT_NEEDS_PROOF |
| error-sanitization-expectation | phase-i10-error-normalization, phase-i-runtime-discipline, phase-i10-queue-enforcement | assert raw technical detail; governance now returns sanitized operator messages | REWRITE_AS_CURRENT_CONTRACT |
| fraud-threshold | p2b/path-convergence | fraud-risk threshold mismatch | OBSOLETE_BUT_NEEDS_PROOF |
| db-contract | demo-engagement-proof-backfill, demo-permission-proof-backfill, signup-schema-contract, first-value | DB contract / mock-setup | REACTIVATE_LATER (DB lane) |
| security-auth | diagnostic-key-validation, ops-endpoints-auth | test-collection/env | REACTIVATE_LATER |
| test-defect / test-mock | p2a-production-path, critical-readiness | test defect / mock | REWRITE_AS_CURRENT_CONTRACT |
| workflow-assertion | ci-cd/workflow-validation | stale workflow expectation | REWRITE_AS_CURRENT_CONTRACT |
| concurrency-flake | phase-3-serialization-hardening, phase-3-concurrency-proofs, e2-replay-determinism-proof | non-deterministic | KEEP_QUARANTINED_WITH_REASON (flaky) |
| legal-governance-heuristic | diagnosis-legal-governance-textual | heuristic conflict | KEEP_QUARANTINED_WITH_REASON |

## 4. Wave 1 selection (this PR)

**Cluster: owner-facing auth / RBAC authorization guardrails** — the smallest meaningful cluster matching
selection priorities #2 (auth/workspace) and #4 (reduce auth/isolation risk), non-DB, required-lane safe,
non-trivial (52 real assertions), and **passing unmodified against current source** (proving over-quarantine).

| # | path (from → to) | domain | type | why quarantined (inferred) | current relevance | deps | risk if left | overlaps proven? | dup? | stale? | action | wave |
|---|------------------|--------|------|----------------------------|-------------------|------|--------------|------------------|------|--------|--------|------|
| 1 | `src/__ignored_tests__/lib/auth-guard.test.ts` → `src/lib/auth-guard.test.ts` | auth | unit | bulk-ignored with the `__ignored_tests__` sweep; latent type-import error (`PolicyContext` import source) hid it from a required lane | **high** — guards `withAuth`, capability checks, actor hierarchy on every owner route | none (mocks `@/services/auth`) | authorization regressions land silently | complements Phase 5C `getPolicyContext` work | no | import-only | **REACTIVATE_NOW** | 1 |
| 2 | `src/__ignored_tests__/app/api/__tests__/rbac-enforcement.test.ts` → `src/app/api/__tests__/rbac-enforcement.test.ts` | rbac | api-unit | bulk-ignored; used a non-existent `ROLES.CONSULTANT` | **high** — role→capability mapping + deny-by-default for engagement/finding/recommendation/action | none | RBAC drift lands silently | complements Phase 5C | no | one stale role const | **REACTIVATE_NOW** | 1 |

**Proposed later waves:** Wave 2 — non-DB service unit tests (`services/**/__tests__/*.test.ts` that pass);
Wave 3 — `[db]`-tagged unit/service tests into the DB lane; Wave 4 — UI (`*.test.tsx`); Wave 5 — integration
suites (rename + fixtures); parallel track — `.claude/test-quarantine.json` debt recovery.
