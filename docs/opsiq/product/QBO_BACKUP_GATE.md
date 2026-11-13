# QBO backup gate (owner decision D2 = Option B) and Neon zero-history gate (D3)

Status: PR-only. Nothing here changes Production until the owner merges and executes it.

## Policy

While Production QuickBooks (QBO) is enabled, **no GitHub whole-Production-database dump may contain QuickBooks/Intuit User Data.** Excluding only `qbo_*` tables is not enough (derived values live in audit payloads, snapshots, diagnoses, decisions, budgets), so Option B forbids the whole-database dump instead.

## Enforcement (fail closed)

`scripts/backup-database.sh` (the only dump path used by `scheduled-backup.yml`) runs `scripts/backup-qbo-gate.sh` before `pg_dump`:

1. `PRODUCTION_QBO_ENABLED` (variable in the GitHub `Production` environment) must be unset or exactly `false`. Any other value blocks (`true`, `TRUE`, `1`, typos).
2. Independently, the database is probed. Any row in any `public.qbo_*` table blocks. A failed or non-numeric probe blocks. A missing `DATABASE_URL` blocks.
3. A blocked run exits non-zero before `pg_dump`; the artifact step is `if: success()`, so nothing is uploaded.

Operators do not need to remember to disable the workflow: the database probe blocks the dump even if the flag was never set. The flag exists so enablement is also an explicit, reviewable act (set `PRODUCTION_QBO_ENABLED=true` at the same time QBO is enabled).

Tests: `src/__tests__/ci-cd/backup-qbo-gate.test.ts` (18 cases; real scripts, fake `psql`/`pg_dump`).

Limits of this control: it protects the GitHub workflow dump path. It does not stop an operator running `pg_dump` by hand (operator-export attestation remains a deletion domain) and it does not cover Neon history or branches (below).

## Existing artifact inventory and cleanup procedure (NOT executed; needs separate authorization)

Inventory on 2026-10-26: 35 artifacts named `opsiq-production-backup-<run_id>`, created 2026-09-24 .. 2026-10-26, about 0.35-0.48 MB each, expiring 2026-10-29 .. 2026-11-30. Production holds no QBO customer data today, so none contains Production Intuit User Data. Failure-diagnostics artifacts (`opsiq-production-backup-FAILED-*`) also match the prefix and are included in the procedure.

Enablement gate, before the first Production QBO connection: `QBO_CONTAINING_GITHUB_ARTIFACTS=0`.

Procedure:

1. Confirm no QBO data existed at any dump time: `select count(*) from qbo_connections;` (and every `qbo_*` table) is 0 in Production, and no row in `qbo_connections` was ever created (check `audit_events` for QBO connect events). If any QBO connection ever existed, treat every artifact created after it as containing Intuit data.
2. Set `PRODUCTION_QBO_ENABLED=true` only after step 5 is complete.
3. List: `gh api 'repos/<owner>/OPsIq/actions/artifacts?per_page=100' --paginate -q '.artifacts[]|select(.name|startswith("opsiq-production-backup"))|"\(.id) \(.name) \(.created_at)"'`.
4. For each artifact created at or after the first moment QBO data could exist, delete it: `gh api -X DELETE repos/<owner>/OPsIq/actions/artifacts/<id>`. If Option B is adopted conservatively, delete all of them. Also cancel any in-flight `Scheduled Production Database Backup` run first (`gh run cancel <id>`) so a dump in progress cannot finish after the delete.
5. Re-list: the count of matching artifacts created after QBO data could exist must be 0. Record the listing. Also confirm `restore-rehearsal.yml` has no retained restored copy and no operator export exists (attestation).
6. Record the result as `QBO_CONTAINING_GITHUB_ARTIFACTS=0` in the enablement evidence.

## Neon zero-history enablement gate (D3)

Observed Production value: `history_retention_seconds = 21600` (6 h). Do not change until the owner authorizes.

Before the first Production QBO customer connection:

1. Record the current value: project settings API `history_retention_seconds` (expect 21600).
2. Confirm no Production snapshots and no non-default branches exist (project branches API and snapshots API). Delete `restore-proof-pre-beta-gate-disposable` first. Both lists must be clean, because each branch/snapshot is a separate deletion domain.
3. Set `history_retention_seconds = 0` (project settings API or console). Record the timestamp T.
4. Verify:
   - the project API reports 0;
   - creating a branch at a timestamp before T is refused (expected HTTP 400 "timestamp is before retention window");
   - no snapshot or branch holding QBO data exists (re-list).
5. Accept the consequence in writing: zero retention removes point-in-time recovery; disaster recovery for Production then rests on the application-level controls the owner chooses (no GitHub dump while QBO exists).

The erasure verifier (`--neon-inventory`) continues to treat each branch/snapshot as its own deletion domain; `GLOBAL_SECURE_DELETE` stays INCOMPLETE until every domain is attested clean.
