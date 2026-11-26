/**
 * Static safety validator for .github/workflows/provision-gsc-ingestion-credential.yml (no workflow execution).
 * Modeled on provision-administration-operator-workflow-safety.test.ts.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import YAML from "js-yaml";

const PATH = join(process.cwd(), ".github/workflows/provision-gsc-ingestion-credential.yml");
const text = readFileSync(PATH, "utf8");
type Step = { name?: string; run?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, string> };
const wf = YAML.load(text) as { on: Record<string, unknown>; permissions: Record<string, string>; concurrency: { group: string }; jobs: Record<string, { environment?: string; "timeout-minutes"?: number; steps: Step[] }> };
const job = wf.jobs.provision;
const steps = job.steps;
const idx = (re: RegExp) => steps.findIndex((s) => re.test(s.name ?? ""));
const functional = text.slice(text.indexOf("\non:") + 1);

describe("provision-gsc-ingestion-credential.yml safety", () => {
  it("is workflow_dispatch only", () => {
    expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"]);
  });
  it("runs in the protected production-operator environment with a strict timeout and minimal permissions", () => {
    expect(job.environment).toBe("production-operator");
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(10);
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.concurrency.group).toBe("provision-gsc-ingestion-credential");
  });
  it("the FIRST step is the fail-closed main-origin guard and it references no secret or input", () => {
    expect(steps[0].name).toMatch(/^Assert workflow origin is main/);
    expect(steps[0].env).toBeUndefined();
    expect(steps[0].run).toContain('"${GITHUB_REF}" != "refs/heads/main"');
  });
  it("checks out the dispatched commit and proves exact SHA equality BEFORE any step that uses the database secret", () => {
    const co = idx(/^Checkout/);
    const sha = idx(/^Verify checked-out SHA/);
    const firstSecret = steps.findIndex((s) => JSON.stringify(s).includes("secrets.OPERATOR_DATABASE_URL"));
    expect(co).toBeGreaterThan(0);
    expect(sha).toBeGreaterThan(co);
    expect(firstSecret).toBeGreaterThan(sha);
    expect(steps[co].with?.["persist-credentials"]).toBe(false);
  });
  it("runs the shared exact-host gate before the provisioning script", () => {
    const gate = steps.findIndex((s) => (s.run ?? "").includes("node scripts/validate-expected-db-host.mjs"));
    const prov = idx(/^Run provisioning script/);
    expect(gate).toBeGreaterThan(0);
    expect(prov).toBeGreaterThan(gate);
  });
  it("only secrets.OPERATOR_DATABASE_URL is referenced; no other secret, no token, no id-token", () => {
    const secrets = [...functional.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    expect(new Set(secrets)).toEqual(new Set(["OPERATOR_DATABASE_URL"]));
    expect(functional).not.toMatch(/GITHUB_TOKEN|id-token|GH_TOKEN|contents: write|secrets: write/);
  });
  it("every third-party action is pinned to a full commit SHA", () => {
    for (const s of steps.filter((x) => x.uses)) expect(s.uses, s.name).toMatch(/@[0-9a-f]{40}$/);
  });
  it("no ${{ }} expression is interpolated into any run: script (everything flows through env)", () => {
    for (const s of steps) expect(s.run ?? "", s.name).not.toMatch(/\$\{\{/);
  });
  it("accepts no SQL, password or connection string as an input", () => {
    const inputs = Object.keys((wf.on.workflow_dispatch as { inputs: object }).inputs);
    expect(inputs).toEqual(["mode", "confirm", "expected_main_sha", "expected_database_host", "env_public_key", "env_key_id"]);
    expect(functional).not.toMatch(/inputs\.(sql|password|url|connection)/i);
  });
  it("has exactly the four modes and no migration, deployment or arbitrary-command surface", () => {
    expect((wf.on.workflow_dispatch as { inputs: { mode: { options: string[] } } }).inputs.mode.options).toEqual(["DRY_RUN", "CREATE", "RECOVER_NOLOGIN", "ACTIVATE"]);
    expect(functional).not.toMatch(/prisma|migrate deploy|vercel|deploy[-_ ]hook|psql|curl |wget /i);
  });
  it("installs from the lockfile without lifecycle scripts and removes local env files", () => {
    expect(steps.some((s) => s.run === "npm ci --ignore-scripts")).toBe(true);
    expect(steps.some((s) => (s.run ?? "").includes("rm -f .env"))).toBe(true);
  });
  it("never echoes credentials and never enables shell tracing", () => {
    expect(functional).not.toMatch(/set -x|-o xtrace|add-mask|echo[^\n]*\$\{?\w*(PASSWORD|DATABASE_URL|ENV_PUBLIC_KEY)/);
  });
  it("hands off the SEALED file only, only for CREATE/RECOVER_NOLOGIN, with 1-day retention, and always removes it from the runner", () => {
    const up = steps[idx(/^Upload sealed ciphertext/)];
    expect(up.if).toBe("success() && (inputs.mode == 'CREATE' || inputs.mode == 'RECOVER_NOLOGIN')");
    expect(up.with).toMatchObject({ "retention-days": 1, "if-no-files-found": "error", overwrite: false });
    expect(String(up.with?.path)).toContain("gsc-credential.sealed.json");
    const rm = steps[idx(/^Remove sealed file/)];
    expect(rm.if).toBe("always()");
  });
  it("the provisioning step passes only inputs/secret through env and invokes the reviewed script", () => {
    const s = steps[idx(/^Run provisioning script/)];
    expect(s.run).toBe("node_modules/.bin/tsx scripts/gsc-provision/provision.ts");
    expect(Object.keys(s.env ?? {}).sort()).toEqual(["DATABASE_URL", "GSC_CONFIRM", "GSC_ENV_KEY_ID", "GSC_ENV_PUBLIC_KEY", "GSC_EXPECTED_HOST", "GSC_EXPECTED_SHA", "GSC_MODE", "GSC_SEALED_OUT"]);
  });
});
