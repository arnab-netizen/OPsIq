/**
 * Production database ROLE TOPOLOGY for governed QuickBooks / Intuit erasure.
 *
 * The in-database guards (append-only triggers + qbo_erasure_authorized) are only a boundary if the ordinary application login can
 * neither OWN the guarded objects (an owner can ALTER / DROP / DISABLE TRIGGER / CREATE OR REPLACE FUNCTION) nor reach the eraser role.
 *
 *   schema owner / migrator  — owns every table + function; runs `prisma migrate deploy` and THIS script; never used by the web runtime.
 *   runtime (opsiq_app)      — DML on application tables only. Owns nothing, no CREATE, no TRUNCATE/TRIGGER, not in the eraser role,
 *                              no privilege at all on privacy_erasure_requests or _prisma_migrations.
 *   eraser logins            — one per human operator (>= 2 are needed: the database refuses a request approved by the login that made it),
 *                              members of opsiq_privacy_eraser; SELECT everywhere (fail-closed residue scan), UPDATE / DELETE only on the
 *                              registry tables, INSERT / UPDATE on the tombstone. Own nothing.
 *
 * This module never sets, prints or accepts a password: roles are created WITHOUT one (they cannot authenticate) and an administrator sets
 * credentials out of band (`ALTER ROLE ... PASSWORD`, >= 60 bits of entropy on Neon). Names are validated and quoted.
 */
import type { ClientBase } from "pg";
import { ERASURE_ROLE, HANDLED_TABLES } from "./qbo-erasure.service";

export const RUNTIME_DENIED_TABLES = ["privacy_erasure_requests", "_prisma_migrations"] as const;
export interface RoleTopologyNames { runtimeRole: string; eraserLogins: readonly string[] }

const IDENT = /^[a-z_][a-z0-9_]{2,62}$/;
const quote = (kind: string, v: string): string => {
  if (!IDENT.test(v)) throw new Error(`invalid ${kind} role name (lowercase letters, digits, underscore; 3-63 chars)`);
  return `"${v}"`;
};

export function roleTopologyStatements(names: RoleTopologyNames, database: string): string[] {
  if (names.eraserLogins.length < 2) throw new Error("at least two eraser logins are required (requester and approver must be different database logins)");
  const all = [names.runtimeRole, ...names.eraserLogins];
  if (new Set(all).size !== all.length) throw new Error("runtime and eraser login names must all be distinct");
  if (all.includes(ERASURE_ROLE)) throw new Error("a login cannot be named like the eraser group role");
  const rt = quote("runtime", names.runtimeRole);
  const logins = names.eraserLogins.map((l) => quote("eraser login", l));
  const eraser = `"${ERASURE_ROLE}"`;
  const db = `"${database.replace(/"/g, '""')}"`;
  const s: string[] = [];
  for (const name of all) {
    s.push(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${name}') THEN CREATE ROLE ${quote("role", name)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$`);
  }
  s.push(`GRANT CONNECT ON DATABASE ${db} TO ${[rt, ...logins].join(", ")}`);
  s.push(`GRANT USAGE ON SCHEMA public TO ${[rt, ...logins, eraser].join(", ")}`);
  s.push(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
  s.push(`REVOKE CREATE ON SCHEMA public FROM ${[rt, ...logins, eraser].join(", ")}`);
  // Runtime: DML only, never on the tombstone or the migration history.
  s.push(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${rt}`);
  s.push(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${rt}`);
  for (const t of RUNTIME_DENIED_TABLES) s.push(`DO $$ BEGIN IF to_regclass('public.${t}') IS NOT NULL THEN REVOKE ALL ON TABLE public."${t}" FROM ${rt}; END IF; END $$`);
  s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${rt}`);
  s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${rt}`);
  // Eraser group: read everything (the residue scan must be able to see every table, or it would silently scan fewer), write only the registry.
  s.push(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${eraser}`);
  s.push(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${eraser}`);
  s.push(`DO $$ BEGIN IF to_regclass('public._prisma_migrations') IS NOT NULL THEN REVOKE ALL ON TABLE public."_prisma_migrations" FROM ${eraser}; END IF; END $$`);
  s.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${eraser}`);
  s.push(`GRANT INSERT, UPDATE ON TABLE public."privacy_erasure_requests" TO ${eraser}`);
  for (const t of [...HANDLED_TABLES].filter((x) => x !== "privacy_erasure_requests").sort()) {
    s.push(`GRANT UPDATE, DELETE ON TABLE public."${t}" TO ${eraser}`);
  }
  s.push(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname LIKE 'controlled\\_learning\\_%' LOOP EXECUTE format('GRANT UPDATE, DELETE ON TABLE public.%I TO ${eraser}', r.relname); END LOOP; END $$`);
  s.push(`GRANT INSERT ON TABLE public."audit_events" TO ${eraser}`);
  // The executing transaction row-locks the business (SELECT ... FOR UPDATE needs an UPDATE privilege on at least one column): updated_at only.
  s.push(`GRANT UPDATE ("updated_at") ON TABLE public."owner_businesses" TO ${eraser}`);
  for (const l of logins) s.push(`GRANT ${eraser} TO ${l}`);
  return s;
}

export async function applyRoleTopology(owner: ClientBase, names: RoleTopologyNames): Promise<string[]> {
  const database = (await owner.query<{ d: string }>(`SELECT current_database() AS d`)).rows[0].d;
  const statements = roleTopologyStatements(names, database);
  await owner.query("BEGIN");
  try { for (const st of statements) await owner.query(st); await owner.query("COMMIT"); } catch (e) { await owner.query("ROLLBACK"); throw e; }
  return statements;
}

export interface TopologyCheck { name: string; ok: boolean }
export interface TopologyReport { result: "PASS" | "FAIL"; checks: TopologyCheck[] }

/** Read-only: catalog queries only, safe against Production. Prints booleans, never a credential. */
export async function verifyRoleTopology(c: ClientBase, names: RoleTopologyNames): Promise<TopologyReport> {
  const checks: TopologyCheck[] = [];
  const one = async (sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0] as Record<string, unknown>;
  const add = (name: string, ok: boolean) => checks.push({ name, ok });
  const flags = async (role: string) => one(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolcanlogin FROM pg_roles WHERE rolname = $1`, [role]);

  const rt = names.runtimeRole;
  const rtf = await flags(rt);
  add("runtime role exists", !!rtf);
  if (rtf) {
    add("runtime is not superuser / createrole / createdb / bypassrls / replication", !rtf.rolsuper && !rtf.rolcreaterole && !rtf.rolcreatedb && !rtf.rolbypassrls && !rtf.rolreplication);
    add("runtime owns no table", Number((await one(`SELECT count(*)::int AS n FROM pg_class WHERE relowner = $1::regrole AND relkind IN ('r','p','v','m','S')`, [rt])).n) === 0);
    add("runtime owns no function or trigger function", Number((await one(`SELECT count(*)::int AS n FROM pg_proc WHERE proowner = $1::regrole`, [rt])).n) === 0);
    add("runtime owns no schema or database", Number((await one(`SELECT (SELECT count(*) FROM pg_namespace WHERE nspowner = $1::regrole) + (SELECT count(*) FROM pg_database WHERE datdba = $1::regrole) AS n`, [rt])).n) === 0);
    add("runtime has no CREATE on schema public", !(await one(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS v`, [rt])).v);
    add("runtime is a member of no role at all (no SET ROLE path, no eraser)", Number((await one(`SELECT count(*)::int AS n FROM pg_auth_members WHERE member = $1::regrole`, [rt])).n) === 0 && !(await one(`SELECT pg_has_role($1, $2, 'MEMBER') AS v`, [rt, ERASURE_ROLE])).v);
    for (const t of RUNTIME_DENIED_TABLES) {
      const e = await one(`SELECT to_regclass($1) IS NOT NULL AS present`, [`public.${t}`]);
      if (!e.present) continue;
      const anyPriv = await one(`SELECT has_table_privilege($1, $2, 'SELECT') OR has_table_privilege($1, $2, 'INSERT') OR has_table_privilege($1, $2, 'UPDATE') OR has_table_privilege($1, $2, 'DELETE') OR has_table_privilege($1, $2, 'TRUNCATE') OR has_table_privilege($1, $2, 'TRIGGER') OR has_table_privilege($1, $2, 'REFERENCES') AS v`, [rt, `public.${t}`]);
      add(`runtime has NO privilege on ${t}`, !anyPriv.v);
    }
    add("runtime has no TRUNCATE / TRIGGER / REFERENCES on any public table", Number((await one(`SELECT count(*)::int AS n FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND (has_table_privilege($1, c.oid, 'TRUNCATE') OR has_table_privilege($1, c.oid, 'TRIGGER') OR has_table_privilege($1, c.oid, 'REFERENCES'))`, [rt])).n) === 0);
    add("runtime cannot change session_replication_role (cannot switch triggers off)", !(await one(`SELECT has_parameter_privilege($1, 'session_replication_role', 'SET') AS v`, [rt])).v);
  }
  for (const l of names.eraserLogins) {
    const f = await flags(l);
    add(`eraser login ${l} exists and can log in`, !!f && !!f.rolcanlogin);
    if (!f) continue;
    add(`eraser login ${l} is not superuser / createrole / bypassrls`, !f.rolsuper && !f.rolcreaterole && !f.rolbypassrls);
    add(`eraser login ${l} is a member of ${ERASURE_ROLE} without admin option`, !!(await one(`SELECT pg_has_role($1, $2, 'MEMBER') AS v`, [l, ERASURE_ROLE])).v && Number((await one(`SELECT count(*)::int AS n FROM pg_auth_members WHERE member = $1::regrole AND roleid = $2::regrole AND admin_option`, [l, ERASURE_ROLE])).n) === 0);
    add(`eraser login ${l} owns nothing`, Number((await one(`SELECT (SELECT count(*) FROM pg_class WHERE relowner = $1::regrole) + (SELECT count(*) FROM pg_proc WHERE proowner = $1::regrole) AS n`, [l])).n) === 0);
    add(`eraser login ${l} has no CREATE on schema public`, !(await one(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS v`, [l])).v);
  }
  add("the eraser role exists and cannot log in", !!(await one(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1 AND NOT rolcanlogin) AS v`, [ERASURE_ROLE])).v);
  return { result: checks.every((x) => x.ok) ? "PASS" : "FAIL", checks };
}
