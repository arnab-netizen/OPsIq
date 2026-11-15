/**
 * Runtime-role PROBE: connect AS the runtime login and prove, with real statements, what it can and cannot do.
 *
 * Every ALLOWED/DENIED probe runs inside one transaction, one savepoint per statement, that is ALWAYS
 * rolled back by probeRuntimeRole()'s own `finally` — so even a probe that unexpectedly succeeded changes
 * nothing (safe against Production). The write-capability probe is the ONE exception to "runs inside a
 * transaction": its schema-safety precondition (see SCHEMA_SAFETY_SQL below) is proven BEFORE that
 * transaction is ever opened, and if the target is unsafe or unverifiable, the write-capability probe
 * fails WITHOUT any transaction ever starting — no `BEGIN`, no write statement, no further ALLOWED/DENIED
 * probing either, since that failure already determines the overall result. The complete invariant for the
 * governed probe's write-capability result has three parts: (1) the target schema is proven free of unsafe
 * statement-level UPDATE behavior BEFORE any transaction opens; (2) the capability UPDATE itself matches
 * zero rows (`WHERE false`); (3) the overall PASS can never be reported if the final `ROLLBACK` rejects —
 * a rollback failure propagates as a thrown error, never as a false PASS. No credential is read or printed
 * here: the caller supplies an already-connected client. Only SQLSTATEs and booleans are returned — never a
 * trigger/rule name or definition.
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

/**
 * Write-capability probe target: a table the runtime role must legitimately be able to UPDATE and which is
 * present once migrations are current (see docs/opsiq/product/RUNTIME_ROLE_CUTOVER.md §2). Kept in step
 * with the identical constant in scripts/release/production-migration-gate.mjs — a drift test
 * (runtime-role-release-gate.test.ts) asserts both are byte-identical.
 */
export const WRITE_CAPABILITY_TARGET_TABLE = "public.startup_status";
export const WRITE_CAPABILITY_PROBE_NAME =
  "can execute a write-class no-op UPDATE (zero rows) on public.startup_status — proves the connection is not read-only";
export const WRITE_CAPABILITY_PROBE_SQL = `UPDATE ${WRITE_CAPABILITY_TARGET_TABLE} SET "updated_at" = "updated_at" WHERE false`;

/**
 * Schema-safety precondition for the write-capability no-op: `WHERE false` guarantees the UPDATE itself
 * matches zero rows, but that alone does NOT guarantee zero side effects for every possible schema —
 * PostgreSQL fires a STATEMENT-level UPDATE trigger even when zero rows match (unlike a ROW-level trigger,
 * which only fires per matched row; verified against real PostgreSQL in runtime-role.db.test.ts). An
 * UPDATE rewrite RULE is refused on its mere PRESENCE for a different reason: a rule's own effective
 * row-matching semantics (plain `DO ALSO`, `DO INSTEAD`, a rule-level `WHERE` unrelated to the triggering
 * command, …) are operator-defined SQL and not safely predictable in general — proving in general whether
 * any given rule would or would not fire for this specific no-op is fragile, so this refuses unconditionally
 * on presence rather than attempting that prediction (also verified in runtime-role.db.test.ts: a plain
 * `DO ALSO` rule does NOT fire for this probe's own `WHERE false` UPDATE, yet the guard still refuses it).
 * This query proves neither an unsafe trigger nor any UPDATE rule exists on the probe target BEFORE any
 * write statement is ever attempted. `$1::regclass` is a parameterized relation lookup — never an
 * interpolated, caller-controlled identifier — so this can only ever inspect the single fixed,
 * repository-public target table.
 *   tgtype bit layout (PostgreSQL pg_trigger.tgtype): ROW = 1, UPDATE = 16. A trigger is STATEMENT-level
 *   exactly when the ROW bit is clear; it fires on UPDATE exactly when the UPDATE bit is set.
 *   tgisinternal excludes system-internal triggers (e.g. those backing constraints); tgenabled <> 'D'
 *   excludes a trigger an operator has explicitly disabled (ALTER TABLE ... DISABLE TRIGGER) — a disabled
 *   trigger cannot fire and is not a threat.
 *   pg_rewrite.ev_type '2' is PostgreSQL's catalog encoding for an UPDATE rule (the semantic field itself,
 *   never parsed from `pg_get_ruledef()` text).
 * Kept in step with the identical SQL in scripts/release/production-migration-gate.mjs — a drift test
 * (runtime-role-release-gate.test.ts) asserts both are byte-identical.
 */
export const SCHEMA_SAFETY_SQL =
  "SELECT " +
  "(SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid = $1::regclass AND NOT t.tgisinternal AND t.tgenabled <> 'D' AND (t.tgtype::int & 1) = 0 AND (t.tgtype::int & 16) <> 0) AS unsafe_triggers, " +
  "(SELECT count(*)::int FROM pg_rewrite r WHERE r.ev_class = $1::regclass AND r.ev_type = '2') AS unsafe_rules";

export type SchemaSafetyCode = "SAFE" | "UNSAFE_WRITE_PROBE_SCHEMA" | "SCHEMA_SAFETY_CHECK_FAILED";

/** Proves (or disproves) the schema-safety precondition above. Never prints a trigger/rule name or definition. */
export async function checkWriteProbeSchemaSafety(c: ClientBase, targetTable: string): Promise<{ safe: boolean; code: SchemaSafetyCode }> {
  try {
    const row = (await c.query<{ unsafe_triggers: number; unsafe_rules: number }>(SCHEMA_SAFETY_SQL, [targetTable])).rows[0];
    if ((row?.unsafe_triggers ?? 0) > 0 || (row?.unsafe_rules ?? 0) > 0) {
      return { safe: false, code: "UNSAFE_WRITE_PROBE_SCHEMA" };
    }
    return { safe: true, code: "SAFE" };
  } catch {
    return { safe: false, code: "SCHEMA_SAFETY_CHECK_FAILED" };
  }
}

/**
 * A statement the runtime MUST be able to run (read-only). The write-capability proof is a SEPARATE,
 * dedicated step in probeRuntimeRole() below — not a member of this list — because, unlike every statement
 * here, it must never even be attempted unless checkWriteProbeSchemaSafety() has first proven the target
 * safe (see that function's doc comment for why `WHERE false` alone is not sufficient).
 */
const ALLOWED: Array<[string, string]> = [
  ["can SELECT 1", `SELECT 1`],
  ["can read the migration ledger", `SELECT count(*) FROM public._prisma_migrations`],
  ["can read an application table", `SELECT count(*) FROM public.audit_events`],
  ["can call the erasure authorization function (guard triggers need it) and gets false", `SELECT CASE WHEN public.qbo_erasure_authorized(gen_random_uuid(), gen_random_uuid()) THEN 'true' ELSE 'false' END AS v`],
];

/**
 * Attempts the write-capability no-op UPDATE and reports it as a ProbeResult. MUST be called only after
 * checkWriteProbeSchemaSafety() has already proven the target safe — see probeRuntimeRole() below, which
 * proves schema safety BEFORE opening any transaction and never calls this otherwise. This function itself
 * performs no safety check: it exists purely to keep the UPDATE attempt and its result formatting out of
 * probeRuntimeRole()'s main body.
 */
async function attemptWriteCapabilityUpdate(c: ClientBase): Promise<ProbeResult> {
  try {
    await c.query(WRITE_CAPABILITY_PROBE_SQL);
    return { name: WRITE_CAPABILITY_PROBE_NAME, ok: true, detail: "ok" };
  } catch (e) {
    return { name: WRITE_CAPABILITY_PROBE_NAME, ok: false, detail: (e as { code?: string }).code ?? "error" };
  }
}

export async function probeRuntimeRole(c: ClientBase, ownerRole: string): Promise<{ result: "PASS" | "FAIL"; probes: ProbeResult[] }> {
  const probes: ProbeResult[] = [];
  const who = (await c.query<{ u: string; s: string }>(`SELECT current_user AS u, session_user AS s`)).rows[0];
  probes.push({ name: "connected as a non-owner login (current_user = session_user, not the schema owner)", ok: who.u === who.s && who.u !== ownerRole, detail: "identity" });

  // Schema safety is proven BEFORE any transaction is opened — not merely before the write-class UPDATE
  // within an already-open transaction. An unsafe or unverifiable schema refuses the write-capability
  // probe closed and stops here: no BEGIN, no UPDATE, and no further ALLOWED/DENIED transactional probing
  // either, since this failure already determines the overall result and nothing downstream can change it.
  const safety = await checkWriteProbeSchemaSafety(c, WRITE_CAPABILITY_TARGET_TABLE);
  if (!safety.safe) {
    probes.push({ name: WRITE_CAPABILITY_PROBE_NAME, ok: false, detail: safety.code });
    return { result: "FAIL", probes };
  }

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
    await c.query(`SAVEPOINT p${i}`);
    probes.push(await attemptWriteCapabilityUpdate(c));
    await c.query(`ROLLBACK TO SAVEPOINT p${i}`);
    i++;
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
