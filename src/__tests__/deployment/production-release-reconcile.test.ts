/**
 * Scheduled production reconcile: exact-SHA deployment decision, ledger-driven read-only plan, gate drift mode,
 * and the workflow's trust model (real YAML, nothing mocked). [db] tests run in CI's runtime-role DB step with nothing skipped.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, resolve } from "path";
import YAML from "js-yaml";
import { Client } from "pg";
// @ts-expect-error -- plain ESM script without type declarations
import { decideRedeploy, collectDeployments, MAX_FAILURES_PER_SHA } from "../../../scripts/release/redeploy-decision.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { runReconcileGate } from "../../../scripts/release/runtime-role-reconcile-gate.mjs";
import { computeReleasePlan } from "../../../scripts/release/release-plan-cli";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const ROOT = resolve(__dirname, "../../..");
const SHA = "a".repeat(40);
const NOW = 1_800_000_000_000;
const dep = (o: Partial<{ sha: string; environment: string; createdAtMs: number; state: string }> = {}) => ({ sha: SHA, environment: "Production", createdAtMs: NOW - 3_600_000, state: "failure", ...o });

describe("exact-SHA redeploy decision (bounded)", () => {
  it("NONE only when THIS exact sha has a successful PRODUCTION build; other SHAs and preview builds never count", () => {
    expect(decideRedeploy({ releaseSha: SHA, deployments: [dep({ state: "success" })], nowMs: NOW }).action).toBe("NONE");
    expect(decideRedeploy({ releaseSha: SHA, deployments: [dep({ sha: "b".repeat(40), state: "success" })], nowMs: NOW }).action).toBe("REDEPLOY");
    expect(decideRedeploy({ releaseSha: SHA, deployments: [dep({ environment: "Preview", state: "success" })], nowMs: NOW }).action).toBe("REDEPLOY");
  });
  it("WAITs while a build of this sha is in flight (no duplicate deployment), but a stale in-flight record does not block forever", () => {
    expect(decideRedeploy({ releaseSha: SHA, deployments: [dep({ state: "in_progress", createdAtMs: NOW - 60_000 })], nowMs: NOW }).action).toBe("WAIT");
    expect(decideRedeploy({ releaseSha: SHA, deployments: [dep({ state: "pending", createdAtMs: NOW - 3 * 3_600_000 })], nowMs: NOW }).action).toBe("REDEPLOY");
  });
  it("REDEPLOYs after a failed build and when none is recorded; BLOCKs (no retry storm) after the failure budget", () => {
    expect(decideRedeploy({ releaseSha: SHA, deployments: [dep()], nowMs: NOW })).toMatchObject({ action: "REDEPLOY", code: "PREVIOUS_BUILD_FAILED" });
    expect(decideRedeploy({ releaseSha: SHA, deployments: [], nowMs: NOW })).toMatchObject({ action: "REDEPLOY", code: "NO_PRODUCTION_BUILD_RECORDED" });
    const many = Array.from({ length: MAX_FAILURES_PER_SHA }, () => dep());
    expect(decideRedeploy({ releaseSha: SHA, deployments: many, nowMs: NOW })).toMatchObject({ action: "BLOCK", code: "RETRY_BUDGET_EXHAUSTED" });
  });
  it("a malformed release sha blocks", () => {
    for (const bad of ["", "main", "A".repeat(40), "a".repeat(39)]) expect(decideRedeploy({ releaseSha: bad, deployments: [], nowMs: NOW }).action).toBe("BLOCK");
  });
  it("collectDeployments reads the latest status per deployment and ignores other SHAs", async () => {
    const calls: string[] = [];
    const fetchJson = async (path: string) => {
      calls.push(path);
      if (path.includes("/statuses")) return [{ state: "success" }];
      return [{ id: 1, sha: SHA, environment: "Production", created_at: "2026-11-19T00:00:00Z" }, { id: 2, sha: "c".repeat(40), environment: "Production", created_at: "2026-11-19T00:00:00Z" }];
    };
    const out = await collectDeployments({ fetchJson, repo: "o/r", sha: SHA });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ sha: SHA, environment: "Production", state: "success" });
    expect(calls.filter((c) => c.includes("/statuses"))).toHaveLength(1);
    await expect(collectDeployments({ fetchJson: async () => ({ message: "nope" }), repo: "o/r", sha: SHA })).rejects.toThrow();
  });
});

describe("gate drift mode (scheduled runs)", () => {
  const facts = { read_only_enforced: true, runtime_role_exists: true, runtime_owned_objects: 0, runtime_role_memberships: 0, public_table_grants_to_public: 0, grant_gap_tables: [], unclassified_tables: [] };
  const verify = (o: Record<string, unknown> = {}) => { const j = { ROLE_TOPOLOGY_VERIFY: "PASS", target: "production", phase: "post", runtimeRoleState: "CONFORMING", failedChecks: [], facts, ...o }; return `${JSON.stringify(j)}\nROLE_TOPOLOGY_VERIFY=${j.ROLE_TOPOLOGY_VERIFY}\n`; };
  it("a conforming role causes NO apply and no write at all", () => {
    const stages: string[] = [];
    const r = runReconcileGate({ target: "production", expectedSha: SHA, actualSha: SHA, onlyIfDrift: true, run: (s: string) => { stages.push(s); return { exitCode: 0, output: verify() }; } });
    expect(r).toMatchObject({ ok: true, code: "RUNTIME_ROLE_ALREADY_CONFORMING" });
    expect(stages).toEqual(["pre"]);
  });
  it("drift still runs the full reconcile and strict post-verify; absent role and stale SHA still block", () => {
    const drift = verify({ ROLE_TOPOLOGY_VERIFY: "FAIL", runtimeRoleState: "NONCONFORMING", failedChecks: ["gap"], facts: { ...facts, grant_gap_tables: ["t"] } });
    const stages: string[] = [];
    const ok = runReconcileGate({ target: "production", expectedSha: SHA, actualSha: SHA, onlyIfDrift: true, run: (s: string) => { stages.push(s); return s === "pre" ? { exitCode: 1, output: drift } : s === "apply" ? { exitCode: 0, output: `${JSON.stringify({ ROLE_TOPOLOGY_APPLY: "PASS", target: "production", dryRun: false, committed: true, failedChecks: [] })}\nROLE_TOPOLOGY_APPLY=PASS\n` } : { exitCode: 0, output: verify() }; } });
    expect(ok.ok).toBe(true);
    expect(stages).toEqual(["pre", "apply", "post"]);
    const absent = verify({ ROLE_TOPOLOGY_VERIFY: "FAIL", runtimeRoleState: "ABSENT", facts: { ...facts, runtime_role_exists: false } });
    expect(runReconcileGate({ target: "production", expectedSha: SHA, actualSha: SHA, onlyIfDrift: true, run: () => ({ exitCode: 1, output: absent }) }).code).toBe("RUNTIME_ROLE_ABSENT");
    expect(runReconcileGate({ target: "production", expectedSha: SHA, actualSha: "b".repeat(40), onlyIfDrift: true, run: () => ({ exitCode: 0, output: verify() }) }).code).toBe("STALE_OR_UNPINNED_RELEASE_SHA");
  });
});

describe("computeReleasePlan (read-only ledger plan)", () => {
  const fake = (rows: unknown[], mode = "on") => {
    const calls: string[] = [];
    return { calls, client: { query: async (sql: string) => { calls.push(sql); if (/^SHOW/.test(sql)) return { rows: [{ transaction_read_only: mode }] }; if (/_prisma_migrations/.test(sql)) return { rows }; return { rows: [] }; } } };
  };
  const dirWith = (names: string[]) => { const d = mkdtempSync(join(tmpdir(), "plan-")); for (const n of names) { mkdirSync(join(d, n)); writeFileSync(join(d, n, "migration.sql"), `CREATE TABLE "${n.replace(/\W/g, "_")}" (id int);\n`); } return d; };
  it("only SELECT/SHOW inside BEGIN READ ONLY, always rolled back; refuses when the mode is not read-only", async () => {
    const f = fake([]);
    await computeReleasePlan(f.client, dirWith([]));
    expect(f.calls[0]).toMatch(/^BEGIN READ ONLY/);
    expect(f.calls[f.calls.length - 1]).toBe("ROLLBACK");
    expect(f.calls.every((c) => /^(BEGIN READ ONLY|SHOW|SELECT|ROLLBACK)/.test(c))).toBe(true);
    const bad = fake([], "off");
    await expect(computeReleasePlan(bad.client, dirWith([]))).rejects.toThrow(/READ_ONLY_NOT_ENFORCED/);
    expect(bad.calls[bad.calls.length - 1]).toBe("ROLLBACK");
  });
  it("zero-migration push with drift-free ledger is NOOP; an unapplied committed migration is MIGRATE (ledger, not git); a failed row BLOCKs", async () => {
    const d = dirWith(["20260101000000_a"]);
    const sql = readFileSync(join(d, "20260101000000_a", "migration.sql"));
    const checksum = createHash("sha256").update(sql).digest("hex");
    const row = { migration_name: "20260101000000_a", checksum, finished_at: new Date(), rolled_back_at: null };
    expect((await computeReleasePlan(fake([row]).client, d)).action).toBe("NOOP");
    const d2 = dirWith(["20260101000000_a", "20260102000000_b"]);
    writeFileSync(join(d2, "20260101000000_a", "migration.sql"), sql);
    expect(await computeReleasePlan(fake([row]).client, d2)).toMatchObject({ action: "MIGRATE", pending: ["20260102000000_b"] });
    expect((await computeReleasePlan(fake([{ ...row, finished_at: null }]).client, d)).action).toBe("BLOCK");
  });
});

const OWNER_URL = process.env.ROLE_TEST_OWNER_DATABASE_URL ?? "";
const ON_DEDICATED_DB = /opsiq_runtime_role_test/.test(OWNER_URL);
let admin: Client;
beforeAll(async () => { if (SHOULD_RUN_DB_TESTS && ON_DEDICATED_DB) { admin = new Client({ connectionString: OWNER_URL }); await admin.connect(); } });
afterAll(async () => { await admin?.end(); });
describe.skipIf(!SHOULD_RUN_DB_TESTS || !ON_DEDICATED_DB)("[db] release plan against the real migration ledger", () => {
  it("the real committed chain equals the real ledger of the migrated test database: NOOP, and the ledger is not modified", async () => {
    const before = (await admin.query(`SELECT count(*)::int AS n, max(finished_at) AS m FROM "_prisma_migrations"`)).rows[0];
    const r = await computeReleasePlan(admin, join(ROOT, "prisma", "migrations"));
    expect(r.action).toBe("NOOP");
    expect((await admin.query(`SELECT count(*)::int AS n, max(finished_at) AS m FROM "_prisma_migrations"`)).rows[0]).toEqual(before);
  });
  it("an extra committed migration is MIGRATE and a tampered checksum is BLOCK (against the real ledger)", async () => {
    const names = readdirSync(join(ROOT, "prisma", "migrations"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const dir = mkdtempSync(join(tmpdir(), "plan-db-"));
    for (const n of names) { mkdirSync(join(dir, n)); copyFileSync(join(ROOT, "prisma", "migrations", n, "migration.sql"), join(dir, n, "migration.sql")); }
    mkdirSync(join(dir, "99999999999999_new_table"));
    writeFileSync(join(dir, "99999999999999_new_table", "migration.sql"), 'CREATE TABLE "zz_new_table" (id int);\n');
    expect(await computeReleasePlan(admin, dir)).toMatchObject({ action: "MIGRATE", pending: ["99999999999999_new_table"] });
    writeFileSync(join(dir, names[3], "migration.sql"), "-- tampered\nSELECT 1;\n");
    const t = await computeReleasePlan(admin, dir);
    expect(t.action).toBe("BLOCK");
    expect(t.reasons.join()).toMatch(/modified/);
  });
});

// The workflow is shipped as an INERT draft (outside .github/workflows) until a human reviewer activates it; see the proposal doc.
const DRAFT = "docs/opsiq/ci/proposed/production-release-reconcile.yml.draft";
describe("workflow trust model (production-release-reconcile draft)", () => {
  const text = readFileSync(join(ROOT, DRAFT), "utf8");
  const wf = YAML.load(text) as { on: Record<string, unknown>; permissions: Record<string, string>; concurrency: { group: string; "cancel-in-progress": boolean }; jobs: Record<string, { environment: string; permissions: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string>; if?: string; uses?: string; "continue-on-error"?: boolean }[] }> };
  const job = wf.jobs.reconcile;
  const reconcileGuard = (YAML.load(readFileSync(join(ROOT, ".github/workflows/reconcile-runtime-role.yml"), "utf8")) as typeof wf).jobs.reconcile.steps[0];
  const idx = (name: RegExp) => { const i = job.steps.findIndex((s) => name.test(s.name ?? "")); expect(i, String(name)).toBeGreaterThan(-1); return i; };

  it("is inert: the draft is not under .github/workflows until activated by the reviewed change", () => {
    expect(readdirSync(join(ROOT, ".github/workflows"))).not.toContain("production-release-reconcile.yml");
  });
  it("triggers: schedule and manual dispatch ONLY (no push/pull_request/workflow_run/repository_dispatch)", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
  });
  it("runs in the protected production-operator environment behind the verbatim origin guard as the FIRST step", () => {
    expect(job.environment).toBe("production-operator");
    expect(job.steps[0].name).toBe("Assert workflow origin is main (fail-closed)");
    expect(job.steps[0].run).toBe(reconcileGuard.run);
    expect(job.steps[0].env).toBeUndefined();
  });
  it("least privilege: read-only workflow permissions, job adds only checks/deployments read, no secrets: inherit, no continue-on-error", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toEqual({ contents: "read", checks: "read", deployments: "read" });
    expect(JSON.stringify(wf)).not.toMatch(/inherit/); // parsed YAML: comments excluded
    expect(job.steps.some((s) => s["continue-on-error"])).toBe(false);
    expect([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort()).toEqual(["OPERATOR_DATABASE_URL", "VERCEL_PRODUCTION_DEPLOY_HOOK_URL"]);
  });
  it("shares the production-write concurrency group and never cancels a running release", () => {
    expect(wf.concurrency).toEqual({ group: "migrate-production", "cancel-in-progress": false });
  });
  it("ordering: guard < checkout < exact SHA < CI < host < ledger plan < gate < decision < hook < verify; every DB/secret step is gated on CI-green", () => {
    const order = [/Assert workflow origin/, /Checkout main/, /Resolve the exact release SHA/, /Require required CI green/, /Validate the pinned production host/, /Release plan from the REAL migration ledger/, /Runtime-role reconcile and strict/, /Exact-SHA production deployment decision/, /Trigger the production deploy hook ONCE/, /Verify THIS exact SHA/].map(idx);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const re of [/Release plan from/, /Runtime-role reconcile/, /Preflight check - OPERATOR/]) expect(job.steps[idx(re)].if).toContain("steps.ci.outputs.ready == 'true'");
  });
  it("never applies migrations: the plan step only runs the read-only CLI and any non-NOOP plan fails the run before the gate", () => {
    expect(text).not.toMatch(/prisma migrate deploy/);
    const plan = job.steps[idx(/Release plan from/)].run ?? "";
    expect(plan).toContain("release-plan-cli.ts");
    expect(plan).toContain("RELEASE_PLAN=NOOP");
    expect(plan).toContain("exit 1");
  });
  it("the deploy hook runs only on a REDEPLOY decision, once, with redirects refused and the URL never echoed", () => {
    const hook = job.steps[idx(/Trigger the production deploy hook ONCE/)];
    expect(hook.if).toBe("steps.decide.outputs.decision == 'REDEPLOY'");
    expect(hook.run).toContain("--max-redirs 0");
    expect(hook.run).not.toMatch(/echo[^\n]*\$\{?DEPLOY_HOOK_URL/);
  });
  it("the gate runs in drift mode with the exact release SHA and the pinned host", () => {
    const gate = job.steps[idx(/Runtime-role reconcile and strict/)];
    expect(gate.env?.RECONCILE_ONLY_IF_DRIFT).toBe("1");
    expect(gate.env?.EXPECTED_RELEASE_SHA).toContain("github.sha");
    expect(gate.env?.EXPECTED_DATABASE_HOST).toContain("vars.PRODUCTION_DATABASE_HOST");
  });
});
