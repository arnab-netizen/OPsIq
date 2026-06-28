# OPSIQ FINAL READINESS BLOCKER BURNDOWN

Branch `claude/full-repo-jarvis-db-blocker-closure`. Two blockers to green.

## B. GAP-E2E-01 — owner browser flow
- **Root cause (run 28338771459):** seed + archetype succeed; `next start` reaches "✓ Ready"; but the
  health gate used `curl -sf` (`-f` fails on any non-2xx). The login page returned a non-2xx (redirect/
  guard), so the gate never registered the app as up and the step exited **before Playwright ran**.
- **Fix:** connectivity-based health check (drop `-f`; accept any HTTP code as "up"). Then Playwright runs.
- **Status:** IN_PROGRESS — health-check fixed; re-running to reach the actual browser assertion.
- **Run IDs:** 28338712533 (early), 28338771459 (health-gate false-negative), `<new>`.

## A. GAP-CI-FLAKE-01 — full DB suite
- **Observed failure families (postgres logs):** `owner_financial_snapshots` duplicate key
  `(business_id, period_start, period_end)`; `snapshot_data_workspace_id_fkey` (insert for a missing
  workspace / delete of a referenced workspace); `canonical_events is append-only` DELETE attempts.
- **Note:** the OLDER main `5385d26` had a GREEN full DB suite (run 28308777696); the suite went red after
  the Jarvis merge — i.e. newly-added owner-mode/owner-budget `[db]` tests collide (shared business/period
  keys, missing-workspace inserts, append-only DELETE cleanup) when run in the combined suite. So this is a
  test-isolation regression to fix, not immutable pre-existing debt.
- **Plan:** speed up the diagnostic to target only DB-relevant test files (not all ~750), capture exact
  failing tests, then fix isolation (per-test randomUUID workspace/business/period; create workspace before
  snapshot; never deleteMany canonical_events).
- **Status:** IN_PROGRESS — fast diagnostic re-targeted.
- **Run IDs:** 28338607735 (slow JSON full-suite, incomplete), `<new fast diagnostic>`.

## Attempted fixes log
1. e2e health-check `-f` removal — pushed.
2. flake-diagnose retargeted to DB-relevant files with fast failure capture — pushed.
