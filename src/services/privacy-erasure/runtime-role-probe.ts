/**
 * Runtime-role PROBE: connect AS the runtime login and prove, with real statements, what it can and cannot do.
 *
 * Every probe runs inside a transaction that is ALWAYS rolled back, one savepoint per statement, so even a probe that unexpectedly
 * succeeded changes nothing (safe against Production). No credential is read or printed here: the caller supplies an already-connected
 * client. Only SQLSTATEs and booleans are returned.
 */
import type { ClientBase } from "pg";

export interface ProbeResult { name: string; ok: boolean; detail: string }

const INSUFFICIENT_PRIVILEGE = "42501";

/** A statement the runtime must NOT be able to run: success is a failure of the topology. */
const DENIED: Array<[string, string, readonly string[]]> = [
  ["cannot CREATE TABLE", `CREATE TABLE public.zz_runtime_probe (x int)`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot ALTER an application table", `ALTER TABLE public.audit_events ADD COLUMN zz_runtime_probe int`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot DROP an application table", `DROP TABLE public.audit_events`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot CREATE INDEX", `CREATE INDEX zz_runtime_probe_idx ON public.audit_events (id)`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot CREATE SCHEMA", `CREATE SCHEMA zz_runtime_probe`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot CREATE ROLE", `CREATE ROLE zz_runtime_probe`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot CREATE FUNCTION", `CREATE FUNCTION public.zz_runtime_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot TRUNCATE an application table", `TRUNCATE public.audit_events`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot DISABLE a trigger", `ALTER TABLE public.qbo_report_snapshots DISABLE TRIGGER USER`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot write the migration ledger", `UPDATE public._prisma_migrations SET logs = 'x' WHERE false`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot delete from the migration ledger", `DELETE FROM public._prisma_migrations WHERE false`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot read the erasure ledger", `SELECT 1 FROM public.privacy_erasure_requests LIMIT 1`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot write the erasure ledger", `DELETE FROM public.privacy_erasure_requests WHERE false`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot SET ROLE to the schema owner", `SET ROLE "__OWNER__"`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot SET ROLE to the eraser group", `SET ROLE "opsiq_privacy_eraser"`, [INSUFFICIENT_PRIVILEGE]],
  ["cannot switch triggers off", `SET session_replication_role = replica`, [INSUFFICIENT_PRIVILEGE]],
];

/** A statement the runtime MUST be able to run (read-only here; writes are proven in the disposable-database suite). */
const ALLOWED: Array<[string, string]> = [
  ["can SELECT 1", `SELECT 1`],
  ["can read the migration ledger", `SELECT count(*) FROM public._prisma_migrations`],
  ["can read an application table", `SELECT count(*) FROM public.audit_events`],
  ["can call the erasure authorization function (guard triggers need it) and gets false", `SELECT CASE WHEN public.qbo_erasure_authorized(gen_random_uuid(), gen_random_uuid()) THEN 'true' ELSE 'false' END AS v`],
];

export async function probeRuntimeRole(c: ClientBase, ownerRole: string): Promise<{ result: "PASS" | "FAIL"; probes: ProbeResult[] }> {
  const probes: ProbeResult[] = [];
  const who = (await c.query<{ u: string; s: string }>(`SELECT current_user AS u, session_user AS s`)).rows[0];
  probes.push({ name: "connected as a non-owner login (current_user = session_user, not the schema owner)", ok: who.u === who.s && who.u !== ownerRole, detail: "identity" });
  await c.query("BEGIN");
  try {
    let i = 0;
    for (const [name, sql] of ALLOWED) {
      await c.query(`SAVEPOINT p${i}`);
      try {
        const r = await c.query(sql);
        const ok = name.includes("gets false") ? r.rows[0]?.v === "false" : true;
        probes.push({ name, ok, detail: "ok" });
      } catch (e) {
        probes.push({ name, ok: false, detail: (e as { code?: string }).code ?? "error" });
        await c.query(`ROLLBACK TO SAVEPOINT p${i}`);
      }
      i++;
    }
    for (const [name, template, codes] of DENIED) {
      const sql = template.replace("__OWNER__", ownerRole.replace(/"/g, '""'));
      await c.query(`SAVEPOINT p${i}`);
      try {
        await c.query(sql);
        probes.push({ name, ok: false, detail: "STATEMENT SUCCEEDED (rolled back)" });
      } catch (e) {
        const code = (e as { code?: string }).code ?? "error";
        probes.push({ name, ok: codes.includes(code), detail: code });
      }
      await c.query(`ROLLBACK TO SAVEPOINT p${i}`);
      i++;
    }
  } finally {
    await c.query("ROLLBACK");
  }
  return { result: probes.every((p) => p.ok) ? "PASS" : "FAIL", probes };
}
