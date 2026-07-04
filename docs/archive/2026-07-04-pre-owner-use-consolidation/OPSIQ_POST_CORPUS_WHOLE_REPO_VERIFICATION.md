# OpsIQ Post-Corpus Whole-Repo Verification

> Branch `claude/post-corpus-owner-pilot-prep`, base HEAD `756a816c`. Strongest practical suite run locally without
> weakening any gate. Local DB proofs run against a throwaway Postgres 16 on port 5433 (isolated; the container's
> exported Neon URL was overridden with `DATABASE_URL`/`DATABASE_URL_TEST`/`MIGRATION_DATABASE_URL`). Browser/mobile
> lanes require a sustained app server, which this harness terminates — they are CI-gated (proven green on each
> merged pack PR) and classified as expected-skipped locally.

## Result classes
1. **green** — ran locally, passed.
2. **expected skipped** — not runnable locally by design (needs sustained server); CI-gated + already green on merge.
3. **local environment artifact** — a local-only quirk, not a code defect.
4. **pre-existing unrelated** — red but not caused by this branch.
5. **branch-related blocker** — must fix before "ready".

## Checks
| # | Check | Command | Result | Class |
|---|---|---|---|---|
| 1 | prisma validate | `npx prisma validate` | schema valid (only a deprecation *warning* for `driverAdapters`) | green |
| 2 | tsc --noEmit | `npx tsc --noEmit` | exit 0, no errors | green |
| 3 | lint ratchet | `npm run lint:ratchet` | LINT_RATCHET_PASS (errors 2155=2155; warnings 1261≤1263; changed_files 0) | green |
| 4 | business-reality schema | vitest `business-reality-schema.test.ts` | pass | green |
| 5 | all pack schema/invariant (10) | vitest 10 `*-pack.test.ts` + corpus audit | **167 tests pass** (12 files) | green |
| 6 | all DB proofs (10) | vitest 10 `*-db.db.test.ts` (TEST_WITH_DB) | **31 tests pass** — unknown/staff/finance/weekly/growth/cvm/llb/crisis/sims (28) + daily-300 (3) | green |
| 7 | browser/mobile proof | Playwright specs 15–42 | not run locally (server not sustainable) | expected skipped (CI-gated, green on merge) |
| 8 | owner-pilot | vitest `owner-mode/pilot-readiness/*` (within owner-mode) | pass | green |
| 9 | AI supervisor | vitest `owner-mode/ai-supervisor/*` | pass | green |
| 10 | action-status policy | vitest `owner-mode/action-status-policy.test.ts` | pass | green |
| 11 | source / privacy | vitest `behavioral-validation/public-cases/source-register.test.ts` + corpus-audit privacy | pass (0 PII across 240 sources) | green |
| 12 | business-scope isolation | vitest chaos `chaos-db-isolation.db.test.ts` + per-pack cross-workspace isolation | pass | green |
| 13 | learning / adjudication | vitest `behavioral-validation/learning-*`, `expert/adjudication`, `max-reliability/*` | pass | green |
| 14 | max-reliability ratchet | vitest `behavioral-validation/max-reliability/*` | pass | green |
| 15 | chaos / exhaustive corpus | vitest `behavioral-validation/chaos-replay/*` (incl. `exhaustive-db.db.test.ts`) | pass | green |
| 16 | sequential simulations | vitest `business-simulation-pack.test.ts` + `business-simulation-db.db.test.ts` | pass (50 sims / 427 events DB) | green |

### Aggregate suite totals (local, this run)
- `src/__tests__/owner-mode`: **54 files / 484 tests pass** (covers checks 8, 9, 10 + shadow-pilot, gate-enforcement).
- `src/__tests__/behavioral-validation`: **66 files / 557 tests pass** (covers checks 11–15).
- Corpus invariants (non-DB): **12 files / 167 tests pass**.
- Corpus DB proofs: **10 files / 31 tests pass**.

## Environment notes
- `prisma validate` emits a deprecation **warning** (`driverAdapters` preview flag) — informational, not a failure;
  the schema is valid. Class: green (local environment note).
- Neon is the container default `DATABASE_URL`; all DB tests were pointed at the local throwaway Postgres (5433) via
  env override so no shared/remote DB was touched. Class: green (isolation preserved).

## Verdict
**No branch-related blocker.** Every locally-runnable check is green; the only non-run checks are the browser/mobile
lanes, which are CI-gated by design and were green on every merged pack PR. This branch adds only documentation
(no source/schema change), so it cannot regress any lane.
