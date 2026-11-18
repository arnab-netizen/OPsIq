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

## Update 2026-11-18 (session 2)

Observed, not assumed:

- main is still `2d2d57b5e5f0914ead92232634b9077f9838a010`. Production is still not serving it: the latest production deploy is `dpl_DGatR1E5eF6j8YYxuZUbAMFGnVxv` (`ERROR`), and the last `READY` is still `dpl_FoU8kC4FtsDjASA8zNd2fxA9EX9X` (`37370e28`).
- **403 identity.** Both the GitHub MCP and the `gh` CLI return `Resource not accessible by integration` on `POST .../workflows/reconcile-runtime-role.yml/dispatches`.
  That wording is GitHub's response to a GitHub App installation token that lacks the `actions: write` permission.
  - It is not Claude Code tool approval: the call is issued and answered by GitHub.
  - It is not branch protection or environment approval: those apply after a run exists.
  - The same identity can read the repo (`admin: true`) and push to the feature branch, so authentication and `contents` write are fine.
  - `gh`'s `GH_TOKEN` is reported invalid by `gh auth status` (a proxy-managed placeholder), and the sandbox proxy blocks other API paths, e.g. `/environments`, so I couldn't read environment protection rules.
- **Search Console ingestion (run `44257904842`) is a different root cause.** The failing step is "Preflight check - required secrets/config exist": `DATABASE_URL is missing or empty`.
  - The GitHub secret for the GSC ingestion DB URL is unset or empty.
  - The `WORKLOAD_IDENTITY_PROVIDER` and `SERVICE_ACCOUNT` values are present.
  - This is `BLOCKED_AUTHORIZATION`: the secret needs a value, and the `opsiq_gsc_ingestion` role credential must come from the owner's secure path. I have not read or printed any credential.
  - Fixing the grant alone will not fix GSC ingestion.
- **Production DB identity** is still unconfirmed. The workflow's exact-host gate is the correct place to confirm it, and it needs dispatch access.

Implemented (verified locally on a disposable PostgreSQL 16, not on production):

1. Test: `src/__tests__/privacy-erasure/runtime-role.db.test.ts` has a new test, "ORIGINAL DEFECT (search_console_metrics)".
   - On the real migration chain (`prisma migrate deploy`, 262 public tables) it revokes the runtime grants on `search_console_metrics`.
   - It asserts the runtime gets `permission denied`, the verifier returns `FAIL` with `grant_gap_tables == ["search_console_metrics"]` (exactly that table), one reconcile repairs it, and a second apply changes no ACL.
   - It also asserts the runtime still has no DDL and no access to `privacy_erasure_requests`.
   - Result: `vitest run runtime-role.db.test.ts`, 20/20 pass.
   - This test runs in the existing CI job "Runtime least-privilege role DB proof".
2. Structural fix: `.github/workflows/migrate-production.yml` (MAIN mode) now runs a blocking "Reconcile runtime role grants" step after post-migration verification.
   - It uses the same reviewed tool, the same exact-host pin and the same `OPERATOR_DATABASE_URL` secret. It does not create roles or set passwords.
   - It fails the job on a non-PASS apply, unparseable verification, or a remaining grant gap.
   - The Vercel redeploy hook now requires `RUNTIME_ROLE_RECONCILED=true`.
   - Test: `src/__tests__/deployment/migrate-workflow-runtime-role-sequencing.test.ts`, 4/4 pass.
   - Regression: `vitest run src/__tests__/deployment src/__tests__/governance/{test-db-isolation-workflows,prisma-mutation-governance}.test.ts` gives 29 files passed, 713 tests passed, 5 skipped.
   - `tsc --noEmit` is clean.
3. NOT verified: the workflow change has never executed. It touches CI security and production credentials, so it needs independent review and the CODEOWNER path before merge. It has not been merged or deployed.

Single owner action that unblocks production, with the exact request:

- Which identity: the Claude GitHub App installation on `arnab-netizen/OPsIq`.
- Permission: Repository permissions, Actions, set to Read and write.
- Where: https://github.com/settings/installations, then Claude, Configure, Permissions, accept the update request.
- After that, the integration can dispatch, rerun and read workflows without further owner steps, and can enable auto-merge on pull requests.
- Still not removed: the `production-operator` environment may require reviewers. That setting is not readable through this proxy (HTTP 403).
  Settings, Environments, `production-operator`: check the required reviewers.
  If it only asks for the owner, replace it with a branch-restriction (main only) so the exact-SHA, host-pin and confirm-phrase gates carry the control.

Not started this session: Neon consumption audit and dependency tracing for the nine inactive projects, backups and restore rehearsal, the full-suite regression run, the open-PR triage, the P1 user-journey and UX audits, QuickBooks, analytics, acquisition and payments. Next: read the production DB identity from Vercel metadata and the Neon branch list, then triage the PR backlog.
