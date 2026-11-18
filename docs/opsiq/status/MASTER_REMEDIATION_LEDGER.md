# OpsIQ Master Remediation Ledger

Created 2026-11-18 on branch `claude/fervent-sagan-282hv6`. Statuses: VERIFIED_COMPLETE, IMPLEMENTED_NOT_VERIFIED,
PARTIALLY_COMPLETE, BLOCKED_EXTERNAL, BLOCKED_AUTHORIZATION, FAILED, NOT_STARTED, NOT_APPLICABLE.
Historical reports are leads, not facts. Every row below was observed on 2026-11-18 unless marked otherwise.

## Baseline (observed)

| Item | Value | Source |
|---|---|---|
| main SHA | `2d2d57b5e5f0914ead92232634b9077f9838a010` (PR #681) | `git fetch`, local HEAD equals origin/main |
| Last READY production deploy | `dpl_FoU8kC4FtsDjASA8zNd2fxA9EX9X` = `37370e28` (PR #675) | Vercel `list_deployments` |
| Production deploys since | 6 consecutive `ERROR`: #678 `857826e0`, #679 `09198d97`, #680 `8a1786b7`, #673 `9d848aaf` (x2, incl. `dpl_EKvCFjPwa4XroZWLZCR3aoEDBU34`), #681 `2d2d57b5` (`dpl_DGatR1E5eF6j8YYxuZUbAMFGnVxv`) | Vercel |
| Open PRs | 20 (#653/#650/#638/#636 drafts; #631 and ~14 dependabot PRs) | GitHub |
| Latest main workflow run | `44257904842` "Google Search Console - Scheduled Ingestion": `failure` at `2d2d57b` | GitHub Actions |
| Neon projects | 10. Production is likely `OPSIQ NEW` (`patient-lake-61323111`), the only project with `active_time` > 0 (67,867 s) | Neon |

## P0-A Production deployment and runtime-role grants

Root cause (confirmed from Vercel build log for `dpl_DGatR1E5eF6j8YYxuZUbAMFGnVxv`):
`npm run build` runs `scripts/release/production-migration-gate.mjs`. It passes `MIGRATIONS_CURRENT`, then fails with
`BLOCKED: the runtime role cannot read 1 application table(s): search_console_metrics`.
A migration (#678) added `search_console_metrics`, and `opsiq_app` was never granted access. The gate is working as designed.
Every deploy after #678 inherits the same missing grant, so #679, #680, #673 and #681 all fail the same way.
This is a single root-cause class: 1 table, 6 failed deployments.

Required fix: run the governed `Reconcile Runtime Role` workflow (`.github/workflows/reconcile-runtime-role.yml`, added by #681):
DISCOVER, then DRY_RUN, then APPLY with the exact confirm phrase, then redeploy main.

Status: BLOCKED_AUTHORIZATION. Attempted `workflow_dispatch` (mode DISCOVER, `expected_main_sha=2d2d57b5...`) failed with
`403 Resource not accessible by integration`. This session's GitHub integration lacks `actions: write`, so it can't dispatch
the workflow. The workflow also runs in the `production-operator` environment, which may require a reviewer. That is a
second manual dependency, not yet verifiable without repo-settings access.
The gate was not bypassed.

Unconfirmed prerequisite: the exact production DIRECT host to pass as `expected_database_host`. The Neon project's
read-write endpoints are `ep-empty-sky-ay1e6c27` (default branch, active now) and `ep-rough-tooth-ayo6ye8l` (second branch
from 2026-09-01). The Vercel `DATABASE_URL` host is the authority; I did not read it because decrypting env values was not requested.

## Manual-dependency inventory (initial; incomplete)

| Dependency | Evidence | Proposed automated replacement | Status |
|---|---|---|---|
| Reconcile workflow is dispatch-only | workflow header | Run reconcile automatically (a gated job) after `migrate-production` when the grant diff is non-empty | NOT_STARTED |
| `production-operator` environment approval | workflow `environment:` | Replace with automated exact-SHA and CI-green gates, only if the repo settings allow | NOT_STARTED (settings not readable here) |
| Agent GitHub integration lacks `actions:write` | 403 above | Grant `actions:write` to the integration or GitHub App | BLOCKED_AUTHORIZATION |
| Claude Code allowlist (`.claude/settings.json`) | file | Add read-only `gh`/CI-inspection and scoped entries | NOT_STARTED |
| Dependabot PR backlog (#456-#469, #631) | PR list | Auto-merge only after required checks pass | NOT_STARTED |

## Other requirement areas

Every area below is NOT_STARTED in this session unless noted.

- Neon: NOT_STARTED beyond inventory. Nine non-production projects, several stale. Do not delete without dependency checks.
- Backups and R2: NOT_STARTED. Restore rehearsal is unproven.
- Full-suite regression (1,909 files / 40,974 tests): not re-run in this session.
- GSC ingestion: failing. The `44257904842` failure is probably the same missing grant, but it is unverified.
- QuickBooks (PR #636 is still draft), analytics, acquisition, Paddle, Product Hunt launch (2026-11-20): NOT_STARTED.

## Next executable task

1. Obtain `actions:write` for the integration, or have the owner dispatch DISCOVER then DRY_RUN then APPLY for `expected_main_sha`.
2. Redeploy main and verify the production SHA.
3. Read the failure log of GSC run `44257904842` to confirm the shared root cause.
4. Add a CI check that fails when a migration adds a table without a matching grant, so this cannot recur unnoticed.
