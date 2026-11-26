-- opsiq_gsc_ingestion: the ONLY database identity scripts/ingest-search-console.ts (and, once wired
-- up, .github/workflows/scheduled-gsc-ingestion.yml) should use.
--
-- WHY (F-LEAST-PRIVILEGE-GSC-INGESTION): PR #678 scaffolded the Google Search Console integration
-- (src/lib/integrations/search-console.ts, search-console-ingestion.service.ts, and the additive
-- `search_console_metrics` table) but deliberately left the Production database credential out of
-- scope rather than reach for OPERATOR_DATABASE_URL merely because it is available.
-- OPERATOR_DATABASE_URL is the schema owner / migrator login: it can create, alter and drop
-- everything. A GSC ingestion job needs to SELECT, INSERT and UPDATE exactly one table (it upserts
-- rows keyed by a deterministic row_key -- see search-console-ingestion.service.ts) and nothing
-- else. A leaked or abused ingestion credential must not be able to read or modify any other table
-- -- not users, not QBO/financial data, not any other business record.
--
-- WHAT: a LOGIN role granted SELECT, INSERT, UPDATE on `search_console_metrics` ONLY (no DELETE, no
-- TRUNCATE, no ALL PRIVILEGES, no schema-wide or database-wide read grant such as
-- pg_read_all_data -- contrast scripts/backup/opsiq-backup-role.sql, which is read-everything by
-- design because a backup must capture the whole database; this role is write-one-table by design
-- because ingestion must not be able to touch anything else), no
-- superuser/createdb/createrole/replication/bypassrls, a small connection limit, and an
-- idle-in-transaction timeout.
--
-- NO SEQUENCE GRANT: `search_console_metrics.id` defaults to `gen_random_uuid()` (a function call),
-- not a SERIAL/IDENTITY column backed by a sequence -- verified against
-- prisma/migrations/20261117120000_add_search_console_metrics/migration.sql ("id" UUID NOT NULL
-- DEFAULT gen_random_uuid()) and the SearchConsoleMetric model in prisma/schema.prisma. There is
-- therefore no sequence for this role to hold USAGE/SELECT on today. If a future migration ever adds
-- a serial/identity column to this table, that migration must also extend this script (and
-- scripts/gsc-credential-check.sh) with the matching sequence grant -- the credential check's
-- `sequences_unreadable`/`sequences_unwritable` facts exist to make a forgotten sequence grant fail
-- loudly rather than silently.
--
-- HOW TO APPLY (OWNER ACTION, NOT RUN BY ANY AUTOMATION; a Production role change needs approval):
--   1. psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/gsc/opsiq-gsc-ingestion-role.sql
--   2. Set the password interactively, never in a file or on a command line:  \password opsiq_gsc_ingestion
--   3. Build the DIRECT (non-pooler) connection string for opsiq_gsc_ingestion and store it ONLY in
--      the `GSC_INGESTION_DATABASE_URL` GitHub Actions secret that
--      .github/workflows/scheduled-gsc-ingestion.yml reads -- never OPERATOR_DATABASE_URL or
--      PRODUCTION_DATABASE_URL, and never the same secret as any other role's credential.
--   4. Run scripts/gsc-credential-check.sh with that string as DATABASE_URL (it prints counts and
--      booleans only, never data).
-- ROLLBACK: DROP OWNED BY opsiq_gsc_ingestion; DROP ROLE opsiq_gsc_ingestion;   (touches no
-- application data -- this role owns nothing, it only holds grants)
--
-- Idempotent: safe to re-run.

-- NOTE on the ELSE branch below: PostgreSQL (16+) requires the role performing an ALTER ROLE to
-- itself already HOLD any of the SUPERUSER/CREATEDB/REPLICATION/BYPASSRLS attributes before it may
-- change that attribute on ANOTHER role -- even to reassert the same (NO-prefixed) value the role
-- already has. $OWNER_DATABASE_URL is expected to hold none of those (it is a non-superuser schema
-- owner, same convention as scripts/backup/opsiq-backup-role.sql's OWNER_DATABASE_URL), so a re-run
-- only re-asserts LOGIN / CONNECTION LIMIT / INHERIT (which CREATEROLE always permits) and leaves
-- SUPERUSER/CREATEDB/REPLICATION/BYPASSRLS exactly as CREATE ROLE set them on first apply -- they
-- never drift on their own, and scripts/gsc-credential-check.sh independently verifies all four are
-- still false every time it runs, so silent drift would be caught there, not relied on to self-heal
-- here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsiq_gsc_ingestion') THEN
    CREATE ROLE opsiq_gsc_ingestion LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 2;
  ELSE
    ALTER ROLE opsiq_gsc_ingestion LOGIN NOCREATEROLE INHERIT CONNECTION LIMIT 2;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO opsiq_gsc_ingestion', current_database());
END
$$;

-- Exactly one table, exactly three privileges -- no ALL, no schema-wide or database-wide grant.
-- scripts/gsc-credential-check.sh FAILS if this role can read or write anything else.
GRANT SELECT, INSERT, UPDATE ON TABLE public.search_console_metrics TO opsiq_gsc_ingestion;

-- Defence in depth: a bounded idle-in-transaction timeout so an abandoned/hung ingestion run can
-- never hold an open transaction (and its row locks) indefinitely. Unlike opsiq_backup, this role
-- is NOT set to default_transaction_read_only -- it must be able to INSERT/UPDATE by design.
ALTER ROLE opsiq_gsc_ingestion SET idle_in_transaction_session_timeout = '60s';
