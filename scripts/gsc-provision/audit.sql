-- Effective-privilege audit for the dedicated Search Console ingestion role. READ-ONLY, parameterless,
-- single row of booleans/counts. Uses has_*_privilege(<role>, ...) so inherited, PUBLIC and column-level
-- privileges are all evaluated (explicit GRANT statements alone do not establish isolation).
-- Run ONLY after the role exists (has_*_privilege raises for an unknown role).
WITH r AS (SELECT * FROM pg_roles WHERE rolname = 'opsiq_gsc_ingestion'),
rec AS (
  WITH RECURSIVE m(roleid) AS (
    SELECT oid FROM r
    UNION
    SELECT a.roleid FROM pg_auth_members a JOIN m ON a.member = m.roleid
  ) SELECT roleid FROM m
),
rel AS (
  SELECT c.oid, c.relname, c.relkind, n.nspname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%'
),
tgt AS (SELECT oid FROM rel WHERE nspname = 'public' AND relname = 'search_console_metrics' AND relkind = 'r')
SELECT
  (SELECT count(*) FROM r)::int AS role_exists,
  (SELECT rolcanlogin FROM r) AS can_login,
  (SELECT rolsuper FROM r) AS is_superuser,
  (SELECT rolcreaterole FROM r) AS can_create_role,
  (SELECT rolcreatedb FROM r) AS can_create_db,
  (SELECT rolreplication FROM r) AS can_replicate,
  (SELECT rolbypassrls FROM r) AS bypasses_rls,
  (SELECT rolconnlimit FROM r)::int AS conn_limit,
  ((SELECT count(*) FROM rec) - 1)::int AS memberships,
  (SELECT count(*) FROM pg_auth_members a, r WHERE a.member = r.oid AND a.set_option)::int AS set_role_grants,
  (SELECT count(*) FROM pg_auth_members a, r WHERE a.roleid = r.oid)::int AS members_of_role,
  ((SELECT count(*) FROM pg_class c, r WHERE c.relowner = r.oid)
   + (SELECT count(*) FROM pg_proc p, r WHERE p.proowner = r.oid)
   + (SELECT count(*) FROM pg_namespace n, r WHERE n.nspowner = r.oid)
   + (SELECT count(*) FROM pg_database d, r WHERE d.datdba = r.oid))::int AS owned_objects,
  has_database_privilege('opsiq_gsc_ingestion', current_database(), 'CONNECT') AS db_connect,
  has_database_privilege('opsiq_gsc_ingestion', current_database(), 'CREATE') AS db_create,
  has_schema_privilege('opsiq_gsc_ingestion', 'public', 'USAGE') AS schema_usage,
  (SELECT count(*) FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
     AND has_schema_privilege('opsiq_gsc_ingestion', n.oid, 'CREATE'))::int AS schemas_with_create,
  (SELECT count(*) FROM tgt)::int AS target_found,
  has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'SELECT') AS t_select,
  has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'INSERT') AS t_insert,
  has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'UPDATE') AS t_update,
  (has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'DELETE')
   OR has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'TRUNCATE')
   OR has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'REFERENCES')
   OR has_table_privilege('opsiq_gsc_ingestion', (SELECT oid FROM tgt), 'TRIGGER')) AS t_extra,
  (SELECT count(*) FROM rel
    WHERE relkind IN ('r', 'p', 'v', 'm', 'f') AND oid NOT IN (SELECT oid FROM tgt)
      AND has_table_privilege('opsiq_gsc_ingestion', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))::int AS other_table_access,
  (SELECT count(*) FROM rel
    WHERE relkind IN ('r', 'p', 'v', 'm', 'f') AND oid NOT IN (SELECT oid FROM tgt)
      AND has_any_column_privilege('opsiq_gsc_ingestion', oid, 'SELECT,INSERT,UPDATE,REFERENCES'))::int AS other_column_access,
  (SELECT count(*) FROM rel WHERE relkind = 'S'
      AND (has_sequence_privilege('opsiq_gsc_ingestion', oid, 'USAGE')
        OR has_sequence_privilege('opsiq_gsc_ingestion', oid, 'SELECT')
        OR has_sequence_privilege('opsiq_gsc_ingestion', oid, 'UPDATE')))::int AS sequence_access,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND has_function_privilege('opsiq_gsc_ingestion', p.oid, 'EXECUTE'))::int AS secdef_executable,
  coalesce((SELECT array_to_string(s.setconfig, ';') FROM pg_db_role_setting s, r WHERE s.setrole = r.oid AND s.setdatabase = 0), '') AS role_settings;
