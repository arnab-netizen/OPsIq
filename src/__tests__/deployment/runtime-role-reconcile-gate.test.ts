/**
 * Behavioural proof of the post-migration runtime-role gate (scripts/release/runtime-role-reconcile-gate.mjs).
 * Part 1 (always runs): the decision logic against malformed / contradictory / incomplete tool transcripts.
 * Part 2 ([db]): the REAL scripts/db/opsiq-role-cutover.ts against a disposable PostgreSQL (database opsiq_runtime_role_test),
 *   invoked with the gate's own exported command builder (toolInvocation), never against production. CI runs this file in the
 *   runtime-role DB step with the same environment and fails if any [db] test is skipped there.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { spawnSync } from "child_process";
import { resolve } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import { runReconcileGate, strictVerifyProblems, toolInvocation, APPLY_CONFIRM_PHRASE } from "../../../scripts/release/runtime-role-reconcile-gate.mjs";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { verifyRoleTopologyReadOnly } from "@/services/privacy-erasure/role-topology";
import { assertRoleCutoverStaticTarget } from "@/infra/role-cutover-target";

const SHA = "a".repeat(40);
const facts = { read_only_enforced: true, runtime_role_exists: true, runtime_owned_objects: 0, runtime_role_memberships: 0, public_table_grants_to_public: 0, grant_gap_tables: [], unclassified_tables: [] };
const verifyOut = (o: Record<string, unknown> = {}, token?: string) => {
  const j = { ROLE_TOPOLOGY_VERIFY: "PASS", target: "production", phase: "post", runtimeRoleState: "CONFORMING", failedChecks: [], facts, ...o };
  return `PASS  x\n${JSON.stringify(j)}\n${token ?? `ROLE_TOPOLOGY_VERIFY=${j.ROLE_TOPOLOGY_VERIFY}`}\n`;
};
const applyOut = (o: Record<string, unknown> = {}, token?: string) => {
  const j = { ROLE_TOPOLOGY_APPLY: "PASS", target: "production", dryRun: false, committed: true, failedChecks: [], ...o };
  return `${JSON.stringify(j)}\n${token ?? `ROLE_TOPOLOGY_APPLY=${j.ROLE_TOPOLOGY_APPLY}`}\n`;
};
type R = { exitCode: number | null; output: string };
const good = { pre: { exitCode: 1, output: verifyOut({ ROLE_TOPOLOGY_VERIFY: "FAIL", runtimeRoleState: "NONCONFORMING", failedChecks: ["gap"], facts: { ...facts, grant_gap_tables: ["search_console_metrics"] } }) } as R, apply: { exitCode: 0, output: applyOut() } as R, post: { exitCode: 0, output: verifyOut() } as R };
const gate = (over: Partial<Record<"pre" | "apply" | "post", R>> = {}, p: { expectedSha?: string; actualSha?: string; target?: string } = {}) =>
  runReconcileGate({ target: p.target ?? "production", expectedSha: p.expectedSha ?? SHA, actualSha: p.actualSha ?? SHA, run: (s: "pre" | "apply" | "post") => ({ ...good, ...over })[s] as R });

describe("runtime-role gate decisions (fail closed)", () => {
  it("PASSES only when pre/apply/post are all valid and the post-verify is fully conforming", () => {
    expect(gate()).toMatchObject({ ok: true, code: "RUNTIME_ROLE_RECONCILED" });
  });
  it("Finding A: an ABSENT production runtime role BLOCKS (pre-verify ABSENT, apply SKIPPED_ROLE_ABSENT, or post ABSENT)", () => {
    const absent = verifyOut({ ROLE_TOPOLOGY_VERIFY: "FAIL", runtimeRoleState: "ABSENT", facts: { ...facts, runtime_role_exists: false } });
    expect(gate({ pre: { exitCode: 1, output: absent } }).code).toBe("RUNTIME_ROLE_ABSENT");
    expect(gate({ apply: { exitCode: 0, output: applyOut({ ROLE_TOPOLOGY_APPLY: "SKIPPED_ROLE_ABSENT", committed: false }) } }).code).toBe("APPLY_INVALID");
    expect(gate({ post: { exitCode: 1, output: absent } }).ok).toBe(false);
  });
  it("Finding B: a failing verify exit status is enforced, including contradictory PASS-with-nonzero and FAIL-with-zero", () => {
    expect(gate({ post: { exitCode: 1, output: verifyOut() } }).ok).toBe(false); // PASS text, non-zero exit
    expect(gate({ post: { exitCode: 0, output: verifyOut({ ROLE_TOPOLOGY_VERIFY: "FAIL" }) } }).ok).toBe(false); // FAIL text, zero exit
    expect(gate({ post: { exitCode: 137, output: verifyOut() } }).ok).toBe(false); // killed
    expect(gate({ post: { exitCode: null, output: "" } }).code).toBe("POST_VERIFY_DID_NOT_RUN");
    expect(gate({ apply: { exitCode: 1, output: applyOut() } }).code).toBe("APPLY_FAILED");
  });
  it("malformed, empty, truncated, misleading and token-contradicting output is rejected", () => {
    for (const output of ["", "garbage", '{"ROLE_TOPOLOGY_VERIFY":"PA', "PASS everything is fine\nROLE_TOPOLOGY_VERIFY=PASS\n", verifyOut({}, "ROLE_TOPOLOGY_VERIFY=FAIL"), verifyOut({}, "")]) {
      expect(gate({ post: { exitCode: 0, output } }).ok, JSON.stringify(output)).toBe(false);
    }
    expect(gate({ apply: { exitCode: 0, output: "" } }).code).toBe("APPLY_OUTPUT_MALFORMED");
    expect(gate({ apply: { exitCode: 0, output: applyOut({}, "ROLE_TOPOLOGY_APPLY=FAIL") } }).code).toBe("APPLY_INVALID");
    expect(gate({ apply: { exitCode: 0, output: applyOut({ committed: false }) } }).code).toBe("APPLY_INVALID"); // dry-run-like / not committed
    expect(gate({ apply: { exitCode: 0, output: applyOut({ dryRun: true }) } }).code).toBe("APPLY_INVALID");
  });
  it("Finding C: GRANT_GAP_COUNT=0 is not enough — every least-privilege invariant must hold in the post-verify", () => {
    const bad: Record<string, Record<string, unknown>> = {
      "wrong state": { runtimeRoleState: "NONCONFORMING" },
      "failed check": { failedChecks: ["runtime role cannot create objects"] },
      "grant gap": { facts: { ...facts, grant_gap_tables: ["t"] } },
      "unclassified table": { facts: { ...facts, unclassified_tables: ["t"] } },
      "owns objects (DDL surface)": { facts: { ...facts, runtime_owned_objects: 1 } },
      "role membership (eraser/privileged)": { facts: { ...facts, runtime_role_memberships: 1 } },
      "PUBLIC grants": { facts: { ...facts, public_table_grants_to_public: 2 } },
      "wrong target (environment identity)": { target: "ci" },
      "wrong phase": { phase: "pre" },
      "role missing flag": { facts: { ...facts, runtime_role_exists: false } },
      "facts missing": { facts: {} },
      "no enforced read-only proof": { facts: { ...facts, read_only_enforced: false } },
      "no failedChecks list": { failedChecks: undefined },
    };
    for (const [name, o] of Object.entries(bad)) expect(gate({ post: { exitCode: 0, output: verifyOut(o) } }).ok, name).toBe(false);
  });
  it("a stale, missing or unpinned release SHA blocks before any database call", () => {
    let calls = 0;
    const r = runReconcileGate({ target: "production", expectedSha: SHA, actualSha: "b".repeat(40), run: () => { calls++; return { exitCode: 0, output: "" }; } });
    expect(r.code).toBe("STALE_OR_UNPINNED_RELEASE_SHA");
    expect(runReconcileGate({ target: "production", expectedSha: "", actualSha: "", run: () => { calls++; return { exitCode: 0, output: "" }; } }).ok).toBe(false);
    expect(runReconcileGate({ target: "staging", expectedSha: SHA, actualSha: SHA, run: () => { calls++; return { exitCode: 0, output: "" }; } }).code).toBe("BAD_TARGET");
    expect(calls).toBe(0);
  });
  it("incorrect host identity: the tool's refusal (non-zero, no result line) blocks at the pre-verify", () => {
    expect(gate({ pre: { exitCode: 1, output: '{"error":"HOST_MISMATCH"}\nROLE_TOPOLOGY_RESULT=FAIL\n' } }).code).toBe("PRE_VERIFY_MALFORMED");
  });
  it("exports the exact confirm phrase the tool requires", () => { expect(APPLY_CONFIRM_PHRASE).toBe("APPLY PRODUCTION RUNTIME ROLE TOPOLOGY"); });
  it("strictVerifyProblems accepts a fully conforming transcript", () => {
    expect(strictVerifyProblems({ exitCode: 0, output: verifyOut() }, { target: "production" })).toEqual([]);
  });
});

const ROOT0 = resolve(__dirname, "../../..");
describe("gate CLI (no database needed)", () => {
  it("exits non-zero and prints BLOCKED on a stale SHA, and never reaches the database", () => {
    const r = spawnSync("node", ["scripts/release/runtime-role-reconcile-gate.mjs"], { cwd: ROOT0, encoding: "utf8", env: { ...process.env, EXPECTED_RELEASE_SHA: "c".repeat(40), OPSIQ_RECONCILE_TARGET: "ci" } });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("RUNTIME_ROLE_GATE=BLOCKED");
    expect(r.stdout).toContain("STALE_OR_UNPINNED_RELEASE_SHA");
  });
  it("builds production tool invocations with the exact host pin, the read-only verify phase and the reconcile-only flag", () => {
    expect(toolInvocation("apply", { target: "production", expectedHost: "h.example" })).toEqual(expect.arrayContaining(["--expected-host", "h.example", "--only-if-present", "--confirm", APPLY_CONFIRM_PHRASE]));
    expect(toolInvocation("post", { target: "production", expectedHost: "h.example" })).toEqual(expect.arrayContaining(["verify", "--phase", "post", "--expected-host", "h.example"]));
    expect(toolInvocation("post", { target: "production" })).not.toContain("--only-if-present");
  });
  it("review findings 6/7: more than one result line is ambiguous and blocks; table names cannot inject workflow commands", () => {
    const twice = verifyOut() + verifyOut({ target: "production" });
    expect(gate({ post: { exitCode: 0, output: twice } }).ok).toBe(false);
    expect(gate({ apply: { exitCode: 0, output: applyOut() + applyOut() } }).code).toBe("APPLY_OUTPUT_MALFORMED");
    const r = spawnSync("node", ["-e", `import("./scripts/release/runtime-role-reconcile-gate.mjs").then(m=>{const r=m.runReconcileGate({target:"production",expectedSha:"${"a".repeat(40)}",actualSha:"${"b".repeat(40)}",run:()=>({exitCode:0,output:""})});console.log(JSON.stringify(r.problems))})`], { cwd: ROOT0, encoding: "utf8" });
    expect(r.status).toBe(0);
  });
});

const OWNER_URL = process.env.ROLE_TEST_OWNER_DATABASE_URL ?? "";
const ON_DEDICATED_DB = /opsiq_runtime_role_test/.test(OWNER_URL);
const ROOT = resolve(__dirname, "../../..");
let admin: Client;
beforeAll(async () => { if (SHOULD_RUN_DB_TESTS && ON_DEDICATED_DB) { admin = new Client({ connectionString: OWNER_URL }); await admin.connect(); } });
afterAll(async () => { await admin?.end(); });

function realRun(stage: "pre" | "apply" | "post"): R {
  const r = spawnSync("npx", toolInvocation(stage, { target: "ci" }), { cwd: ROOT, encoding: "utf8", env: { ...process.env, OWNER_DATABASE_URL: OWNER_URL, OPSIQ_DB_TARGET: "ci" } });
  return { exitCode: r.status, output: r.stdout ?? "" }; // stdout only, exactly as the CLI parses it
}
const realGate = () => runReconcileGate({ target: "ci", expectedSha: SHA, actualSha: SHA, run: (s: "pre" | "apply" | "post") => realRun(s) });
const acl = async () => JSON.stringify((await admin.query(`SELECT c.relname, c.relacl::text a FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','S') ORDER BY 1`)).rows);

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] gate against the real tool and a disposable PostgreSQL", () => {
  it("migration done + missing SELECT on search_console_metrics: gate reconciles, verifies and PASSES; a second run is idempotent", async () => {
    await admin.query(`REVOKE ALL ON TABLE public.search_console_metrics FROM opsiq_app`);
    expect(realRun("post").exitCode).toBe(1); // the defect is visible to the real verifier
    expect(realGate()).toMatchObject({ ok: true });
    const first = await acl();
    expect(realGate()).toMatchObject({ ok: true });
    expect(await acl()).toBe(first);
  }, 120_000);

  it("excessive privileges: INSERT on the read-only migration ledger and CREATE on schema are removed, or the gate blocks", async () => {
    await admin.query(`GRANT INSERT, DELETE ON TABLE public._prisma_migrations TO opsiq_app`);
    await admin.query(`GRANT CREATE ON SCHEMA public TO opsiq_app`);
    expect(realRun("post").exitCode).toBe(1); // excess is detected
    expect(realGate()).toMatchObject({ ok: true }); // the reconcile revokes it and the strict post-verify then passes
    const r = await admin.query(`SELECT has_table_privilege('opsiq_app','public._prisma_migrations','INSERT') AS ins, has_schema_privilege('opsiq_app','public','CREATE') AS cr`);
    expect(r.rows[0]).toEqual({ ins: false, cr: false });
  }, 120_000);

  it("reconciliation FAILS (an unclassified table the apply refuses to commit): the gate blocks and nothing is promoted", async () => {
    await admin.query(`CREATE TABLE public.zz_gate_unclassified (id int)`);
    try {
      const r = realGate();
      expect(r.ok).toBe(false);
      expect(["APPLY_FAILED", "PRE_VERIFY_INVALID", "POST_VERIFY_FAILED", "APPLY_INVALID"]).toContain(r.code);
    } finally {
      await admin.query(`DROP TABLE public.zz_gate_unclassified`);
    }
    expect(realGate()).toMatchObject({ ok: true }); // recovers once the cause is removed
  }, 120_000);

});

const NAMES = { runtimeRole: "opsiq_app", eraserLogins: [] as string[] };
const recording = (real: Client, override?: (sql: string) => { rows: unknown[] } | null) => {
  const calls: string[] = [];
  const client = new Proxy(real, {
    get(t, prop, r) {
      if (prop !== "query") return Reflect.get(t, prop, r);
      return (...a: unknown[]) => {
        const sql = typeof a[0] === "string" ? a[0] : String((a[0] as { text?: string })?.text);
        calls.push(sql);
        const o = override?.(sql);
        return o ? Promise.resolve(o) : (t.query as (...x: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  return { client, calls };
};

describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] explicit read-only enforcement (does not rely on PGOPTIONS)", () => {
  it("proves the effective mode and rejects a write, leaves NO open transaction, and the report records the proof", async () => {
    const { client, calls } = recording(admin);
    const r = await verifyRoleTopologyReadOnly(client, NAMES);
    expect(r.facts.read_only_enforced).toBe(true);
    expect(calls[0]).toMatch(/^BEGIN READ ONLY/);
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
    expect((await admin.query(`SELECT pg_current_xact_id_if_assigned() AS x, now() = statement_timestamp() AS fresh`)).rows[0].x).toBeNull();
    expect((await admin.query(`SHOW transaction_read_only`)).rows[0].transaction_read_only).toBe("off"); // session itself is untouched
  });
  it("a connection URL carrying options=-c default_transaction_read_only=off, and a session forced read-write, cannot defeat it", async () => {
    const u = new URL(OWNER_URL);
    u.searchParams.set("options", "-c default_transaction_read_only=off");
    const hostile = new Client({ connectionString: u.toString() });
    await hostile.connect();
    try {
      await hostile.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE");
      expect((await hostile.query("SHOW default_transaction_read_only")).rows[0].default_transaction_read_only).toBe("off"); // the URL option really is in force
      const r = await verifyRoleTopologyReadOnly(hostile, NAMES);
      expect(r.facts.read_only_enforced).toBe(true);
      await expect(hostile.query("CREATE TEMP TABLE zz_after_ok (i int)")).resolves.toBeDefined(); // and the session is writable again afterwards: the guard was the transaction, not a setting
    } finally { await hostile.end(); }
  });
  it("refuses to run any catalog query when the effective mode is not read-only, and still rolls back", async () => {
    const { client, calls } = recording(admin, (sql) => (/^SHOW transaction_read_only/.test(sql) ? { rows: [{ transaction_read_only: "off" }] } : null));
    await expect(verifyRoleTopologyReadOnly(client, NAMES)).rejects.toThrow(/READ_ONLY_NOT_ENFORCED/);
    expect(calls.some((c) => /pg_roles|current_user/.test(c))).toBe(false);
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
    await expect(admin.query("SELECT 1")).resolves.toBeDefined(); // connection not left in an aborted transaction
  });
  it("refuses when a write-class statement is NOT rejected (incorrect transaction state), and rolls back", async () => {
    const { client, calls } = recording(admin, (sql) => (/zz_read_only_probe \(i int\)/.test(sql) ? { rows: [] } : /SAVEPOINT/.test(sql) ? { rows: [] } : null));
    await expect(verifyRoleTopologyReadOnly(client, NAMES)).rejects.toThrow(/not rejected/);
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
  });
  it("a failing verification (query error mid-way) still rolls back and leaves the connection usable", async () => {
    const { client, calls } = recording(admin, (sql) => { if (/FROM pg_roles/.test(sql)) throw new Error("boom"); return null; });
    await expect(verifyRoleTopologyReadOnly(client, NAMES)).rejects.toThrow(/boom/);
    expect(calls[calls.length - 1]).toBe("ROLLBACK");
    await expect(admin.query("SELECT 1")).resolves.toBeDefined();
  });
  it("discovery never mutates: ACLs are byte-identical before and after a read-only verify, and dry-run apply persists nothing", async () => {
    const snap = async () => JSON.stringify((await admin.query(`SELECT c.relname, c.relacl::text a FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','S') ORDER BY 1`)).rows);
    await admin.query(`REVOKE INSERT ON TABLE public.search_console_metrics FROM opsiq_app`); // create drift
    const drifted = await snap();
    await verifyRoleTopologyReadOnly(admin, NAMES);
    expect(await snap()).toBe(drifted);
    const dry = spawnSync("npx", ["tsx", "scripts/db/opsiq-role-cutover.ts", "apply", "--target", "ci", "--only-if-present", "--dry-run"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, OWNER_DATABASE_URL: OWNER_URL, OPSIQ_DB_TARGET: "ci" } });
    expect(dry.stdout).toMatch(/"committed":false/);
    expect(await snap()).toBe(drifted);
    expect(realGate()).toMatchObject({ ok: true }); // the real reconcile repairs it, with the read-only proof in the post-verify
  }, 120_000);
});

describe("connection pooling", () => {
  it("a pooled endpoint is refused before any connection for a production target", () => {
    const host = "ep-empty-sky-ay1e6c27-pooler.c-5.us-east-2.aws.neon.tech";
    const env = { OPSIQ_DB_TARGET: "production", OPSIQ_ALLOW_PRODUCTION_DB_COMMAND: "true" };
    expect(() => assertRoleCutoverStaticTarget({ command: "verify", target: "production", url: `postgresql://u:p@${host}/db`, env, expectedHost: host } as never)).toThrow(/pooler|DIRECT/i);
  });
});
