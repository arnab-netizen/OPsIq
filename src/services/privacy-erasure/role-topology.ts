/**
 * Production database ROLE TOPOLOGY: least-privilege runtime login + governed QuickBooks / Intuit erasure.
 *
 * The in-database guards (append-only triggers + qbo_erasure_authorized) are only a boundary if the ordinary application login can
 * neither OWN the guarded objects (an owner can ALTER / DROP / DISABLE TRIGGER / CREATE OR REPLACE FUNCTION) nor reach the eraser role.
 *
 *   schema owner / migrator  — owns every table + function; runs `prisma migrate deploy` and THIS script; never used by the web runtime.
 *   runtime (opsiq_app)      — DML on application tables only. Owns nothing, no CREATE, no TRUNCATE/TRIGGER, not in the eraser role,
 *                              no privilege at all on privacy_erasure_requests, SELECT only on _prisma_migrations.
 *   eraser logins (OPTIONAL) — one per human operator (>= 2 are needed to RUN an erasure: the database refuses a request approved by the
 *                              login that made it), members of opsiq_privacy_eraser; SELECT everywhere (fail-closed residue scan),
 *                              UPDATE / DELETE only on the registry tables, INSERT / UPDATE on the tombstone. Own nothing. The runtime
 *                              cutover does NOT need them: pass none, and create them later when two genuine operators exist.
 *
 * GRANT STRATEGY (deterministic reconciliation, no blanket default privileges)
 *   Blanket `ALTER DEFAULT PRIVILEGES ... GRANT ... TO opsiq_app` would hand every FUTURE table (including a future governance table such
 *   as privacy_erasure_requests) to the runtime the moment a migration creates it. Instead the grants are RECONCILED after every migration
 *   by the same idempotent statements: the runtime receives DML on exactly the tables that are Prisma models (schema.prisma) minus
 *   RUNTIME_DENIED_TABLES; the migration ledger is SELECT-only; ANY other table is denied (fail closed) and shows up in the verifier as an
 *   unclassified table. The operator runs the reconcile (`opsiq-role-cutover apply --only-if-present`) right after `migrate deploy`; with
 *   OPSIQ_REQUIRE_RUNTIME_ROLE set, the release gate refuses to promote a Production build while the runtime role cannot read a table.
 *
 * This module never sets, prints or accepts a password: roles are created WITHOUT one (they cannot authenticate) and an administrator sets
 * credentials out of band (`\password <role>` in psql, or `ALTER ROLE ... PASSWORD`; roles must be created with SQL, never the Neon
 * console/API, which would grant neon_superuser membership). Names are validated and quoted.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ClientBase } from "pg";
import { ERASURE_ROLE, HANDLED_TABLES } from "./qbo-erasure.service";

/** Tables the runtime must never touch at all (the erasure ledger and any future owner/operator-only governance table). */
export const RUNTIME_DENIED_TABLES = ["privacy_erasure_requests"] as const;
/** Runtime may READ the migration ledger (startup + release-gate checks) but never write it. */
export const RUNTIME_READONLY_TABLES = ["_prisma_migrations"] as const;
/**
 * SECURITY DEFINER functions OpsIQ ships. Each one's EXECUTE is revoked from PUBLIC and granted only to the roles that can legitimately
 * reach the guarded tables (runtime + eraser). A migration that adds another SECURITY DEFINER function fails the governance test until it
 * is classified here (src/__tests__/privacy-erasure/runtime-role-governance.test.ts).
 */
export const SECURITY_DEFINER_FUNCTIONS = [{ name: "qbo_erasure_authorized", args: "uuid, uuid" }] as const;

export interface RoleTopologyNames { runtimeRole: string; eraserLogins: readonly string[] }
export interface RoleTopologyOptions {
  /** Table names the runtime may read/write (Prisma models). Defaults to the models in prisma/schema.prisma. */
  modeledTables?: readonly string[];
}

const IDENT = /^[a-z_][a-z0-9_]{2,62}$/;
const quote = (kind: string, v: string): string => {
  if (!IDENT.test(v) || v.startsWith("pg_")) throw new Error(`invalid ${kind} role name (lowercase letters, digits, underscore; 3-63 chars)`);
  return `"${v}"`;
};
const lit = (v: string): string => `'${v.replace(/'/g, "''")}'`;

/** Table names of every `model` in a schema.prisma text (the @@map name, else the model name). */
export function parseModeledTables(schemaText: string): string[] {
  const out = new Set<string>();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (let m = re.exec(schemaText); m; m = re.exec(schemaText)) {
    const mapped = /@@map\("([^"]+)"\)/.exec(m[2]);
    out.add(mapped ? mapped[1] : m[1]);
  }
  return [...out].sort();
}

export function readModeledTables(schemaPath = resolve(process.cwd(), "prisma", "schema.prisma")): string[] {
  const tables = parseModeledTables(readFileSync(schemaPath, "utf8"));
  if (tables.length < 100) throw new Error("schema.prisma parse produced an implausibly small model list; refusing to reconcile grants");
  return tables;
}

/** The set the runtime receives DML on. */
export function runtimeWritableTables(modeled: readonly string[]): string[] {
  const denied = new Set<string>([...RUNTIME_DENIED_TABLES, ...RUNTIME_READONLY_TABLES]);
  return [...new Set(modeled)].filter((t) => !denied.has(t)).sort();
}

export function roleTopologyStatements(names: RoleTopologyNames, database: string, options: RoleTopologyOptions = {}): string[] {
  const all = [names.runtimeRole, ...names.eraserLogins];
  if (new Set(all).size !== all.length) throw new Error("runtime and eraser login names must all be distinct");
  if (all.includes(ERASURE_ROLE)) throw new Error("a login cannot be named like the eraser group role");
  const rt = quote("runtime", names.runtimeRole);
  const logins = names.eraserLogins.map((l) => quote("eraser login", l));
  const eraser = `"${ERASURE_ROLE}"`;
  const db = `"${database.replace(/"/g, '""')}"`;
  const writable = runtimeWritableTables(options.modeledTables ?? readModeledTables());
  const writableArray = `ARRAY[${writable.map(lit).join(", ")}]::text[]`;
  const readonlyArray = `ARRAY[${RUNTIME_READONLY_TABLES.map(lit).join(", ")}]::text[]`;
  const handledArray = `ARRAY[${[...HANDLED_TABLES].filter((x) => x !== "privacy_erasure_requests").sort().map(lit).join(", ")}]::text[]`;
  const s: string[] = [];

  // 1. Roles: created without a password; attributes normalised on every run so a drifted role is corrected, never trusted.
  for (const name of all) {
    s.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}') THEN CREATE ROLE ${quote("role", name)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`);
    // Only a DRIFTED role is altered (a non-superuser CREATEROLE owner may not re-assert attributes it does not itself hold); a drifted role that
    // cannot be corrected makes the statement fail, which rolls the whole transaction back (fail closed).
    s.push(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR NOT rolcanlogin)) THEN ALTER ROLE ${quote("role", name)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`);
  }
  // The runtime login is a member of nothing (no SET ROLE path, no eraser). Memberships it might have acquired are revoked.
  s.push(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = '${names.runtimeRole}'::regrole LOOP EXECUTE format('REVOKE %I FROM ${rt}', r.rolname); END LOOP; END $$`);
  if (logins.length === 0) {
    // No eraser logins requested: the group stays NOLOGIN and keeps whatever members an earlier, authorised cutover gave it.
  }

  // 2. Database + schema access. CREATE is revoked from PUBLIC and every named role (PostgreSQL <= 14 defaults granted it to PUBLIC).
  s.push(`GRANT CONNECT ON DATABASE ${db} TO ${[rt, ...logins].join(", ")}`);
  s.push(`REVOKE CREATE ON DATABASE ${db} FROM ${[rt, ...logins].join(", ")}`);
  s.push(`GRANT USAGE ON SCHEMA public TO ${[rt, ...logins, eraser].join(", ")}`);
  s.push(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  s.push(`REVOKE CREATE ON SCHEMA public FROM ${[rt, ...logins, eraser].join(", ")}`);

  // 3. No blanket defaults for the RUNTIME: any earlier default grant to it (from a previous topology version) is removed, and a future table is
  //    denied until the post-migration reconcile classifies it. The NOLOGIN eraser group keeps ONE read-only default (SELECT on future tables):
  //    the residue scan must see every table, or an unregistered table that references QuickBooks data would silently go unscanned.
  for (const role of [rt, eraser]) {
    s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`);
    s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`);
    s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${role}`);
  }
  s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${eraser}`);

  // 4. Runtime table grants: RECONCILE every public table to exactly one class (writable / read-only ledger / denied).
  s.push(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC`);
  s.push(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC`);
  s.push(
    `DO $$ DECLARE r record; c record; writable text[] := ${writableArray}; readonly text[] := ${readonlyArray}; BEGIN ` +
      `FOR r IN SELECT cl.oid, cl.relname FROM pg_class cl WHERE cl.relnamespace = 'public'::regnamespace AND cl.relkind IN ('r', 'p') LOOP ` +
      `EXECUTE format('REVOKE ALL ON TABLE public.%I FROM ${rt}', r.relname); ` +
      `FOR c IN SELECT a.attname FROM pg_attribute a WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL LOOP ` +
      `EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM ${rt}', c.attname, r.relname); END LOOP; ` +
      `IF r.relname = ANY (writable) THEN EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO ${rt}', r.relname); ` +
      `ELSIF r.relname = ANY (readonly) THEN EXECUTE format('GRANT SELECT ON TABLE public.%I TO ${rt}', r.relname); END IF; ` +
      `END LOOP; END $$`,
  );
  // Sequences: usable by the runtime unless they back a table the runtime may not touch (owned-by dependency).
  s.push(
    `DO $$ DECLARE r record; writable text[] := ${writableArray}; BEGIN ` +
      `FOR r IN SELECT cl.relname, (SELECT t.relname FROM pg_depend d JOIN pg_class t ON t.oid = d.refobjid WHERE d.objid = cl.oid AND d.deptype IN ('a', 'i') AND d.classid = 'pg_class'::regclass LIMIT 1) AS owner_table ` +
      `FROM pg_class cl WHERE cl.relnamespace = 'public'::regnamespace AND cl.relkind = 'S' LOOP ` +
      `EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM ${rt}', r.relname); ` +
      `IF r.owner_table IS NULL OR r.owner_table = ANY (writable) THEN EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO ${rt}', r.relname); END IF; ` +
      `END LOOP; END $$`,
  );

  // 5. SECURITY DEFINER functions: not executable by PUBLIC; executable only by the roles that can write the guarded tables.
  for (const f of SECURITY_DEFINER_FUNCTIONS) {
    const sig = `public.${f.name}(${f.args})`;
    s.push(`DO $$ BEGIN IF to_regprocedure('${sig}') IS NOT NULL THEN REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC; GRANT EXECUTE ON FUNCTION ${sig} TO ${[rt, ...logins, eraser].join(", ")}; END IF; END $$`);
  }

  // 6. Eraser group: read everything (the residue scan must see every table or it would silently scan fewer), write only the registry.
  s.push(
    `DO $$ DECLARE r record; handled text[] := ${handledArray}; BEGIN ` +
      `FOR r IN SELECT cl.relname FROM pg_class cl WHERE cl.relnamespace = 'public'::regnamespace AND cl.relkind IN ('r', 'p') LOOP ` +
      `EXECUTE format('REVOKE ALL ON TABLE public.%I FROM ${eraser}', r.relname); ` +
      `IF r.relname <> '_prisma_migrations' THEN EXECUTE format('GRANT SELECT ON TABLE public.%I TO ${eraser}', r.relname); END IF; ` +
      `IF r.relname = ANY (handled) OR r.relname LIKE 'controlled\\_learning\\_%' THEN EXECUTE format('GRANT UPDATE, DELETE ON TABLE public.%I TO ${eraser}', r.relname); END IF; ` +
      `END LOOP; END $$`,
  );
  s.push(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${eraser}`);
  s.push(`DO $$ BEGIN IF to_regclass('public.privacy_erasure_requests') IS NOT NULL THEN GRANT INSERT, UPDATE ON TABLE public."privacy_erasure_requests" TO ${eraser}; END IF; END $$`);
  s.push(`GRANT INSERT ON TABLE public."audit_events" TO ${eraser}`);
  // The executing transaction row-locks the business (SELECT ... FOR UPDATE needs an UPDATE privilege on at least one column): updated_at only.
  s.push(`GRANT UPDATE ("updated_at") ON TABLE public."owner_businesses" TO ${eraser}`);
  for (const l of logins) s.push(`GRANT ${eraser} TO ${l}`);
  return s;
}

export async function applyRoleTopology(owner: ClientBase, names: RoleTopologyNames, options: RoleTopologyOptions = {}): Promise<string[]> {
  const database = (await owner.query<{ d: string }>(`SELECT current_database() AS d`)).rows[0].d;
  const statements = roleTopologyStatements(names, database, options);
  await owner.query("BEGIN");
  try { for (const st of statements) await owner.query(st); await owner.query("COMMIT"); } catch (e) { await owner.query("ROLLBACK"); throw e; }
  return statements;
}

export interface TopologyCheck { name: string; ok: boolean }
export interface TopologyReport {
  result: "PASS" | "FAIL";
  checks: TopologyCheck[];
  /** Non-secret facts for the change record (role names, counts). Never a credential. */
  facts: Record<string, string | number | boolean | null | string[]>;
}

/** Read-only: catalog queries only, safe against Production. Prints booleans, never a credential. */
export async function verifyRoleTopology(c: ClientBase, names: RoleTopologyNames, options: RoleTopologyOptions = {}): Promise<TopologyReport> {
  const checks: TopologyCheck[] = [];
  const facts: TopologyReport["facts"] = {};
  const one = async (sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0] as Record<string, unknown>;
  const add = (name: string, ok: boolean) => checks.push({ name, ok });
  const flags = async (role: string) => one(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolcanlogin FROM pg_roles WHERE rolname = $1`, [role]);
  const writable = runtimeWritableTables(options.modeledTables ?? readModeledTables());

  facts.current_user = String((await one(`SELECT current_user AS v`)).v);
  facts.database = String((await one(`SELECT current_database() AS v`)).v);
  const rt = names.runtimeRole;
  const rtf = await flags(rt);
  add("runtime role exists", !!rtf);
  facts.runtime_role = rt;
  facts.runtime_role_exists = !!rtf;
  if (rtf) {
    add("runtime can log in", !!rtf.rolcanlogin);
    add("runtime is not superuser / createrole / createdb / bypassrls / replication", !rtf.rolsuper && !rtf.rolcreaterole && !rtf.rolcreatedb && !rtf.rolbypassrls && !rtf.rolreplication);
    const owned = Number((await one(`SELECT (SELECT count(*) FROM pg_class WHERE relowner = $1::regrole) + (SELECT count(*) FROM pg_proc WHERE proowner = $1::regrole) + (SELECT count(*) FROM pg_type WHERE typowner = $1::regrole AND typtype NOT IN ('b', 'c')) + (SELECT count(*) FROM pg_namespace WHERE nspowner = $1::regrole) + (SELECT count(*) FROM pg_database WHERE datdba = $1::regrole) + (SELECT count(*) FROM pg_operator WHERE oprowner = $1::regrole) + (SELECT count(*) FROM pg_event_trigger WHERE evtowner = $1::regrole) AS n`, [rt])).n);
    facts.runtime_owned_objects = owned;
    add("runtime owns no object (tables, sequences, functions, types, schemas, databases, operators, event triggers)", owned === 0);
    add("runtime has no CREATE on schema public", !(await one(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS v`, [rt])).v);
    add("runtime has USAGE on schema public", !!(await one(`SELECT has_schema_privilege($1, 'public', 'USAGE') AS v`, [rt])).v);
    add("runtime has CONNECT and no CREATE on the database", !!(await one(`SELECT has_database_privilege($1, current_database(), 'CONNECT') AS v`, [rt])).v && !(await one(`SELECT has_database_privilege($1, current_database(), 'CREATE') AS v`, [rt])).v);
    const memberships = Number((await one(`SELECT count(*)::int AS n FROM pg_auth_members WHERE member = $1::regrole`, [rt])).n);
    facts.runtime_role_memberships = memberships;
    add("runtime is a member of no role at all (no SET ROLE path, no eraser)", memberships === 0 && !(await one(`SELECT pg_has_role($1, $2, 'MEMBER') AS v`, [rt, ERASURE_ROLE])).v);
    add("runtime cannot SET ROLE to any table owner", Number((await one(`SELECT count(*)::int AS n FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND pg_has_role($1, c.relowner, 'SET') AND c.relowner <> $1::regrole`, [rt])).n) === 0);
    for (const t of RUNTIME_DENIED_TABLES) {
      const e = await one(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${t}`]);
      if (!e.present) continue;
      const anyPriv = await one(`SELECT has_table_privilege($1, $2, 'SELECT') OR has_table_privilege($1, $2, 'INSERT') OR has_table_privilege($1, $2, 'UPDATE') OR has_table_privilege($1, $2, 'DELETE') OR has_table_privilege($1, $2, 'TRUNCATE') OR has_table_privilege($1, $2, 'TRIGGER') OR has_table_privilege($1, $2, 'REFERENCES') OR has_any_column_privilege($1, $2, 'SELECT, INSERT, UPDATE, REFERENCES') AS v`, [rt, `public.${t}`]);
      add(`runtime has NO privilege on ${t}`, !anyPriv.v);
    }
    for (const t of RUNTIME_READONLY_TABLES) {
      const e = await one(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${t}`]);
      if (!e.present) continue;
      const r = await one(`SELECT has_table_privilege($1, $2, 'SELECT') AS r, (has_table_privilege($1, $2, 'INSERT') OR has_table_privilege($1, $2, 'UPDATE') OR has_table_privilege($1, $2, 'DELETE') OR has_table_privilege($1, $2, 'TRUNCATE') OR has_table_privilege($1, $2, 'TRIGGER') OR has_table_privilege($1, $2, 'REFERENCES') OR has_any_column_privilege($1, $2, 'INSERT, UPDATE, REFERENCES')) AS w`, [rt, `public.${t}`]);
      add(`runtime has SELECT only (no write) on ${t}`, !!r.r && !r.w);
    }
    add("runtime has no TRUNCATE / TRIGGER / REFERENCES on any public table", Number((await one(`SELECT count(*)::int AS n FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND (has_table_privilege($1, c.oid, 'TRUNCATE') OR has_table_privilege($1, c.oid, 'TRIGGER') OR has_table_privilege($1, c.oid, 'REFERENCES'))`, [rt])).n) === 0);
    // Grant coverage: every Prisma model table has full DML, every other table is classified (ledger / denied) — nothing else is reachable.
    const tables = (await c.query<{ relname: string; dml: boolean; any_priv: boolean }>(
      `SELECT c.relname, (has_table_privilege($1, c.oid, 'SELECT') AND has_table_privilege($1, c.oid, 'INSERT') AND has_table_privilege($1, c.oid, 'UPDATE') AND has_table_privilege($1, c.oid, 'DELETE')) AS dml,
              (has_table_privilege($1, c.oid, 'SELECT') OR has_table_privilege($1, c.oid, 'INSERT') OR has_table_privilege($1, c.oid, 'UPDATE') OR has_table_privilege($1, c.oid, 'DELETE') OR has_any_column_privilege($1, c.oid, 'SELECT, INSERT, UPDATE')) AS any_priv
         FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')`, [rt])).rows;
    const writableSet = new Set(writable);
    const classified = new Set<string>([...RUNTIME_DENIED_TABLES, ...RUNTIME_READONLY_TABLES]);
    const gaps = tables.filter((t) => writableSet.has(t.relname) && !t.dml).map((t) => t.relname);
    const unclassified = tables.filter((t) => !writableSet.has(t.relname) && !classified.has(t.relname)).map((t) => t.relname);
    const excess = tables.filter((t) => !writableSet.has(t.relname) && !RUNTIME_READONLY_TABLES.includes(t.relname as never) && t.any_priv).map((t) => t.relname);
    facts.grant_gap_tables = gaps.slice(0, 20);
    facts.unclassified_tables = unclassified.slice(0, 20);
    facts.public_tables = tables.length;
    add(`runtime has full DML on every application (Prisma model) table [${writable.length}]`, gaps.length === 0);
    add("every public table is classified (Prisma model, ledger or denied); an unclassified table is denied to the runtime", unclassified.length === 0);
    add("runtime has no privilege on any table outside the application set and the ledger", excess.length === 0);
    add("runtime has no default privileges in schema public (grants are reconciled, never inherited by future objects)", Number((await one(`SELECT count(*)::int AS n FROM pg_default_acl d, aclexplode(d.defaclacl) a WHERE d.defaclnamespace = 'public'::regnamespace AND a.grantee = $1::regrole`, [rt])).n) === 0);
    add("runtime cannot change session_replication_role (cannot switch triggers off)", !(await one(`SELECT has_parameter_privilege($1, 'session_replication_role', 'SET') AS v`, [rt])).v);
    add("runtime has no role-level configuration overrides", Number((await one(`SELECT count(*)::int AS n FROM pg_db_role_setting WHERE setrole = $1::regrole`, [rt])).n) === 0);
    for (const f of SECURITY_DEFINER_FUNCTIONS) {
      const sig = `public.${f.name}(${f.args})`;
      const present = (await one(`SELECT to_regprocedure($1) IS NOT NULL AS v`, [sig])).v;
      if (!present) continue;
      add(`${f.name}: runtime can execute it (guard triggers call it)`, !!(await one(`SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS v`, [rt, sig])).v);
    }
  }
  // Independent of the runtime role: definer functions are not callable by PUBLIC, and nothing else is granted to PUBLIC.
  for (const f of SECURITY_DEFINER_FUNCTIONS) {
    const sig = `public.${f.name}(${f.args})`;
    const present = (await one(`SELECT to_regprocedure($1) IS NOT NULL AS v`, [sig])).v;
    if (!present) continue;
    add(`${f.name}: SECURITY DEFINER, owner is not the runtime, EXECUTE not granted to PUBLIC`, !!(await one(
      `SELECT p.prosecdef AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AND p.proowner <> COALESCE((SELECT oid FROM pg_roles WHERE rolname = $2), 0) AS v FROM pg_proc p WHERE p.oid = $1::regprocedure`, [sig, rt])).v);
    add(`${f.name}: search_path pinned with pg_temp last`, !!(await one(`SELECT COALESCE((SELECT cfg LIKE 'search_path=pg_catalog%pg_temp' FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%' LIMIT 1), false) AS v FROM pg_proc p WHERE p.oid = $1::regprocedure`, [sig])).v);
  }
  facts.public_table_grants_to_public = Number((await one(`SELECT count(*)::int AS n FROM pg_class c, aclexplode(c.relacl) a WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','S') AND a.grantee = 0`)).n);
  add("no table or sequence in schema public is granted to PUBLIC", facts.public_table_grants_to_public === 0);
  add("PUBLIC has no CREATE on schema public", !(await one(`SELECT has_schema_privilege('public', 'public', 'CREATE') AS v`)).v);

  for (const l of names.eraserLogins) {
    const f = await flags(l);
    add(`eraser login ${l} exists and can log in`, !!f && !!f.rolcanlogin);
    if (!f) continue;
    add(`eraser login ${l} is not superuser / createrole / bypassrls`, !f.rolsuper && !f.rolcreaterole && !f.rolbypassrls);
    add(`eraser login ${l} is a member of ${ERASURE_ROLE} without admin option`, !!(await one(`SELECT pg_has_role($1, $2, 'MEMBER') AS v`, [l, ERASURE_ROLE])).v && Number((await one(`SELECT count(*)::int AS n FROM pg_auth_members WHERE member = $1::regrole AND roleid = $2::regrole AND admin_option`, [l, ERASURE_ROLE])).n) === 0);
    add(`eraser login ${l} owns nothing`, Number((await one(`SELECT (SELECT count(*) FROM pg_class WHERE relowner = $1::regrole) + (SELECT count(*) FROM pg_proc WHERE proowner = $1::regrole) AS n`, [l])).n) === 0);
    add(`eraser login ${l} has no CREATE on schema public`, !(await one(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS v`, [l])).v);
  }
  const eraserExists = !!(await one(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS v`, [ERASURE_ROLE])).v;
  add("the eraser role exists and cannot log in", !!(await one(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1 AND NOT rolcanlogin AND NOT rolsuper) AS v`, [ERASURE_ROLE])).v);
  if (eraserExists) {
    facts.eraser_role_members = (await c.query<{ m: string }>(`SELECT pg_get_userbyid(member) AS m FROM pg_auth_members WHERE roleid = $1::regrole ORDER BY 1`, [ERASURE_ROLE])).rows.map((r) => r.m);
  }
  return { result: checks.every((x) => x.ok) ? "PASS" : "FAIL", checks, facts };
}

export interface ApplyAndVerifyResult { statements: string[]; report: TopologyReport; committed: boolean }

/**
 * Apply the topology in ONE transaction, verify INSIDE that transaction, and commit only when the verification passes (and not in dry-run).
 * A failed verification or a dry run rolls everything back, so a half-correct topology is never left behind and a dry run proves the
 * apply would succeed without persisting a role or a grant.
 */
export async function applyAndVerifyRoleTopology(
  owner: ClientBase,
  names: RoleTopologyNames,
  options: RoleTopologyOptions & { dryRun?: boolean } = {},
): Promise<ApplyAndVerifyResult> {
  const database = (await owner.query<{ d: string }>(`SELECT current_database() AS d`)).rows[0].d;
  const statements = roleTopologyStatements(names, database, options);
  await owner.query("BEGIN");
  try {
    for (const st of statements) await owner.query(st);
    const report = await verifyRoleTopology(owner, names, options);
    if (report.result === "PASS" && !options.dryRun) { await owner.query("COMMIT"); return { statements, report, committed: true }; }
    await owner.query("ROLLBACK");
    return { statements, report, committed: false };
  } catch (e) { await owner.query("ROLLBACK"); throw e; }
}
