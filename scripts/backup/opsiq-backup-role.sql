-- opsiq_backup: the ONLY database identity the Production backup should use.
--
-- WHY (F-LEAST-PRIVILEGE-BACKUP): the historical backup credential (`PRODUCTION_DATABASE_URL`) is the
-- schema owner / migrator login: it can create, alter and drop everything. A backup job needs to READ
-- every table and sequence and nothing else. A leaked or abused backup credential must not be able to
-- change, truncate or drop Production data.
--
-- WHAT: a LOGIN role that holds only the built-in `pg_read_all_data` membership (SELECT on every table,
-- view and sequence, USAGE on every schema), no superuser/createdb/createrole/replication/bypassrls,
-- a small connection limit, read-only transactions by default, and an idle-in-transaction timeout.
-- The schema uses no row-level security (verified: 0 migrations enable it), so BYPASSRLS is not needed;
-- scripts/backup-credential-check.sh FAILS if that ever changes while the role lacks it.
--
-- HOW TO APPLY (OWNER ACTION, NOT RUN BY ANY AUTOMATION; a Production role change needs approval):
--   1. psql "$OWNER_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backup/opsiq-backup-role.sql
--   2. Set the password interactively, never in a file or on a command line:  \password opsiq_backup
--   3. Build the DIRECT (non-pooler) connection string for opsiq_backup and store it ONLY in the
--      `backup-write` GitHub Environment secret that replaces PRODUCTION_DATABASE_URL for backups.
--   4. Run scripts/backup-credential-check.sh with that string (it prints counts, never data).
-- ROLLBACK: DROP OWNED BY opsiq_backup; DROP ROLE opsiq_backup;   (touches no application data)
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsiq_backup') THEN
    CREATE ROLE opsiq_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 2;
  ELSE
    ALTER ROLE opsiq_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 2;
  END IF;
END
$$;

GRANT pg_read_all_data TO opsiq_backup;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO opsiq_backup', current_database());
END
$$;

-- Defence in depth (a session can still SET these off, which is why the credential check also proves
-- the role holds no write privilege at all): reads only, and no abandoned open transaction.
ALTER ROLE opsiq_backup SET default_transaction_read_only = on;
ALTER ROLE opsiq_backup SET idle_in_transaction_session_timeout = '60s';
