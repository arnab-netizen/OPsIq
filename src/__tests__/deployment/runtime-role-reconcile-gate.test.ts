/**
 * Behavioural proof of the post-migration runtime-role gate (scripts/release/runtime-role-reconcile-gate.mjs).
 * Part 1 (always runs): the decision logic against malformed / contradictory / incomplete tool transcripts.
 * Part 2 ([db]): the REAL scripts/db/opsiq-role-cutover.ts against a disposable PostgreSQL (database opsiq_runtime_role_test),
 *   run through the gate's own CLI wiring, never against production.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { spawnSync } from "child_process";
import { resolve } from "path";
// @ts-expect-error -- plain ESM script without type declarations
import { runReconcileGate, strictVerifyProblems, APPLY_CONFIRM_PHRASE } from "../../../scripts/release/runtime-role-reconcile-gate.mjs";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const SHA = "a".repeat(40);
const facts = { runtime_role_exists: true, runtime_owned_objects: 0, runtime_role_memberships: 0, public_table_grants_to_public: 0, grant_gap_tables: [], unclassified_tables: [] };
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

const OWNER_URL = process.env.ROLE_TEST_OWNER_DATABASE_URL ?? "";
const ON_DEDICATED_DB = /opsiq_runtime_role_test/.test(OWNER_URL);
const ROOT = resolve(__dirname, "../../..");
let admin: Client;
beforeAll(async () => { if (SHOULD_RUN_DB_TESTS && ON_DEDICATED_DB) { admin = new Client({ connectionString: OWNER_URL }); await admin.connect(); } });
afterAll(async () => { await admin?.end(); });

function realRun(stage: "pre" | "apply" | "post", extra: string[] = []): R {
  const base = ["tsx", "scripts/db/opsiq-role-cutover.ts"];
  const args = stage === "apply" ? ["apply", "--target", "ci", "--only-if-present", "--confirm", APPLY_CONFIRM_PHRASE] : ["verify", "--target", "ci", "--phase", "post"];
  const r = spawnSync("npx", [...base, ...args, ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, OWNER_DATABASE_URL: OWNER_URL, OPSIQ_DB_TARGET: "ci" } });
  return { exitCode: r.status, output: `${r.stdout}\n${r.stderr}` };
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

  it("the CLI exits non-zero and prints BLOCKED on a stale SHA, and never reaches the database", () => {
    const r = spawnSync("node", ["scripts/release/runtime-role-reconcile-gate.mjs"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, EXPECTED_RELEASE_SHA: "c".repeat(40), OPSIQ_RECONCILE_TARGET: "ci" } });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("RUNTIME_ROLE_GATE=BLOCKED");
    expect(r.stdout).toContain("STALE_OR_UNPINNED_RELEASE_SHA");
  });
});
