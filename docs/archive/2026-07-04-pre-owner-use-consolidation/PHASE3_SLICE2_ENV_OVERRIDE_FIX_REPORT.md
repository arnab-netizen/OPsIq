# Phase 3 Slice 2 — CI Env Override Fix Report

Date: 2026-06-11
Branch: `claude/vibrant-ramanujan-mdqej8`
PR: #31 (head was `6aaa615` before this change)

## 1. Root cause

The check **"Phase 3 Slice 2 Gates"** (workflow
`.github/workflows/phase-3-slice-2-truth-pass.yml`, job name `Phase 3 Slice 2 Gates`)
failed at **Gate 2: `npx prisma migrate deploy`** with:

```
Datasource "db": PostgreSQL database "REPLACE_DB", schema "public" at "REPLACE_POOLED_HOST"
Error: P1001: Can't reach database server at `REPLACE_POOLED_HOST:5432`
```

The workflow sets a real CI database via the job `env:`
(`DATABASE_URL: postgresql://test:test@localhost:5432/opsiq_test`, backed by a
`postgres:16-alpine` service). But `prisma.config.ts` runs
`config({ path: '.env.local', override: true })`, and the repository ships a
committed `.env.local` whose `DATABASE_URL` is a **placeholder**
(`REPLACE_POOLED_HOST/REPLACE_DB`). With `override: true`, that placeholder
**overrides** the CI-provided `DATABASE_URL`, so `prisma migrate deploy` tried to
connect to the unreachable placeholder host → `P1001`.

## 2. Why it was pre-existing but still PR-blocking

The committed `.env.local` placeholder and the `override: true` load in
`prisma.config.ts` both exist on `main` (verified at `466ae9e`). So this gate
fails identically on `main`, independent of PR #31 — it is **pre-existing infra
breakage**, not a regression from this branch. It nonetheless appears as a failing
check on PR #31, preventing the PR from being fully green. Other workflows that run
Prisma migrations already avoid this by deleting local `.env*` files first
(`migrate-staging.yml`, `module-1-owner-recovery-migrate.yml`); the Phase 3 Slice 2
workflow simply lacked that step.

## 3. Workflow file changed

`.github/workflows/phase-3-slice-2-truth-pass.yml` (only this file; one added step).

## 4. Exact fix

Inserted a step immediately after "Wait for PostgreSQL" and before the Prisma gates:

```yaml
      - name: Remove local env files (prevent placeholder override of CI database env)
        run: |
          rm -f .env .env.local .env.local.bak .env.development.local .env.test.local .env.production.local
          echo "Removed local .env override files; CI-provided DATABASE_URL is authoritative"
```

With the placeholder `.env.local` removed on the runner, `prisma.config.ts` no
longer overrides the CI `DATABASE_URL`, so `prisma validate`, `prisma migrate
deploy`, and the remaining gates use the real CI postgres service.

## 5. Why it is safe

- Deletes **local files only** on the ephemeral CI runner checkout; it does not
  modify the repository's `.env*` files in git and does not touch CI env vars or
  secrets (those are process-level `env:`/secrets, not files).
- Prints no secret values (only a static confirmation line).
- Matches the established, already-merged pattern in `migrate-staging.yml` and
  `module-1-owner-recovery-migrate.yml`.
- Does not change the Prisma schema, product code, tests, migration SQL, or any
  `.env*` file. The Phase 3 gate logic is unchanged and not weakened or skipped.
- `.env.test` is intentionally NOT removed (Gate 6 unit tests may read it; and it
  is loaded by vitest without `override`, so it never shadows the CI env). Only the
  `override`-loaded `.env.local` and the other local-override files are removed.
- The manual Module 1 migration workflow is untouched (its existing behavior is
  preserved).

## 6. Commands run and results

| Command | Result |
|---|---|
| YAML parse (`yaml.safe_load`) | YAML OK |
| `git diff --check` | clean (exit 0) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 errors) |
| `npx prisma validate` | valid 🚀 |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed, 8 skipped |
| `npm test` | 193 files passed, 15 skipped, 0 failed; 5473 tests passed |
| `npm run build` | Compiled successfully |

No real migration was run; no DB connection was made from this environment.

## 7. No secrets printed or committed

Confirmed — the workflow change references no URLs/credentials and prints none; the
added `echo` is a static message. Staged-diff secret scan performed before commit.

## 8. No `.env*` files modified

Confirmed — no `.env`, `.env.local`, `.env.test`, etc. files were edited or staged.
The fix removes local env files only at CI runtime via the workflow step.

## 9. No migration run manually

Confirmed — no `prisma migrate deploy`/`reset`/`db push` was executed locally or
against any real database.

## 10. Owner Recovery Module 1 unaffected

Confirmed — no Module 1 code, schema, migration SQL, routes, services, or tests
changed; founder-recovery suite green; build green.

## 11. Module 2 remains blocked

Confirmed — no Module 2 work; the gate is unchanged.

## 12. Public/SaaS remains frozen

Confirmed — no public/SaaS/billing/marketing files touched.
