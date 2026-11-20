# Production batch migration runbook (MAIN_BATCH)

Status: implemented as a mode of `.github/workflows/migrate-production.yml`. Owner-approved production runs only.

## Why this exists

`MAIN` mode requires `migration_name` to be the SOLE pending migration (`scripts/classify-migrate-status.mjs`, verdict
`PENDING_EXPECTED`). When production is several migrations behind main it always refuses (`MULTIPLE_PENDING`). Applying the
migrations one at a time is not possible either, because the first dispatch would leave the other pending ones in place.
`MAIN_BATCH` applies an ORDERED BATCH of migrations already committed to main, authorized by a version-controlled,
PR-reviewed manifest, through the same single `prisma migrate deploy` step. MAIN's gate is untouched and still refuses
multiple pending migrations; MAIN_BATCH does not reuse it, it replaces it (for that mode only) with the stricter proof below.

Why a mode of the existing workflow and not a second workflow file: exactly one workflow may mutate production, and
`production-secret-isolation`, `prisma-mutation-governance` and `test-db-isolation-workflows` pin that set. A second file would
widen those allow-lists. A mode adds no new production-writing workflow, no new secret and no new environment.

## The batch authorized today

Manifest: `.claude/production-migration-batches/2026-11-20-quota-reservations-and-stripe-ordering.json`

| # | Migration | Effect (additive only) |
|---|-----------|------------------------|
| 1 | `20261119120000_usage_event_quota_reservations` | 2 nullable columns + 3 indexes on `usage_events` |
| 2 | `20261119130000_subscription_last_event_id` | 1 nullable column on `subscriptions` |
| 3 | `20261119140000_subscription_stripe_subscription_created_at` | 1 nullable column on `subscriptions` |

Pre-batch ledger anchor: 190 finished rows (everything up to and including `20261117120000_add_search_console_metrics`), sha256
`52f51a8cbf0ebf7e5c9ce3c266743c11e0724e09f2732eb55639d8dcbd8de68d` over the ordered `name|checksum` lines. The same lines have
md5 `1c94093789d0735a0c0488e78cd0e418`, the value read from production's `_prisma_migrations` on 2026-11-20.

## Exact dispatch (Actions > Migrate Production Database > Run workflow, from `main`)

| Input | Value |
|-------|-------|
| `environment` | `production` |
| `mode` | `MAIN_BATCH` |
| `confirm` | `MIGRATE PRODUCTION BATCH` |
| `batch_id` | `2026-11-20-quota-reservations-and-stripe-ordering` |
| `expected_main_sha` | the 40-character SHA of the main commit you reviewed (the job refuses any other HEAD) |
| `expected_database_host` | the owner-pinned direct (non-pooler) production host, bare hostname only |
| `migration_name`, `source_pr`, `source_sha`, `migration_sha256` | leave EMPTY (rejected if set: the manifest defines the migrations) |

Then approve the `production-operator` environment gate. That is the one human approval.

## What each gate proves (all before the first mutation unless noted; any failure stops the job)

| Gate | Proves |
|------|--------|
| Origin guard (first step) | trigger, ref and workflow definition are all `main` |
| Validate MAIN_BATCH inputs | `batch_id` and `expected_main_sha` are well formed; no single-migration input is mixed in |
| Confirm phrase | `MIGRATE PRODUCTION BATCH` exactly (MAIN's and PINNED_PREDEPLOY's phrases do not satisfy it) |
| SHA gates | checked-out HEAD equals the dispatch SHA, is an ancestor of main, and equals `expected_main_sha` |
| Exact-host gate (unchanged, every mode) | the secret's host equals `expected_database_host` |
| Preflight (`migration-batch.mjs preflight`) | manifest is valid, in main, at most 10 migrations; each `migration.sql` sha256 equals the manifest; each passes the additive-only scan; the objects the SQL creates equal the manifest's `creates`; the ledger has no unfinished (P3009) row; the pending set (main folders absent from the ledger) is exactly the manifest, in order, or an unapplied suffix of it (resume); an applied prefix is finished and checksum-equal; the non-batch ledger rows equal the anchor (count and hash); no object the pending migrations will create already exists |
| Read-only guarantee | `PGOPTIONS=-c default_transaction_read_only=on` plus `BEGIN READ ONLY`; the script refuses a session that is not read-only; every statement is fixed text with bound parameters |
| Recovery point | UTC time, `pg_current_wal_lsn()`, `current_database()` the ledger anchor and an informational activity snapshot (row estimates, long-open transaction count) are written to the job summary and uploaded as the `batch-recovery-point` artifact BEFORE the deploy |
| `prisma migrate status` cross-check | Prisma's own pending list equals the expected pending set |
| Deploy | the one `prisma migrate deploy` step, unchanged |
| Post-batch verification (blocking) | ledger equals pre-batch anchor plus the batch exactly (all finished, checksums equal the manifest); every expected table/column/index/type/constraint exists with the declared nullability/uniqueness |
| `prisma migrate status` (unchanged) | up to date |
| Runtime-role reconcile gate and redeploy hook (unchanged, run for MAIN and MAIN_BATCH) | `opsiq_app` conforms to the schema; the release is promoted only after it passes |

## Static additive-only scan

`scripts/release/migration-additive-scan.mjs`. `CREATE TABLE` is strictly structural: exactly `CREATE TABLE <name> ( <columns and table constraints> )` with
nothing after the closing parenthesis, so `AS`/`VALUES`/`SELECT`, `PARTITION`, `INHERITS`, `LIKE`, `WITH`, `TABLESPACE`, `USING`, `ON COMMIT`,
`UNLOGGED`/`TEMP` and `IF NOT EXISTS` are refused (a table made by `IF NOT EXISTS` must not count as created in the file); columns take only an
allow-listed type and `NOT NULL`/`NULL`/literal `DEFAULT`; constraints are only `PRIMARY KEY`/`UNIQUE` column lists, `FOREIGN KEY ... REFERENCES`, call-free
`CHECK`. Column types (here and in `ADD COLUMN`) must be on an allow-list: text, varchar/char(n), integer/bigint/smallint (and int2/4/8), boolean, uuid,
timestamp/timestamptz/date/time [(p)] [with/without time zone], json/jsonb, numeric/decimal [(p[,s])], double precision/real/float4/float8, bytea, and a
quoted user enum `"Name"` / `"public"."Name"`, each with an optional `[]`; the serial family is refused (it creates a sequence and a volatile default,
invisible to the manifest). `citext` is not on the list (no migration uses it). Informational: the scan passes 91 of the 193 historical migration folders (it is
not meant to accept history). Allowed: `CREATE TABLE`, `CREATE [UNIQUE] INDEX` (never `CONCURRENTLY`; an index
`WHERE` may contain no function call), `CREATE TYPE ... AS ENUM`, `ALTER TABLE ... ADD COLUMN <type> [NOT NULL | NULL | DEFAULT <literal>]`
(a `NOT NULL` column needs a `DEFAULT`; no inline `REFERENCES`/`CHECK`/`UNIQUE`/`PRIMARY KEY`/`GENERATED`), and
`ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY | CHECK` (which must be `NOT VALID` on a table that already exists; no function call in a `CHECK`).
A `DEFAULT` may only be a number, a quoted string (optionally cast), `TRUE`/`FALSE`/`NULL`, `CURRENT_TIMESTAMP` or `CURRENT_DATE`. Unique and
primary-key constraints and `EXCLUDE` are refused: use `CREATE UNIQUE INDEX`. Everything else is rejected: `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`,
`INSERT`, `RENAME`, `ALTER COLUMN`, `GRANT`/`REVOKE`, `DO` blocks, functions, triggers, views, extensions, `COPY`, `GENERATED`, transaction control.

The lexer is deliberately STRICTER than PostgreSQL's so the two cannot disagree about where a comment, string or statement ends (review F1,
reproduced against real PostgreSQL: a bare carriage return ends a `--` comment, and a non-ASCII or very long dollar-quote tag is a valid quote).
It refuses: any control character other than tab and newline; a carriage return not followed by a line feed (CRLF files are fine); NUL;
any `$` that is not a plain positional parameter (no dollar-quote form of any tag length or alphabet); any backslash outside a comment; `E'...'`
and `U&` forms; any non-ASCII character outside a comment, string literal or quoted identifier; an unterminated comment/string/identifier;
a statement matching no allow-list pattern; a file with no statement. Comments are stripped correctly (a keyword inside a comment or string is not a
violation; `--` inside a string is not a comment). A differential test (`migration-additive-scan-differential.db.test.ts`) executes every
scanner-accepted input of a hand-written plus 6000-input seeded fuzz corpus on real PostgreSQL and asserts a canary table survives.
Limitation: it is a text allow-list, not a Postgres parser; it proves the migration is additive in shape and that no hidden statement exists in the
corpus-tested lexer cases, not that the migration will succeed (a migration can pass the scan and still fail at runtime, which is exactly what the
failure-injection test exercises).

## Recovery

What the job gives you, and no more:

1. Point-in-time-recovery coordinate. The job cannot call Neon. It records the UTC timestamp and WAL LSN of the production primary
   immediately before the deploy. To use it, an owner restores the Neon branch to that timestamp or LSN in the Neon console. This project's
   history retention is 21600 s (6 hours): after that the coordinate is no longer restorable. A restore discards every write made after
   the coordinate, including legitimate application writes; use it only deliberately.
2. Logical recovery. The batch is additive only, so rolling the application code back is safe at any point. Each manifest migration carries a
   `rollbackSql` note (DROP of exactly what it created). These notes are documentation: neither the workflow nor any script ever runs them.
   Running one drops the column/index and any data written to it since; do it only after the code that uses it is no longer deployed.

### Before you dispatch: size, open transactions, locks (informational, never gating)

The recovery-point record includes, for the tables the pending migrations touch, the estimated row count (`pg_class.reltuples`; `-1` means never
analyzed) and the number of transactions open longer than 60 s that are visible to the migration role (`pg_stat_activity`; a count only, no query text,
no user, no address; sessions of other roles are invisible without `pg_read_all_stats`, so it is a lower bound). These never block the batch.
Check them first and dispatch in a low-write window. Each `CREATE INDEX` (the three on `usage_events`) takes a SHARE lock for one scan of the table:
writes to `usage_events` wait while it builds, so a large table or a long-open transaction lengthens the stall. No `lock_timeout` is applied.
Measured: Prisma's engine does NOT honor the `PGOPTIONS` environment variable (a `PGOPTIONS=-c default_transaction_read_only=on` `migrate deploy` applied
a migration), but it DOES honor `options` in the connection URL query (`?options=-c%20default_transaction_read_only%3Don` made `migrate deploy`
fail with "cannot execute INSERT in a read-only transaction"). So a `lock_timeout` could be applied through the URL; this is not implemented here
because it changes the secret-derived URL the deploy step uses. Not verified on Neon.

### Partial failure and resume

Measured, not assumed (`production-batch-migration-recovery.db.test.ts`, case B): Prisma does NOT wrap a migration in a transaction.
If migration k of n fails, migrations 1..k-1 stay applied, migration k stays recorded as failed (`finished_at` null), AND the effects of
the statements of migration k that ran before the failing statement remain in the schema. Migrations k+1..n never run.

| State after a failed run | Gate verdict |
|--------------------------|--------------|
| failed (unfinished) row exists | `FAILED_LEDGER_ROW`: blocked. Prisma itself refuses with P3009 |
| the failed attempt was resolved (`prisma migrate resolve --rolled-back <name>`) | tolerated only for a member of this batch; then `OBJECT_ALREADY_EXISTS` if the partial attempt left an object the pending migrations will create: remove it (manifest `rollbackSql` for that migration) |
| clean applied prefix (runner cancelled between migrations), rest pending | `RESUME_OK` if the prefix rows are finished with matching checksums and the non-batch ledger equals the anchor |
| prefix checksum differs, a later member applied before an earlier one, extra pending migration, ledger row not in main | blocked (`APPLIED_PREFIX_INVALID`, `PENDING_SET_MISMATCH`, `LEDGER_NOT_IN_MAIN`) |

Resolving a failed row is NOT automated and there is no production resolve workflow. `.github/workflows/resolve-failed-migration.yml` is
hard-wired to the Neon TEST database and one historical migration; do not use it for production. For production, the owner either
(a) restores the recovery point (above), or (b) separately authorizes an out-of-band `prisma migrate resolve --rolled-back <name>`
against production, after fixing the migration in a new PR and re-issuing the manifest (new sha256), and cleaning any leftover object. Then
re-dispatch MAIN_BATCH at the new main SHA; the gate classifies it as a resume.

## Runtime-role reconcile versus the pending migrations (measured)

Question: can the runtime-role reconcile against the LATEST `prisma/schema.prisma` succeed BEFORE the pending migrations are applied
(columns and indexes missing)? Rehearsal on a disposable local PostgreSQL 16 database migrated with exactly the 190 migrations that
precede the batch, running `scripts/release/runtime-role-reconcile-gate.mjs` (pre-verify, reconcile-only `apply --only-if-present`,
post-verify) with the latest schema: `RUNTIME_ROLE_GATE=PASS`, `RUNTIME_ROLE_RECONCILED`, 25 statements, 262 public tables, 260
Prisma-modelled tables all with full DML for `opsiq_app`, no grant gap, no unclassified table, 0 owned objects, 0 memberships.
Reason: the tool reconciles TABLE-level privileges from the models that exist as tables; this batch adds only columns and indexes, so the
set of tables is identical before and after. Therefore reconcile does not depend on these migrations being applied.

Correct stage anyway: migration first, reconcile inside the same job after it (what the workflow does). A batch that ADDS A TABLE would make
a reconcile run before the migration miss that table (a grant gap, blocked by the gate); that is the `search_console_metrics` incident and
the reason the reconcile gate follows the deploy. A reconcile before the migration is neither required nor useful.

## Authoring the next batch

1. Merge the migrations to main first (MAIN_BATCH never applies unmerged SQL). 2. Copy the manifest, list the migrations in timestamp order
(at most 10). 3. `sha256`: `sha256sum prisma/migrations/<name>/migration.sql`. 4. `creates`: run the scan and copy the derived objects
(`scanAdditiveOnly(sql).creates`); the gate refuses any difference. 5. Anchor: from the repo root
`node -e "import('./scripts/release/migration-batch.mjs').then((m)=>{const l=m.readLocalMigrations('.');const n=[...l.keys()].sort();const p=n.slice(0,n.indexOf(process.argv[1]));console.log(JSON.stringify(m.ledgerAnchor(p.map((x)=>({name:x,checksum:l.get(x).sha256})))))})" <first-batch-migration-name>`;
it must equal production's ledger (`md5(string_agg(migration_name||'|'||checksum, E'\n' ORDER BY migration_name COLLATE "C"))` is the
cross-check). 6. Write a `rollbackSql` note per migration. 7. Open a PR: CI `db-verify` is mandatory for the manifest, the scripts and the
workflow (`scripts/ci-risk-classifier.mjs`), and it re-proves the manifest against the repository files and the whole flow against real
databases.

## Honest limits

- One human approval on `production-operator` remains by design; this reduces dispatches from many to one, not approvals to zero.
- Recovery is a coordinate plus an additive-only guarantee plus documentation. The job does not create a Neon branch or snapshot, cannot
  verify the coordinate is restorable, and the restore window is 6 hours.
- The ledger anchor proves the live ledger equals main's history before the batch. It does not prove production's actual schema equals
  that history (an out-of-band change is caught only for the objects the batch itself will create).
- Additive-only scope: a batch containing anything destructive, a data backfill, or `ALTER COLUMN` is refused; it needs the single-migration
  MAIN or PINNED_PREDEPLOY path (or a new reviewed mechanism), not this one.
- The scan is a text allow-list, not a SQL parser; a migration that passes can still fail at runtime (see partial failure).
- Nothing here was exercised against a real Neon database; the proof is on disposable local PostgreSQL 16 (CI uses 16, production is 18).
