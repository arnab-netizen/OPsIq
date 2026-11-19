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
import { decideRelease, evaluateServed, isProductionDeployment, collectDeployments, collectAttempts, recordAttempt, ensureReleaseBranch, fetchHealth, MAX_ATTEMPTS, RETRY_WINDOW_MS, RELEASE_BRANCH } from "../../../scripts/release/release-state.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { decideAutoMigrate, applyAndVerify, evaluateBackup, lastBackupSuccessMs, BACKUP_MAX_AGE_MS } from "../../../scripts/release/auto-migrate.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { runReconcileGate } from "../../../scripts/release/runtime-role-reconcile-gate.mjs";
import { computeReleasePlan } from "../../../scripts/release/release-plan-cli";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const ROOT = resolve(__dirname, "../../..");
const SHA = "a".repeat(40);
const NOW = 1_800_000_000_000;
const HEALTH_OK = (commit: string | null) => ({ status: 200, body: { status: "healthy", commit, checks: { database: { status: "healthy" } } } });

describe("production acceptance = the PUBLIC site serves the exact SHA and is healthy (not a build or deployment record)", () => {
  it("accepts only HTTP 200 + database healthy + commit exactly equal to the release SHA", () => {
    expect(evaluateServed({ releaseSha: SHA, health: HEALTH_OK(SHA) })).toMatchObject({ served: true });
    expect(evaluateServed({ releaseSha: SHA, health: HEALTH_OK("b".repeat(40)) })).toMatchObject({ served: false, code: "OTHER_COMMIT_SERVED" });
    expect(evaluateServed({ releaseSha: SHA, health: HEALTH_OK(null) })).toMatchObject({ served: false, code: "COMMIT_NOT_REPORTED" });
    expect(evaluateServed({ releaseSha: SHA, health: { status: 503, body: { commit: SHA, checks: { database: { status: "healthy" } } } } })).toMatchObject({ served: false, code: "HEALTH_UNAVAILABLE" });
    expect(evaluateServed({ releaseSha: SHA, health: { status: 200, body: { commit: SHA, checks: { database: { status: "unhealthy" } } } } })).toMatchObject({ served: false, code: "DATABASE_NOT_HEALTHY" });
    expect(evaluateServed({ releaseSha: SHA, health: null }).served).toBe(false);
    expect(evaluateServed({ releaseSha: "main", health: HEALTH_OK(SHA) }).served).toBe(false);
  });
  it("fetchHealth refuses unapproved origins, never follows redirects", async () => {
    await expect(fetchHealth({ origin: "https://evil.example" })).rejects.toThrow(/not approved/);
    let seen: RequestInit | undefined;
    const r = await fetchHealth({ origin: "https://opsiq.solutions", fetchImpl: (async (_u: string, init: RequestInit) => { seen = init; return { status: 200, json: async () => ({ status: "healthy" }) }; }) as never });
    expect(r.status).toBe(200);
    expect(seen?.redirect).toBe("error");
  });
});

describe("verified production environment identification", () => {
  it("only environment 'Production' exactly; preview, preproduction, staging, test, case variants and substrings are rejected", () => {
    expect(isProductionDeployment({ environment: "Production" })).toBe(true);
    for (const e of ["Preview", "Preproduction", "pre-production", "production", "PRODUCTION", "Production (staging)", "staging", "test", "Production2", "", undefined, null]) expect(isProductionDeployment({ environment: e }), String(e)).toBe(false);
    expect(isProductionDeployment({ environment: "Production", productionEnvironment: false })).toBe(false);
  });
});

describe("release decision with durable bounded retry accounting", () => {
  const base = { releaseSha: SHA, served: false, deployments: [] as never[], attemptsMs: [] as number[], nowMs: NOW };
  it("NONE only when served; a historical successful build of this SHA never counts", () => {
    expect(decideRelease({ ...base, served: true }).action).toBe("NONE");
    const d = [{ sha: SHA, environment: "Production", productionEnvironment: true, createdAtMs: NOW - 3_600_000, state: "success" }];
    expect(decideRelease({ ...base, deployments: d as never }).action).toBe("TRIGGER");
  });
  it("WAITs for an in-flight PRODUCTION build of this SHA; preview builds and stale records do not block", () => {
    const inflight = (o: object) => [{ sha: SHA, environment: "Production", productionEnvironment: true, createdAtMs: NOW - 60_000, state: "in_progress", ...o }] as never;
    expect(decideRelease({ ...base, deployments: inflight({}) }).action).toBe("WAIT");
    expect(decideRelease({ ...base, deployments: inflight({ environment: "Preview" }) }).action).toBe("TRIGGER");
    expect(decideRelease({ ...base, deployments: inflight({ createdAtMs: NOW - 3 * 3_600_000 }) }).action).toBe("TRIGGER"); // timed out
    expect(decideRelease({ ...base, deployments: inflight({ sha: "b".repeat(40) }) }).action).toBe("TRIGGER");
  });
  it("counts attempts from durable refs, not provider records: hook accepted but no deployment ever appears still exhausts the budget", () => {
    const attempts = Array.from({ length: MAX_ATTEMPTS }, (_, i) => NOW - (i + 1) * 3_600_000);
    const d = decideRelease({ ...base, attemptsMs: attempts });
    expect(d).toMatchObject({ action: "BLOCK", code: "RETRY_BUDGET_EXHAUSTED" });
    expect(d.retryAfterMs).toBeGreaterThan(0);
    expect(decideRelease({ ...base, attemptsMs: attempts.slice(0, MAX_ATTEMPTS - 1) })).toMatchObject({ action: "TRIGGER", attemptsInWindow: MAX_ATTEMPTS - 1 });
  });
  it("recovers automatically as old attempts age out of the window (never retries indefinitely, never blocked forever)", () => {
    const old = Array.from({ length: MAX_ATTEMPTS }, () => NOW - RETRY_WINDOW_MS - 1);
    expect(decideRelease({ ...base, attemptsMs: old }).action).toBe("TRIGGER");
    const mixed = [NOW - RETRY_WINDOW_MS - 1, NOW - 1000, NOW - 2000];
    expect(decideRelease({ ...base, attemptsMs: mixed }).action).toBe("TRIGGER"); // only 2 inside the window
    expect(decideRelease({ ...base, attemptsMs: [...mixed, NOW - 3000] }).action).toBe("BLOCK");
  });
  it("a malformed release sha blocks; non-finite attempt data is ignored", () => {
    for (const bad of ["", "main", "A".repeat(40), "a".repeat(39)]) expect(decideRelease({ ...base, releaseSha: bad }).action).toBe("BLOCK");
    expect(decideRelease({ ...base, attemptsMs: [Number.NaN, Infinity] as never }).action).toBe("TRIGGER");
  });
});

describe("durable provider interactions (injected GitHub API)", () => {
  it("collectAttempts parses only well-formed refs for THIS sha; a bad response throws (fail closed, no trigger on API errors)", async () => {
    const refs = [{ ref: `refs/release-attempts/${SHA}/1800000000000` }, { ref: `refs/release-attempts/${SHA}/notanumber` }, { ref: `refs/release-attempts/${"c".repeat(40)}/1800000000001` }];
    expect(await collectAttempts({ fetchJson: async () => refs, repo: "o/r", sha: SHA })).toEqual([1800000000000]);
    await expect(collectAttempts({ fetchJson: async () => ({ message: "x" }), repo: "o/r", sha: SHA })).rejects.toThrow();
    await expect(collectAttempts({ fetchJson: async () => { throw new Error("boom"); }, repo: "o/r", sha: SHA })).rejects.toThrow();
  });
  it("recordAttempt writes a ref BEFORE any trigger, pointing at the release commit", async () => {
    const posts: [string, unknown][] = [];
    await recordAttempt({ postJson: async (p: string, b: unknown) => { posts.push([p, b]); }, repo: "o/r", sha: SHA, nowMs: NOW });
    expect(posts).toEqual([["/repos/o/r/git/refs", { ref: `refs/release-attempts/${SHA}/${NOW}`, sha: SHA }]]);
  });
  it("collectDeployments reads the latest status per deployment and ignores other SHAs", async () => {
    const fetchJson = async (path: string) => path.includes("/statuses") ? [{ state: "success" }] : [{ id: 1, sha: SHA, environment: "Production", production_environment: true, created_at: "2026-11-19T00:00:00Z" }, { id: 2, sha: "c".repeat(40), environment: "Production", created_at: "2026-11-19T00:00:00Z" }];
    const out = await collectDeployments({ fetchJson, repo: "o/r", sha: SHA });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ environment: "Production", productionEnvironment: true, state: "success" });
  });
  it("ensureReleaseBranch: creates, no-ops at the same SHA, fast-forwards, and BLOCKS a non-fast-forward without forcing", async () => {
    const calls: string[] = [];
    const mk = (tip: string | null, status = "ahead") => ({
      fetchJson: async (p: string) => { if (p.includes("/git/ref/heads/")) { if (tip === null) { const e = new Error("nf") as Error & { status: number }; e.status = 404; throw e; } return { object: { sha: tip } }; } return { status }; },
      postJson: async (p: string, b: unknown) => { calls.push(`POST ${p} ${JSON.stringify(b)}`); },
      patchJson: async (p: string, b: unknown) => { calls.push(`PATCH ${p} ${JSON.stringify(b)}`); },
      repo: "o/r", sha: SHA,
    });
    expect(await ensureReleaseBranch(mk(null))).toMatchObject({ advanced: true, code: "BRANCH_CREATED_AT_RELEASE_SHA" });
    expect(await ensureReleaseBranch(mk(SHA))).toMatchObject({ advanced: false, code: "BRANCH_ALREADY_AT_RELEASE_SHA" });
    expect(await ensureReleaseBranch(mk("d".repeat(40), "ahead"))).toMatchObject({ advanced: true, code: "BRANCH_FAST_FORWARDED" });
    const blockedCalls = calls.length;
    expect(await ensureReleaseBranch(mk("d".repeat(40), "diverged"))).toMatchObject({ advanced: false, blocked: true, code: "NOT_A_FAST_FORWARD" });
    expect(await ensureReleaseBranch(mk("d".repeat(40), "behind"))).toMatchObject({ blocked: true });
    expect(calls.length).toBe(blockedCalls); // no write on a blocked advance
    expect(calls.filter((c) => c.startsWith("PATCH")).every((c) => c.includes('"force":false'))).toBe(true);
    expect(RELEASE_BRANCH).toBe("release/production");
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
    expect(job.permissions).toEqual({ contents: "write", checks: "read", deployments: "read", "pull-requests": "read" }); // write ONLY for the release branch + attempt refs
    expect(JSON.stringify(wf)).not.toMatch(/inherit/); // parsed YAML: comments excluded
    expect(job.steps.some((s) => s["continue-on-error"])).toBe(false);
    expect([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort()).toEqual(["OPERATOR_DATABASE_URL", "VERCEL_PRODUCTION_DEPLOY_HOOK_URL"]);
  });
  it("shares the production-write concurrency group and never cancels a running release", () => {
    expect(wf.concurrency).toEqual({ group: "migrate-production", "cancel-in-progress": false });
  });
  it("ordering: guard < checkout < exact SHA < CI < host < ledger plan < Phase 2 < gate < decision < trigger < hook < verify; every DB/secret step is gated on CI-green", () => {
    const order = [/Assert workflow origin/, /Checkout main/, /Resolve the exact release SHA/, /Verify release evidence/, /Validate the pinned production host/, /Release plan from the REAL migration ledger/, /Phase 2 - apply pending migrations/, /Runtime-role reconcile and strict/, /Release decision/, /Trigger exact-SHA release/, /Retry the SAME sha/, /Verify the PUBLIC site serves/].map(idx);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const re of [/Release plan from/, /Runtime-role reconcile/, /Preflight check - OPERATOR/, /Release decision/]) expect(job.steps[idx(re)].if).toContain("steps.ci.outputs.ready == 'true'");
  });
  it("Phase 2 applies only a MIGRATE plan through the guarded CLI (backup + ledger re-check inside); BLOCK/unknown plans fail the run before any write", () => {
    const plan = job.steps[idx(/Release plan from the REAL migration ledger/)].run ?? "";
    expect(plan).toContain("release-plan-cli.ts");
    expect(plan).toContain("exit 1");
    const p2 = job.steps[idx(/Phase 2 - apply pending migrations/)];
    expect(p2.if).toBe("steps.plan.outputs.action == 'MIGRATE'");
    expect(p2.run).toContain("auto-migrate-cli.mjs");
    expect(p2.run).toContain("AUTO_MIGRATE=OK");
    expect(text.match(/prisma migrate deploy/g)).toBeNull(); // only the guarded CLI may invoke it, never a bare workflow step
  });
  it("the release is bound to the SHA by construction: fast-forward-only release branch advance, durable attempt BEFORE the trigger, hook only for a same-SHA retry", () => {
    const trig = job.steps[idx(/Trigger exact-SHA release/)];
    expect(trig.if).toBe("steps.decide.outputs.decision == 'TRIGGER'");
    expect(trig.run).toContain("release-state.mjs trigger");
    const hook = job.steps[idx(/Retry the SAME sha/)];
    expect(hook.if).toBe("steps.trigger.outputs.hook_needed == 'true'");
    expect(hook.run).toContain("--max-redirs 0");
    expect(hook.run).not.toMatch(/echo[^\n]*\$\{?DEPLOY_HOOK_URL/);
    const state = readFileSync(join(ROOT, "scripts/release/release-state.mjs"), "utf8");
    expect(state.indexOf("recordAttempt({ postJson")).toBeGreaterThan(-1);
    expect(state.indexOf("await recordAttempt(")).toBeLessThan(state.indexOf("await ensureReleaseBranch("));
    expect(state).not.toMatch(/force:\s*true/);
  });
  it("acceptance is the public site serving the exact SHA, checked from an approved origin only", () => {
    const v = job.steps[idx(/Verify the PUBLIC site serves/)];
    expect(v.run).toContain("release-state.mjs verify");
    expect(v.if).toContain("steps.decide.outputs.decision");
  });
  it("the gate runs in drift mode with the exact release SHA and the pinned host", () => {
    const gate = job.steps[idx(/Runtime-role reconcile and strict/)];
    expect(gate.env?.RECONCILE_ONLY_IF_DRIFT).toBe("1");
    expect(gate.env?.EXPECTED_RELEASE_SHA).toContain("github.sha");
    expect(gate.env?.EXPECTED_DATABASE_HOST).toContain("vars.PRODUCTION_DATABASE_HOST");
  });
});


describe("Phase 2 automatic migration: fail-closed orchestration", () => {
  const fresh = { fresh: true, code: "BACKUP_FRESH" };
  const one = { action: "MIGRATE", pending: ["20261120000000_a"] };
  const many = { action: "MIGRATE", pending: ["20261120000000_a", "20261121000000_b", "20261122000000_c"] };
  it("zero pending: nothing to do and NOT a failure; one or several compatible pending migrations proceed only with a fresh verified backup", () => {
    expect(decideAutoMigrate({ plan: { action: "NOOP", pending: [] }, backup: fresh })).toMatchObject({ proceed: false, fail: false, code: "NOTHING_PENDING" });
    expect(decideAutoMigrate({ plan: one, backup: fresh })).toMatchObject({ proceed: true, pending: one.pending });
    expect(decideAutoMigrate({ plan: many, backup: fresh })).toMatchObject({ proceed: true, pending: many.pending });
  });
  it("refuses without a fresh verified backup (none recorded, stale, malformed) and on any inconsistent or unordered plan", () => {
    const now = 1_800_000_000_000;
    expect(evaluateBackup({ lastSuccessMs: NaN, nowMs: now })).toMatchObject({ fresh: false, code: "NO_VERIFIED_BACKUP_RECORDED" });
    expect(evaluateBackup({ lastSuccessMs: now - BACKUP_MAX_AGE_MS - 1, nowMs: now })).toMatchObject({ fresh: false, code: "BACKUP_STALE" });
    expect(evaluateBackup({ lastSuccessMs: now - 3_600_000, nowMs: now }).fresh).toBe(true);
    expect(decideAutoMigrate({ plan: one, backup: { fresh: false, code: "BACKUP_STALE" } })).toMatchObject({ proceed: false, fail: true, code: "BACKUP_STALE" });
    expect(decideAutoMigrate({ plan: one, backup: undefined }).proceed).toBe(false);
    for (const plan of [undefined, null, { action: "WHATEVER" }, { action: "MIGRATE", pending: [] }, { action: "MIGRATE", pending: ["../etc/passwd"] }, { action: "MIGRATE", pending: ["20261120000000_a", "20261120000000_a"] }, { action: "MIGRATE", pending: ["20261121000000_b", "20261120000000_a"] }]) {
      expect(decideAutoMigrate({ plan: plan as never, backup: fresh }).proceed, JSON.stringify(plan)).toBe(false);
    }
  });
  it("a BLOCK plan (failed/modified/out-of-order/destructive/unknown) never auto-applies and fails the run", () => {
    expect(decideAutoMigrate({ plan: { action: "BLOCK", pending: ["20261120000000_a"] }, backup: fresh })).toMatchObject({ proceed: false, fail: true, code: "PLAN_BLOCKED_NEEDS_HUMAN_AUTHORIZATION" });
  });
  it("applies, then requires the ledger to be NOOP: success; deploy failure; partial/interrupted application is detected", async () => {
    const d = decideAutoMigrate({ plan: many, backup: fresh });
    const calls: string[] = [];
    expect(await applyAndVerify({ decision: d, runDeploy: async () => { calls.push("deploy"); return { exitCode: 0 }; }, replan: async () => { calls.push("replan"); return { action: "NOOP", pending: [] }; } })).toMatchObject({ ok: true, code: "MIGRATIONS_APPLIED_AND_VERIFIED", applied: many.pending });
    expect(calls).toEqual(["deploy", "replan"]);
    expect(await applyAndVerify({ decision: d, runDeploy: async () => ({ exitCode: 1 }), replan: async () => ({ action: "NOOP", pending: [] }) })).toMatchObject({ ok: false, code: "MIGRATE_DEPLOY_FAILED" });
    expect(await applyAndVerify({ decision: d, runDeploy: async () => ({ exitCode: null }), replan: async () => ({ action: "NOOP", pending: [] }) })).toMatchObject({ ok: false, code: "MIGRATE_DEPLOY_FAILED" });
    expect(await applyAndVerify({ decision: d, runDeploy: async () => ({ exitCode: 0 }), replan: async () => ({ action: "MIGRATE", pending: ["20261122000000_c"] }) })).toMatchObject({ ok: false, code: "LEDGER_NOT_CURRENT_AFTER_DEPLOY", remaining: ["20261122000000_c"] });
  });
  it("never runs the deploy when the decision does not proceed", async () => {
    let ran = false;
    const r = await applyAndVerify({ decision: decideAutoMigrate({ plan: one, backup: { fresh: false, code: "BACKUP_STALE" } }), runDeploy: async () => { ran = true; return { exitCode: 0 }; }, replan: async () => ({ action: "NOOP", pending: [] }) });
    expect(ran).toBe(false);
    expect(r).toMatchObject({ ok: false, code: "BACKUP_STALE" });
  });
  it("lastBackupSuccessMs reads the latest successful encrypted-backup run; an unexpected response throws (fail closed)", async () => {
    expect(await lastBackupSuccessMs({ fetchJson: async () => ({ workflow_runs: [{ updated_at: "2026-11-19T00:00:00Z" }] }), repo: "o/r" })).toBe(Date.parse("2026-11-19T00:00:00Z"));
    expect(Number.isNaN(await lastBackupSuccessMs({ fetchJson: async () => ({ workflow_runs: [] }), repo: "o/r" }))).toBe(true);
    await expect(lastBackupSuccessMs({ fetchJson: async () => ({}), repo: "o/r" })).rejects.toThrow();
  });
});

describe("scheduled-run continuity watchdog (inert draft, unprivileged)", () => {
  const w = YAML.load(readFileSync(join(ROOT, "docs/opsiq/ci/proposed/release-watchdog.yml.draft"), "utf8")) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, { environment?: string; steps: { run?: string; env?: Record<string, string> }[] }> };
  const raw = readFileSync(join(ROOT, "docs/opsiq/ci/proposed/release-watchdog.yml.draft"), "utf8");
  it("is inert, has no secrets/environment/database access, and only reads Actions history + writes one issue", () => {
    expect(readdirSync(join(ROOT, ".github/workflows"))).not.toContain("release-watchdog.yml");
    expect(w.permissions).toEqual({ contents: "read", actions: "read", issues: "write" });
    expect(Object.values(w.jobs).every((j) => j.environment === undefined)).toBe(true);
    expect(JSON.stringify(w)).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
    expect(JSON.stringify(w)).not.toMatch(/OPERATOR|DATABASE_URL|DEPLOY_HOOK|VERCEL/);
    expect(Object.keys(w.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
  });
  it("detects dropped or stalled schedules (age of the last SUCCESS, not the last run) and recovers by closing its own issue", () => {
    expect(raw).toContain("status=success");
    expect(raw).toContain("gh issue close");
    expect(raw).toContain("MAX_AGE_HOURS: '4'");
  });
});

// @ts-expect-error -- plain ESM script without type declarations
import { verifyReleaseEvidence, ACTIONS_APP_ID, REQUIRED_CHECK } from "../../../scripts/release/release-evidence.mjs";
import { migrationManifest, privilegeManifest } from "../../../scripts/release/release-manifest";

describe("release evidence: verified-tree equivalence (no fabricated or historical CI)", () => {
  const REL = "a".repeat(40), HEAD = "b".repeat(40), TREE = "c".repeat(40);
  const pr = (o: object = {}) => ({ number: 7, merged_at: "2026-11-19T00:00:00Z", base: { ref: "main" }, head: { sha: HEAD }, merge_commit_sha: REL, ...o });
  const check = (o: object = {}) => ({ id: 99, name: REQUIRED_CHECK, status: "completed", conclusion: "success", head_sha: HEAD, completed_at: "2026-11-19T00:10:00Z", app: { id: ACTIONS_APP_ID }, ...o });
  const api = (over: { prs?: unknown; relTree?: string; headTree?: string; checks?: unknown } = {}) => async (p: string) => {
    if (p.includes("/pulls")) return over.prs ?? [pr()];
    if (p.includes(`/git/commits/${REL}`)) return { tree: { sha: over.relTree ?? TREE } };
    if (p.includes(`/git/commits/${HEAD}`)) return { tree: { sha: over.headTree ?? TREE } };
    if (p.includes("/check-runs")) return { check_runs: over.checks ?? [check()] };
    throw new Error("unexpected " + p);
  };
  const run = (over = {}) => verifyReleaseEvidence({ fetchJson: api(over), repo: "o/r", sha: REL });
  it("verifies a merged PR whose release tree equals the CI-tested head tree, and binds sha/tree/PR/check", async () => {
    expect(await run()).toMatchObject({ ok: true, evidence: { releaseSha: REL, treeSha: TREE, prNumber: 7, prHeadSha: HEAD, checkRunId: 99 } });
  });
  it("rejects direct pushes, unmerged or other-base PRs, someone else's merge commit, and ambiguous matches", async () => {
    expect((await run({ prs: [] })).code).toBe("NOT_A_MERGED_PULL_REQUEST_COMMIT");
    expect((await run({ prs: [pr({ merged_at: null })] })).code).toBe("NOT_A_MERGED_PULL_REQUEST_COMMIT");
    expect((await run({ prs: [pr({ base: { ref: "release/production" } })] })).code).toBe("NOT_A_MERGED_PULL_REQUEST_COMMIT");
    expect((await run({ prs: [pr({ merge_commit_sha: "d".repeat(40) })] })).code).toBe("NOT_A_MERGED_PULL_REQUEST_COMMIT");
    expect((await run({ prs: [pr(), pr({ number: 8 })] })).code).toBe("AMBIGUOUS_PULL_REQUEST");
  });
  it("rejects a release whose tree is not the tested tree (untested content never ships on borrowed CI)", async () => {
    expect((await run({ headTree: "e".repeat(40) })).code).toBe("TREE_DIFFERS_FROM_TESTED_PR_HEAD");
  });
  it("rejects missing, failed, stale, other-app, in-progress and wrong-name checks; the LATEST run decides", async () => {
    expect((await run({ checks: [] })).code).toBe("NO_REQUIRED_CHECK_FROM_THE_PINNED_APP");
    expect((await run({ checks: [check({ app: { id: 1 } })] })).code).toBe("NO_REQUIRED_CHECK_FROM_THE_PINNED_APP");
    expect((await run({ checks: [check({ name: "lint" })] })).code).toBe("NO_REQUIRED_CHECK_FROM_THE_PINNED_APP");
    expect((await run({ checks: [check({ status: "in_progress", conclusion: null })] })).code).toBe("NO_REQUIRED_CHECK_FROM_THE_PINNED_APP");
    expect((await run({ checks: [check({ head_sha: "f".repeat(40) })] })).code).toBe("NO_REQUIRED_CHECK_FROM_THE_PINNED_APP"); // historical/other-commit evidence
    expect((await run({ checks: [check({ conclusion: "failure" })] })).code).toBe("REQUIRED_CHECK_NOT_SUCCESS");
    expect((await run({ checks: [check(), check({ id: 100, conclusion: "failure", completed_at: "2026-11-19T01:00:00Z" })] })).code).toBe("REQUIRED_CHECK_NOT_SUCCESS"); // later failed re-run wins
    expect((await run({ checks: [check({ conclusion: "failure" }), check({ id: 101, completed_at: "2026-11-19T02:00:00Z" })] })).ok).toBe(true); // later successful re-run wins
  });
  it("fails closed on malformed shas, provider errors and unexpected responses", async () => {
    expect((await verifyReleaseEvidence({ fetchJson: api(), repo: "o/r", sha: "main" })).code).toBe("BAD_RELEASE_SHA");
    expect((await verifyReleaseEvidence({ fetchJson: async () => { throw new Error("boom"); }, repo: "o/r", sha: REL })).code).toBe("API_ERROR");
    expect((await run({ prs: { message: "x" } })).code).toBe("UNEXPECTED_PULLS_RESPONSE");
    expect((await run({ checks: { not: "list" } as never })).code).toBe("UNEXPECTED_CHECK_RUNS_RESPONSE");
  });
});

describe("release manifests", () => {
  it("migration manifest is deterministic over the real chain and changes if any migration byte changes; privilege manifest is stable and covers the classes", () => {
    const m1 = migrationManifest(join(ROOT, "prisma", "migrations")), m2 = migrationManifest(join(ROOT, "prisma", "migrations"));
    expect(m1.sha256).toBe(m2.sha256);
    expect(m1.lines.length).toBeGreaterThan(150);
    const dir = mkdtempSync(join(tmpdir(), "mf-"));
    mkdirSync(join(dir, "20260101000000_a")); writeFileSync(join(dir, "20260101000000_a", "migration.sql"), "SELECT 1;");
    const a = migrationManifest(dir).sha256;
    writeFileSync(join(dir, "20260101000000_a", "migration.sql"), "SELECT 2;");
    expect(migrationManifest(dir).sha256).not.toBe(a);
    const p = privilegeManifest();
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.writable).toBeGreaterThan(100);
    expect(p.denied).toBeGreaterThanOrEqual(1);
    expect(privilegeManifest().sha256).toBe(p.sha256);
  });
});
