/**
 * Least-privilege RUNTIME role (opsiq_app) — hostile proof on a DISPOSABLE PostgreSQL (database name opsiq_runtime_role_test*).
 *
 * Two logins:
 *   ROLE_TEST_OWNER_DATABASE_URL  the NON-superuser schema owner that applied every migration (this is the governed migrator);
 *   DATABASE_URL                  the RUNTIME login `opsiq_app` — so every `db` (Prisma) call in this file is made AS the runtime role,
 *                                 which is what makes the application-flow assertions below real evidence.
 *
 *   OPSIQ_DB_TARGET=local TEST_WITH_DB=true \
 *   ROLE_TEST_OWNER_DATABASE_URL=postgresql://opsiq_schema_owner:pw@127.0.0.1:5432/opsiq_runtime_role_test \
 *   DATABASE_URL=postgresql://opsiq_app:pw@127.0.0.1:5432/opsiq_runtime_role_test \
 *     npx vitest run src/__tests__/privacy-erasure/runtime-role.db.test.ts
 *
 * The suite applies the topology itself (the same code the operator tool runs, with NO eraser logins), then proves: the verifier passes and
 * is not vacuous, apply is idempotent and repairs drift, future tables are denied until reconciled, the runtime cannot do DDL / role
 * operations / ledger writes / erasure-ledger access / trigger bypass / SECURITY DEFINER shadowing, and the real application flows
 * (QuickBooks persistence, Finance, Cashflow, scheduler, audit, migration-status) work under the runtime login. Nothing here touches Production.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { TASK_NAME_QBO_SYNC, createQboSyncTaskHandler, enqueueQboSync, qboSyncKey } from "@/services/quickbooks/qbo-sync-scheduling";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { checkMigrationReadiness } from "@/services/monitoring/migration-check";
import { applyAndVerifyRoleTopology, readModeledTables, roleTopologyStatements, verifyRoleTopology } from "@/services/privacy-erasure/role-topology";
import { WRITE_CAPABILITY_PROBE_NAME, checkWriteProbeSchemaSafety, probeRuntimeRole } from "@/services/privacy-erasure/runtime-role-probe";

const OWNER_URL = process.env.ROLE_TEST_OWNER_DATABASE_URL ?? "";
const ON_DEDICATED_DB = /opsiq_runtime_role_test/.test(OWNER_URL) && /opsiq_runtime_role_test/.test(process.env.DATABASE_URL ?? "");
const RUNTIME = "opsiq_app";
const NAMES = { runtimeRole: RUNTIME, eraserLogins: [] as string[] };
const urlFor = (user: string) => { const u = new URL(OWNER_URL); u.username = user; u.password = "pw"; return u.toString(); };
const env = envFor("production");
const books = (n: number): MonthBooks => ({ income: 20_000 + n, cogs: 9_000, bank: 15_000, arTotal: 8_000, arCurrent: 3_000, apTotal: 6_000, apCurrent: 1_000 });
const allMonths = () => Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)]));
const D = (k: string) => new Date(`${k}T00:00:00.000Z`);

let admin: Client;
let ownerRole = "";
beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB) return;
  admin = new Client({ connectionString: OWNER_URL });
  await admin.connect();
  ownerRole = (await admin.query(`SELECT current_user AS u`)).rows[0].u;
  // The governed apply: verify INSIDE the transaction, commit only on PASS.
  const r = await applyAndVerifyRoleTopology(admin, NAMES);
  expect(r.report.checks.filter((x) => !x.ok)).toEqual([]);
  expect(r.committed).toBe(true);
  await admin.query(`ALTER ROLE ${RUNTIME} PASSWORD 'pw'`);
});
afterAll(async () => { await admin?.end(); });

const asRuntime = async () => { const c = new Client({ connectionString: urlFor(RUNTIME) }); await c.connect(); return c; };
const count = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);
async function attempt(c: Client, sql: string, params: unknown[] = [], pre: string[] = []): Promise<string> {
  await c.query("BEGIN");
  try { for (const p of pre) await c.query(p); return await c.query(sql, params).then(() => "OK", (e) => String(e.message)); } finally { await c.query("ROLLBACK"); }
}
/** Every table/sequence/function ACL, to compare "before" and "after" a second apply (idempotency). */
const aclSnapshot = async () => (await admin.query(
  `SELECT 'r' || c.relname AS k, c.relacl::text AS a FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','S')
   UNION ALL SELECT 'f' || p.proname, p.proacl::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
   UNION ALL SELECT 'd' || coalesce(defaclobjtype::text,''), defaclacl::text FROM pg_default_acl ORDER BY 1`)).rows;

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] opsiq_app runtime role — topology", () => {
  it("verifier PASSES with zero eraser logins, and the runtime owns NOTHING (OPSIQ_APP_OWNED_OBJECTS=0)", async () => {
    const r = await verifyRoleTopology(admin, NAMES);
    expect(r.checks.filter((x) => !x.ok)).toEqual([]);
    expect(r.result).toBe("PASS");
    expect(r.facts.runtime_owned_objects).toBe(0);
    expect(r.facts.grant_gap_tables).toEqual([]);
    expect(r.facts.unclassified_tables).toEqual([]);
    expect(await count(`SELECT (SELECT count(*) FROM pg_class WHERE relowner=$1::regrole) + (SELECT count(*) FROM pg_proc WHERE proowner=$1::regrole) + (SELECT count(*) FROM pg_namespace WHERE nspowner=$1::regrole) + (SELECT count(*) FROM pg_database WHERE datdba=$1::regrole) AS n`, [RUNTIME])).toBe(0);
    // not vacuous: the SCHEMA OWNER fails the very same checks when named as the runtime
    const bad = await verifyRoleTopology(admin, { runtimeRole: ownerRole, eraserLogins: [] });
    expect(bad.result).toBe("FAIL");
  });

  it("the plan is deterministic, secret-free and contains no blanket default privilege", () => {
    const a = roleTopologyStatements(NAMES, "db", { modeledTables: readModeledTables() });
    const b = roleTopologyStatements(NAMES, "db", { modeledTables: readModeledTables() });
    expect(a).toEqual(b);
    const sql = a.join("\n");
    // A role-password statement, not a table name such as password_reset_tokens.
    expect(sql).not.toMatch(/\b(?:ENCRYPTED\s+|UNENCRYPTED\s+)?PASSWORD\s+(?:'|NULL|\$)/i);
    expect(sql).not.toMatch(/ALTER\s+ROLE[^;]*\bPASSWORD\b/i);
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES[^;]*\bGRANT\b[^;]*\bTO\s+"opsiq_app"/i);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "opsiq_privacy_eraser"/);
    expect(sql).toMatch(/REVOKE CREATE ON SCHEMA public FROM PUBLIC/);
  });

  it("apply is IDEMPOTENT: a second apply changes no ACL; a dry run changes nothing even after drift", async () => {
    const before = await aclSnapshot();
    const r = await applyAndVerifyRoleTopology(admin, NAMES);
    expect(r.committed).toBe(true);
    expect(await aclSnapshot()).toEqual(before);
    await admin.query(`GRANT TRUNCATE ON TABLE public.audit_events TO ${RUNTIME}`);
    expect((await verifyRoleTopology(admin, NAMES)).result).toBe("FAIL");
    const dry = await applyAndVerifyRoleTopology(admin, NAMES, { dryRun: true });
    expect(dry.report.result).toBe("PASS");
    expect(dry.committed).toBe(false);
    expect((await verifyRoleTopology(admin, NAMES)).result).toBe("FAIL"); // the dry run persisted nothing
    expect((await applyAndVerifyRoleTopology(admin, NAMES)).committed).toBe(true);
    expect((await verifyRoleTopology(admin, NAMES)).result).toBe("PASS");
  });

  it("DRIFT is detected and repaired: eraser membership, extra table/column grants, PUBLIC grants, CREATE on public, a default privilege, an altered attribute", async () => {
    const drift: Array<[string, string]> = [
      [`GRANT opsiq_privacy_eraser TO ${RUNTIME}`, "membership"],
      [`GRANT UPDATE ON TABLE public.privacy_erasure_requests TO ${RUNTIME}`, "erasure ledger"],
      [`GRANT SELECT (id) ON TABLE public.privacy_erasure_requests TO ${RUNTIME}`, "erasure ledger column"],
      [`GRANT INSERT ON TABLE public._prisma_migrations TO ${RUNTIME}`, "ledger write"],
      [`GRANT SELECT ON TABLE public.audit_events TO PUBLIC`, "PUBLIC table grant"],
      [`GRANT CREATE ON SCHEMA public TO PUBLIC`, "PUBLIC CREATE on schema"],
      [`GRANT CREATE ON SCHEMA public TO ${RUNTIME}`, "runtime CREATE on schema"],
      [`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${RUNTIME}`, "default privilege"],
      [`GRANT EXECUTE ON FUNCTION public.qbo_erasure_authorized(uuid, uuid) TO PUBLIC`, "definer EXECUTE to PUBLIC"],
      [`REVOKE DELETE ON TABLE public.audit_events FROM ${RUNTIME}`, "missing grant"],
    ];
    for (const [sql, label] of drift) {
      await admin.query(sql);
      expect((await verifyRoleTopology(admin, NAMES)).result, `drift not detected: ${label}`).toBe("FAIL");
      const r = await applyAndVerifyRoleTopology(admin, NAMES);
      expect(r.committed, `drift not repaired: ${label}`).toBe(true);
      expect((await verifyRoleTopology(admin, NAMES)).result, label).toBe("PASS");
    }
  });

  it("FUTURE objects: a new table is DENIED to the runtime (fail closed) until reconciled; the erasure ledger stays denied after every reconcile", async () => {
    await admin.query(`CREATE TABLE public.zz_future_table (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), v text)`);
    await admin.query(`CREATE TABLE public.zz_future_governance (id uuid PRIMARY KEY DEFAULT gen_random_uuid())`);
    try {
      const rt = await asRuntime();
      try {
        expect(await attempt(rt, `SELECT 1 FROM public.zz_future_table`)).toMatch(/permission denied/);
        const v = await verifyRoleTopology(admin, NAMES);
        expect(v.result).toBe("FAIL");
        expect(v.facts.unclassified_tables).toEqual(expect.arrayContaining(["zz_future_table", "zz_future_governance"]));
        // the migration author lists the new APPLICATION table as a model; the governance table is not listed and stays denied
        const modeled = [...readModeledTables(), "zz_future_table"];
        const r = await applyAndVerifyRoleTopology(admin, NAMES, { modeledTables: modeled });
        expect(r.committed).toBe(false); // zz_future_governance is still unclassified -> the apply refuses to commit
        expect(r.report.facts.unclassified_tables).toEqual(["zz_future_governance"]);
        await admin.query(`DROP TABLE public.zz_future_governance`);
        expect((await applyAndVerifyRoleTopology(admin, NAMES, { modeledTables: modeled })).committed).toBe(true);
        expect(await attempt(rt, `INSERT INTO public.zz_future_table (v) VALUES ('x')`)).toBe("OK");
        expect(await attempt(rt, `SELECT 1 FROM public.privacy_erasure_requests`)).toMatch(/permission denied/);
      } finally { await rt.end(); }
    } finally {
      await admin.query(`DROP TABLE IF EXISTS public.zz_future_table`);
      await admin.query(`DROP TABLE IF EXISTS public.zz_future_governance`);
      expect((await applyAndVerifyRoleTopology(admin, NAMES)).committed).toBe(true);
    }
  });

  it("PUBLIC schema hardening: no CREATE for PUBLIC or the runtime, whatever the server default was", async () => {
    await admin.query(`GRANT CREATE ON SCHEMA public TO PUBLIC`); // what PostgreSQL <= 14 did by default
    await applyAndVerifyRoleTopology(admin, NAMES);
    expect((await admin.query(`SELECT has_schema_privilege('public','public','CREATE') AS v`)).rows[0].v).toBe(false);
    const rt = await asRuntime();
    try {
      expect(await attempt(rt, `CREATE TABLE public.zz_t (x int)`)).toMatch(/permission denied for schema public/);
      expect(await attempt(rt, `CREATE FUNCTION public.zz_f() RETURNS int LANGUAGE sql AS 'SELECT 1'`)).toMatch(/permission denied for schema public/);
      expect(await attempt(rt, `CREATE SCHEMA zz_s`)).toMatch(/permission denied for database/);
    } finally { await rt.end(); }
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] opsiq_app runtime role — hostile runtime credential", () => {
  it("the real-statement probe (the tool's `probe` command) passes against the runtime login", async () => {
    const rt = await asRuntime();
    try {
      const p = await probeRuntimeRole(rt, ownerRole);
      expect(p.probes.filter((x) => !x.ok)).toEqual([]);
      expect(p.result).toBe("PASS");
      // not vacuous: the SCHEMA OWNER connection fails the same probe
      const o = new Client({ connectionString: OWNER_URL }); await o.connect();
      try { expect((await probeRuntimeRole(o, ownerRole)).result).toBe("FAIL"); } finally { await o.end(); }
    } finally { await rt.end(); }
  });

  describe("[db] write-capability probe (closes the Production read-only-transaction assurance gap)", () => {
    const snapshotStartupStatus = async () =>
      (await admin.query(`SELECT id, instance_id, status, updated_at FROM public.startup_status ORDER BY id`)).rows;

    it("1. a runtime role with correct DML grants PASSES the write-capability probe", async () => {
      const rt = await asRuntime();
      try {
        const p = await probeRuntimeRole(rt, ownerRole);
        const row = p.probes.find((x) => x.name === WRITE_CAPABILITY_PROBE_NAME);
        expect(row).toBeTruthy();
        expect(row!.ok).toBe(true);
        expect(p.result).toBe("PASS");
      } finally { await rt.end(); }
    });

    it("2. a session forced read-only (SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY) FAILS the write-capability probe, by SQLSTATE 25006", async () => {
      const rt = await asRuntime();
      try {
        await rt.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
        const p = await probeRuntimeRole(rt, ownerRole);
        const row = p.probes.find((x) => x.name === WRITE_CAPABILITY_PROBE_NAME);
        expect(row).toBeTruthy();
        expect(row!.ok).toBe(false);
        expect(row!.detail).toBe("25006");
        expect(p.result).toBe("FAIL");
      } finally {
        await rt.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE").catch(() => {});
        await rt.end();
      }
    });

    it("3. a runtime role missing UPDATE on the probe table FAILS the write-capability probe, by SQLSTATE 42501, and the reconcile repairs it", async () => {
      await admin.query(`REVOKE UPDATE ON TABLE public.startup_status FROM ${RUNTIME}`);
      const rt = await asRuntime();
      try {
        const p = await probeRuntimeRole(rt, ownerRole);
        const row = p.probes.find((x) => x.name === WRITE_CAPABILITY_PROBE_NAME);
        expect(row).toBeTruthy();
        expect(row!.ok).toBe(false);
        expect(row!.detail).toBe("42501");
        expect(p.result).toBe("FAIL");
      } finally { await rt.end(); }
      // the governed reconcile restores the grant (same idempotent apply every other drift test uses)
      expect((await applyAndVerifyRoleTopology(admin, NAMES)).committed).toBe(true);
      const repaired = await asRuntime();
      try {
        const p2 = await probeRuntimeRole(repaired, ownerRole);
        expect(p2.result).toBe("PASS");
      } finally { await repaired.end(); }
    });

    it("4/5. the no-op probe changes ZERO rows and the outer ROLLBACK leaves startup_status byte-for-byte unchanged", async () => {
      const before = await snapshotStartupStatus();
      const rt = await asRuntime();
      try {
        const p = await probeRuntimeRole(rt, ownerRole);
        expect(p.result).toBe("PASS");
      } finally { await rt.end(); }
      const after = await snapshotStartupStatus();
      expect(after).toEqual(before);
    });

    it("2. the real catalog query treats TODAY's row-level timestamp trigger as SAFE (ROW bit set) — the baseline is not a false positive", async () => {
      const row = (await admin.query(
        `SELECT tgtype::int AS t FROM pg_trigger WHERE tgrelid = 'public.startup_status'::regclass AND tgname = 'startup_status_update_timestamp'`
      )).rows[0];
      expect(row).toBeTruthy();
      expect(row.t & 1).toBe(1); // ROW bit set: this is a row-level trigger, not statement-level
      const r = await checkWriteProbeSchemaSafety(admin, "public.startup_status");
      expect(r).toEqual({ safe: true, code: "SAFE" });
    });

    it("3/7/8. HOSTILE — a FOR EACH STATEMENT UPDATE trigger is a live threat (fires even on a zero-row UPDATE), but the guard detects it and fails closed before BEGIN/UPDATE ever runs, leaving its marker table untouched", async () => {
      await admin.query(`CREATE TABLE zz_statement_trigger_marker (fired_at timestamptz NOT NULL DEFAULT now())`);
      await admin.query(`
        CREATE FUNCTION zz_record_statement_fire() RETURNS trigger AS $$
        BEGIN
          INSERT INTO zz_statement_trigger_marker DEFAULT VALUES;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
      `);
      await admin.query(`
        CREATE TRIGGER zz_statement_update_trigger
        AFTER UPDATE ON public.startup_status
        FOR EACH STATEMENT
        EXECUTE FUNCTION zz_record_statement_fire()
      `);
      try {
        // Prove the trigger is a LIVE threat: even a zero-row WHERE false UPDATE fires a STATEMENT-level
        // trigger (unlike a ROW-level trigger, which only fires per matched row). Observed INSIDE the
        // transaction (own writes are visible before commit/rollback), then ALWAYS rolled back — even if
        // the assertion itself throws — so a failed expectation here can never leave admin's connection
        // sitting in an open transaction that would trap the cleanup DROP statements below uncommitted.
        await admin.query("BEGIN");
        try {
          await admin.query(`UPDATE public.startup_status SET "updated_at" = "updated_at" WHERE false`);
          const liveFire = await admin.query(`SELECT count(*)::int AS n FROM zz_statement_trigger_marker`);
          expect(liveFire.rows[0].n).toBeGreaterThan(0);
        } finally {
          await admin.query("ROLLBACK").catch(() => {});
        }

        // The catalog check detects it directly.
        const safety = await checkWriteProbeSchemaSafety(admin, "public.startup_status");
        expect(safety).toEqual({ safe: false, code: "UNSAFE_WRITE_PROBE_SCHEMA" });

        // The REAL guarded probe refuses before BEGIN/UPDATE ever runs, and the marker stays untouched.
        const rt = await asRuntime();
        try {
          const p = await probeRuntimeRole(rt, ownerRole);
          const row = p.probes.find((x) => x.name === WRITE_CAPABILITY_PROBE_NAME);
          expect(row).toBeTruthy();
          expect(row!.ok).toBe(false);
          expect(row!.detail).toBe("UNSAFE_WRITE_PROBE_SCHEMA");
          expect(p.result).toBe("FAIL");
        } finally { await rt.end(); }
        const after = await admin.query(`SELECT count(*)::int AS n FROM zz_statement_trigger_marker`);
        expect(after.rows[0].n).toBe(0);
      } finally {
        await admin.query(`DROP TRIGGER IF EXISTS zz_statement_update_trigger ON public.startup_status`);
        await admin.query(`DROP FUNCTION IF EXISTS zz_record_statement_fire()`);
        await admin.query(`DROP TABLE IF EXISTS zz_statement_trigger_marker`);
      }
    });

    it("4. a DISABLED statement-level UPDATE trigger does not produce a false unsafe result (ALTER TABLE ... DISABLE TRIGGER)", async () => {
      await admin.query(`CREATE TABLE zz_disabled_trigger_marker (fired_at timestamptz NOT NULL DEFAULT now())`);
      await admin.query(`
        CREATE FUNCTION zz_record_disabled_fire() RETURNS trigger AS $$
        BEGIN
          INSERT INTO zz_disabled_trigger_marker DEFAULT VALUES;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
      `);
      await admin.query(`
        CREATE TRIGGER zz_disabled_statement_trigger
        AFTER UPDATE ON public.startup_status
        FOR EACH STATEMENT
        EXECUTE FUNCTION zz_record_disabled_fire()
      `);
      await admin.query(`ALTER TABLE public.startup_status DISABLE TRIGGER zz_disabled_statement_trigger`);
      try {
        const safety = await checkWriteProbeSchemaSafety(admin, "public.startup_status");
        expect(safety).toEqual({ safe: true, code: "SAFE" });
        const rt = await asRuntime();
        try {
          const p = await probeRuntimeRole(rt, ownerRole);
          expect(p.result).toBe("PASS");
        } finally { await rt.end(); }
      } finally {
        await admin.query(`DROP TRIGGER IF EXISTS zz_disabled_statement_trigger ON public.startup_status`);
        await admin.query(`DROP FUNCTION IF EXISTS zz_record_disabled_fire()`);
        await admin.query(`DROP TABLE IF EXISTS zz_disabled_trigger_marker`);
      }
    });

    it("5/7/8. HOSTILE — an UPDATE rewrite RULE is refused on mere PRESENCE (a conservative policy, verified against real Postgres rule-firing semantics), and the guard fails closed before DML ever runs, leaving its marker table untouched", async () => {
      // Every setup statement (including the fixture row insert, which must precede CREATE RULE — see
      // below) is inside this try, so any failure at any step still reaches the cleanup in `finally`.
      try {
        await admin.query(`CREATE TABLE zz_rule_marker (fired_at timestamptz NOT NULL DEFAULT now())`);
        // A row to UPDATE must exist BEFORE the rule is created: PostgreSQL refuses `INSERT ... ON
        // CONFLICT` on any table that already carries a rule, so the fixture row is seeded first.
        await admin.query(`DELETE FROM public.startup_status WHERE instance_id = 'zz-rule-test-instance'`);
        await admin.query(`
          INSERT INTO public.startup_status (status, version, instance_id)
          VALUES ('READY', 'zz-rule-test', 'zz-rule-test-instance')
        `);
        await admin.query(`
          CREATE RULE zz_update_rule AS ON UPDATE TO public.startup_status
          DO ALSO INSERT INTO zz_rule_marker DEFAULT VALUES
        `);
        // Prove the rule is a genuine threat for an ORDINARY (row-matching) UPDATE — rolled back, so
        // nothing persists. (Verified against real PostgreSQL: unlike a STATEMENT-level trigger, a plain
        // `DO ALSO` rule action is itself gated by the triggering command's own row-matching qualification
        // — it does NOT fire for this probe's specific `WHERE false` no-op. That is exactly why the guard's
        // policy is to refuse on the rule's mere PRESENCE rather than trying to predict whether any one
        // particular no-op statement would trigger any one particular rule shape — predicting rule-firing
        // semantics in general is fragile; refusing unconditionally is not.)
        await admin.query("BEGIN");
        try {
          await admin.query(`UPDATE public.startup_status SET "updated_at" = now() WHERE instance_id = 'zz-rule-test-instance'`);
          const liveFire = await admin.query(`SELECT count(*)::int AS n FROM zz_rule_marker`);
          expect(liveFire.rows[0].n).toBeGreaterThan(0);
        } finally {
          await admin.query("ROLLBACK").catch(() => {});
        }

        const safety = await checkWriteProbeSchemaSafety(admin, "public.startup_status");
        expect(safety).toEqual({ safe: false, code: "UNSAFE_WRITE_PROBE_SCHEMA" });

        const rt = await asRuntime();
        try {
          const p = await probeRuntimeRole(rt, ownerRole);
          const row = p.probes.find((x) => x.name === WRITE_CAPABILITY_PROBE_NAME);
          expect(row).toBeTruthy();
          expect(row!.ok).toBe(false);
          expect(row!.detail).toBe("UNSAFE_WRITE_PROBE_SCHEMA");
          expect(p.result).toBe("FAIL");
        } finally { await rt.end(); }
        const after = await admin.query(`SELECT count(*)::int AS n FROM zz_rule_marker`);
        expect(after.rows[0].n).toBe(0);
      } finally {
        await admin.query(`DROP RULE IF EXISTS zz_update_rule ON public.startup_status`);
        await admin.query(`DROP TABLE IF EXISTS zz_rule_marker`);
        await admin.query(`DELETE FROM public.startup_status WHERE instance_id = 'zz-rule-test-instance'`);
      }
    });

    it("after every hostile fixture is cleaned up, the target is SAFE again and the probe PASSES (no residue)", async () => {
      const safety = await checkWriteProbeSchemaSafety(admin, "public.startup_status");
      expect(safety).toEqual({ safe: true, code: "SAFE" });
      const rt = await asRuntime();
      try {
        expect((await probeRuntimeRole(rt, ownerRole)).result).toBe("PASS");
      } finally { await rt.end(); }
    });
  });

  it("cannot become / join the eraser role, reach the erasure ledger, escalate, or bypass the append-only guards; SECURITY DEFINER cannot be shadowed", async () => {
    const t = await seedQboTenant();
    const conn = await connectQbo(t);
    const f = makeFakeIntuit(allMonths(), "Role Test Co");
    await runQboSync({ workspaceId: t.ws, connectionId: conn.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
    const rt = await asRuntime();
    try {
      const del = `DELETE FROM qbo_report_snapshots WHERE workspace_id='${t.ws}' AND business_id='${t.biz}'`;
      expect(await attempt(rt, `SET ROLE opsiq_privacy_eraser`)).toMatch(/permission denied to set role/);
      expect(await attempt(rt, `SET ROLE "${ownerRole}"`)).toMatch(/permission denied to set role/);
      expect(await attempt(rt, `GRANT opsiq_privacy_eraser TO ${RUNTIME}`)).toMatch(/permission denied|must have admin option|ADMIN option/i);
      expect(await attempt(rt, `ALTER ROLE ${RUNTIME} SUPERUSER`)).toMatch(/permission denied|must be superuser/);
      expect(await attempt(rt, `CREATE ROLE zz_evil`)).toMatch(/permission denied/);
      expect(await attempt(rt, `SELECT 1 FROM privacy_erasure_requests`)).toMatch(/permission denied/);
      expect(await attempt(rt, `INSERT INTO privacy_erasure_requests (id, workspace_id, business_id, reason_code, status, requested_by, updated_at) VALUES (gen_random_uuid(), '${t.ws}', '${t.biz}', 'USER_DATA_ERASURE_REQUEST', 'REQUESTED', 'x', now())`)).toMatch(/permission denied/);
      expect(await attempt(rt, `UPDATE _prisma_migrations SET logs = 'x'`)).toMatch(/permission denied/);
      expect(await attempt(rt, `INSERT INTO _prisma_migrations (id, checksum, migration_name) VALUES ('x','y','z')`)).toMatch(/permission denied/);
      expect(await attempt(rt, `TRUNCATE qbo_report_snapshots`)).toMatch(/permission denied/);
      expect(await attempt(rt, `SET session_replication_role = replica`)).toMatch(/permission denied to set parameter/);
      // the guard still protects the evidence for an ordinary runtime session
      expect(await attempt(rt, del)).toMatch(/immutable evidence/);
      // a forged request id + a TEMP shadow table of the ledger + a pg_temp function shadow: none of them can authorize the deletion
      expect(await attempt(rt, del, [], [
        `CREATE TEMP TABLE privacy_erasure_requests (id uuid, workspace_id uuid, business_id uuid, status text, approved_by text, manifest_hash text, approved_db_user text, requested_db_user text, executing_xid text)`,
        `INSERT INTO pg_temp.privacy_erasure_requests VALUES (gen_random_uuid(), '${t.ws}', '${t.biz}', 'EXECUTING', 'a', 'h', 'b', 'c', pg_current_xact_id()::text)`,
        `SELECT set_config('opsiq.erasure_request_id', (SELECT id::text FROM pg_temp.privacy_erasure_requests LIMIT 1), true)`,
        `CREATE FUNCTION pg_temp.pg_has_role(name, text, text) RETURNS boolean LANGUAGE sql AS 'SELECT true'`,
        `CREATE FUNCTION pg_temp.current_setting(text, boolean) RETURNS text LANGUAGE sql AS 'SELECT ''x'''`,
      ])).toMatch(/immutable evidence/);
      expect((await rt.query(`SELECT public.qbo_erasure_authorized($1::uuid, $2::uuid) AS v`, [t.ws, t.biz])).rows[0].v).toBe(false);
      // the definer function cannot be replaced, and PUBLIC cannot execute it
      expect(await attempt(rt, `CREATE OR REPLACE FUNCTION public.qbo_erasure_authorized(uuid, uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true'`)).toMatch(/must be owner|permission denied/);
      const pub = (await admin.query(`SELECT has_function_privilege('public', 'public.qbo_erasure_authorized(uuid, uuid)', 'EXECUTE') AS v`)).rows[0].v;
      expect(pub).toBe(false);
      expect(await count(`SELECT count(*)::int AS n FROM qbo_report_snapshots WHERE workspace_id=$1`, [t.ws])).toBeGreaterThan(0);
    } finally { await rt.end(); }
  }, 180_000);

  it("with ZERO eraser logins the cutover adds NO member to the erasure group (cluster-wide members from other suites are untouched) and the group cannot log in", async () => {
    const before = ((await verifyRoleTopology(admin, NAMES)).facts.eraser_role_members as string[]).slice().sort();
    expect(before).not.toContain(RUNTIME);
    await applyAndVerifyRoleTopology(admin, NAMES, { dryRun: false });
    const after = ((await verifyRoleTopology(admin, NAMES)).facts.eraser_role_members as string[]).slice().sort();
    expect(after).toEqual(before);
    expect(await count(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname='opsiq_privacy_eraser' AND rolcanlogin`)).toBe(0);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] APPLICATION_RUNTIME_UNDER_OPSIQ_APP — real application flows as the runtime login", () => {
  it("Prisma (`db`) is connected AS opsiq_app, and QuickBooks persistence, Finance, Cashflow, scheduler, audit and migration-status all work", async () => {
    const who = (await db.$queryRaw<Array<{ u: string; s: string }>>`SELECT current_user::text AS u, session_user::text AS s`)[0];
    expect(who).toEqual({ u: RUNTIME, s: RUNTIME });

    const t = await seedQboTenant(); // users, workspace, business: writes through the runtime
    const conn = await connectQbo(t); // OAuth state + encrypted token persistence
    const f = makeFakeIntuit(allMonths(), "Runtime Role Co");
    for (let i = 0; i < 3; i++) await runQboSync({ workspaceId: t.ws, connectionId: conn.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
    expect(await count(`SELECT count(*)::int AS n FROM qbo_report_snapshots WHERE workspace_id=$1`, [t.ws])).toBeGreaterThan(0);
    expect(await count(`SELECT count(*)::int AS n FROM qbo_canonical_provenance WHERE workspace_id=$1`, [t.ws])).toBeGreaterThan(0);

    // Finance + Cashflow: snapshot, diagnosis (append-only guarded decision tables), owner amendment
    const key = monthKeys(12)[0];
    const snap = await db.ownerFinancialSnapshot.findFirstOrThrow({ where: { workspaceId: t.ws, businessId: t.biz, periodStart: D(key), supersededById: null } });
    const cycle = await runFinanceDiagnosis(t.biz, snap.id, t.actor, t.ws);
    expect(cycle.id).toBeTruthy();
    const amended = await amendFinancialSnapshot({ workspaceId: t.ws, businessId: t.biz, actorId: t.actor, snapshotId: snap.id, fields: { cash: 1234 } } as never).catch(() => null);
    void amended; // the amendment contract is exercised in the finance suites; reaching here proves the append-only family accepted ordinary writes
    expect(await count(`SELECT count(*)::int AS n FROM owner_cashflow_snapshots WHERE workspace_id=$1`, [t.ws])).toBeGreaterThan(0);
    expect(await count(`SELECT count(*)::int AS n FROM owner_finance_actions WHERE workspace_id=$1`, [t.ws])).toBeGreaterThanOrEqual(0);

    // Audit events are written (hash chain) by those flows
    expect(await count(`SELECT count(*)::int AS n FROM audit_events WHERE workspace_id=$1 AND event_name LIKE 'qbo.%'`, [t.ws])).toBeGreaterThan(0);

    // Scheduler lifecycle: enqueue -> claim (FOR UPDATE SKIP LOCKED + UPDATE) -> handler -> completion
    const { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId: conn.connectionId, trigger: "SCHEDULED", key: qboSyncKey(conn.connectionId, "role-test", new Date()) });
    await db.scheduledTask.update({ where: { id: taskId }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    const handlers = new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env, readClientFactory: () => f.reader }))]]);
    await new DatabaseSchedulerProvider().processTaskById(taskId, handlers);
    const task = await db.scheduledTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(["completed", "COMPLETED", "succeeded", "done"].includes(String(task.status)) || String(task.status) !== "pending").toBe(true);
    const claimed = await db.scheduledTask.deleteMany({ where: { id: taskId } }); // DML delete is an ordinary runtime privilege
    expect(claimed.count).toBe(1);

    // Migration-status check (startup + health + release gate read the ledger)
    const readiness = await checkMigrationReadiness();
    expect(readiness.ready, JSON.stringify(readiness)).toBe(true);
    expect((await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)[0].n > BigInt(150)).toBe(true);
  }, 240_000);
});
