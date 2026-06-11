# Module 1 Owner Recovery Migration — Pre-Deploy Status Fix Report

Date: 2026-06-11
Branch: `main`
Commit before this change: `2b07b11` (PR #31 merge)

## 1. Root cause

The workflow step **"Migration status (before)"** ran `npx prisma migrate status`
with no exit-code wrapper. `prisma migrate status` **exits non-zero (code 1) when
there are pending (unapplied) migrations**. Because GitHub Actions `run:` steps use
`set -e`/fail-on-nonzero semantics, that non-zero exit **failed the job before the
`prisma migrate deploy` step could run**. The screenshot confirms: DB connected,
42 migrations found, 1 pending (`20260610120000_owner_recovery_mode`), then the
step exited 1 and deploy never executed.

## 2. Why the DB connection was successful

The failure was **not** a connectivity or auth problem. `prisma migrate status`
successfully connected to the target database (it read and reported the full
migration history — 42 migrations — and correctly identified the single pending
migration). The non-zero exit was Prisma's documented signal for "database is not
up to date," i.e. pending migrations exist — not a connection error. So the secret
(`MIGRATION_DATABASE_URL`) and network egress were working correctly.

## 3. Why a pending migration before deploy is expected

This job exists **specifically to apply** the pending Owner Recovery migration
(`20260610120000_owner_recovery_mode`). By definition, immediately before
`migrate deploy` runs, that migration is pending. So a "pending migration" /
non-zero `migrate status` **before** deploy is the normal, expected state — it must
not be treated as a failure. Only the **post-deploy** status should be strict
(database must be up to date after deploy).

## 4. Workflow file changed

`.github/workflows/module-1-owner-recovery-migrate.yml` — only the pre-deploy
status step. No other step touched.

## 5. Exact fix

Before:

```yaml
      - name: Migration status (before)
        run: npx prisma migrate status
```

After:

```yaml
      - name: Migration status (before, informational)
        run: |
          set +e
          npx prisma migrate status
          STATUS_CODE=$?
          set -e
          echo "Pre-deploy migrate status exit code: $STATUS_CODE"
          echo "Non-zero before deploy is expected when pending migrations exist."
          exit 0
```

The pre-deploy status is now **informational**: it still runs and prints the full
status plus the captured exit code, but it never fails the job, so the deploy step
proceeds. It does not suppress the *output* — it only stops a known-expected
non-zero exit from aborting the run.

## 6. Confirmation deploy step remains strict

Unchanged and strict — no `set +e`, no `|| true`, no `exit 0`:

```yaml
      - name: Apply migration (prisma migrate deploy)
        run: npx prisma migrate deploy
```

A real failure of `prisma migrate deploy` still fails the job. The deploy is not
skipped or masked.

## 7. Confirmation final (after) status step remains strict

Unchanged and strict:

```yaml
      - name: Migration status (after)
        run: npx prisma migrate status
```

After deploy, if the database is still not up to date, `migrate status` exits
non-zero and **fails the job** — the post-deploy verification is preserved at full
strength.

## 8. Commands run and results

| Command | Result |
|---|---|
| YAML parse (`yaml.safe_load`) | YAML OK |
| `git diff --check` | clean (exit 0) |
| `git diff --stat` | 1 file, +14 / −2 (workflow only) |
| `npx prisma validate` | valid 🚀 |
| `npm run build` | Compiled successfully |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` | 193 files passed, 15 skipped, **0 failed**; 5473 tests passed |

No real migration was run; no DB connection from this environment.

## 9. No secrets printed or committed

Confirmed — the change adds only shell exit-code handling and echo lines; no URLs,
credentials, or secret values. The workflow still references
`${{ secrets.MIGRATION_DATABASE_URL }}` only. Staged-diff secret scan performed.

## 10. No `.env*` files modified

Confirmed.

## 11. No migration run manually

Confirmed — no `prisma migrate deploy` / `reset` / `db push` run locally or against
any real database. The fix only changes how the workflow's pre-deploy status step
treats its exit code.

## 12. Module 2 remains blocked

Confirmed — no Module 2 work.

## 13. Public/SaaS remains frozen

Confirmed — no public/SaaS/billing/marketing files touched.
