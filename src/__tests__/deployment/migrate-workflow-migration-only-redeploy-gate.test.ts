/**
 * Migration-only release control. After MAIN / MAIN_BATCH the workflow used to POST the Vercel deploy hook whenever the
 * VERCEL_PRODUCTION_DEPLOY_HOOK_URL secret was populated, which would promote every commit on main that production
 * does not yet serve. The hook request is now gated on an explicit redeploy_after_migration=YES input (default NO),
 * independent of whether the secret is populated. These tests execute the real step scripts with a stubbed curl for the
 * configured-hook and absent-hook cases, and pin that every other safety gate is untouched.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const text = readFileSync(resolve(__dirname, "../../../.github/workflows/migrate-production.yml"), "utf8");
const idx = (needle: string) => {
  const i = text.indexOf(needle);
  expect(i, `missing: ${needle}`).toBeGreaterThan(-1);
  return i;
};
const stepBlock = (name: string) => {
  const s = idx(`- name: ${name}`);
  const n = text.indexOf("\n      - name:", s + 1);
  return text.slice(s, n === -1 ? undefined : n);
};
const runScript = (block: string) => {
  const m = block.match(/\n        run: \|\n([\s\S]*)$/);
  expect(m, "step has a run block").not.toBeNull();
  return m![1]
    .split("\n")
    .map((l) => l.replace(/^ {10}/, ""))
    .join("\n");
};
const ifCondition = (block: string) => (block.match(/\n        if: (.*)\n/) ?? [])[1] ?? "";

function runStep(script: string, env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "redeploy-gate-"));
  const githubEnv = join(dir, "github_env");
  const curlLog = join(dir, "curl.log");
  writeFileSync(githubEnv, "");
  writeFileSync(join(dir, "curl"), `#!/usr/bin/env bash\necho "$@" >> "${curlLog}"\nexit 0\n`);
  chmodSync(join(dir, "curl"), 0o755);
  const scriptPath = join(dir, "step.sh");
  writeFileSync(scriptPath, `set -e\n${script}\n`);
  const r = spawnSync("bash", [scriptPath], {
    env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_ENV: githubEnv, ...env },
    encoding: "utf8",
  });
  let curlCalls = "";
  try {
    curlCalls = readFileSync(curlLog, "utf8");
  } catch {
    curlCalls = "";
  }
  return { status: r.status, out: r.stdout + r.stderr, githubEnv: readFileSync(githubEnv, "utf8"), curlCalls };
}

describe("migrate-production migration-only redeploy gate", () => {
  const trigger = stepBlock("Trigger production redeploy of main (release gate re-check)");
  const skip = stepBlock("Skip production redeploy (migration only, no hook request is made)");
  const validate = stepBlock("Validate redeploy_after_migration input (fail-closed; anything but exactly YES means no redeploy)");

  it("declares redeploy_after_migration as an optional choice that defaults to NO", () => {
    const m = text.match(/\n {6}redeploy_after_migration:\n([\s\S]*?)\n {6}expected_database_host:/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/default: 'NO'/);
    expect(m![1]).toMatch(/type: choice/);
    expect(m![1]).toMatch(/- 'NO'/);
    expect(m![1]).toMatch(/- 'YES'/);
    expect(m![1]).toMatch(/required: false/);
  });

  it("the hook step only runs when redeploy_after_migration is exactly YES; the skip step is its exact complement", () => {
    expect(ifCondition(trigger)).toContain("inputs.redeploy_after_migration == 'YES'");
    expect(ifCondition(skip)).toContain("inputs.redeploy_after_migration != 'YES'");
    const common = "success() && (inputs.mode == 'MAIN' || inputs.mode == 'MAIN_BATCH') && env.POST_VERIFY_SUCCEEDED == 'true' && env.RUNTIME_ROLE_RECONCILED == 'true'";
    expect(ifCondition(trigger)).toContain(common);
    expect(ifCondition(skip)).toContain(common);
  });

  it("the hook secret is only referenced by the gated trigger step", () => {
    expect(text.match(/VERCEL_PRODUCTION_DEPLOY_HOOK_URL: |secrets\.VERCEL_PRODUCTION_DEPLOY_HOOK_URL/g)?.length).toBe(1);
    expect(skip).not.toMatch(/secrets\.|curl|DEPLOY_HOOK_URL/);
  });

  it("migration-only mode never makes the hook request, whether or not the secret is populated", () => {
    const script = runScript(skip);
    for (const hook of ["", "https://api.vercel.com/v1/integrations/deploy/prj_x/hook"]) {
      const r = runStep(script, { DEPLOY_HOOK_URL: hook });
      expect(r.status).toBe(0);
      expect(r.curlCalls).toBe("");
      expect(r.githubEnv).toContain("REDEPLOY=skipped_migration_only");
    }
  });

  it("with an explicit YES and a populated hook the request is made (configured-hook case)", () => {
    const r = runStep(runScript(trigger), { DEPLOY_HOOK_URL: "https://example.invalid/hook" });
    expect(r.status).toBe(0);
    expect(r.curlCalls).toContain("https://example.invalid/hook");
    expect(r.githubEnv).toContain("REDEPLOY=triggered");
  });

  it("with an explicit YES and no hook nothing is requested and the operator is told to redeploy manually (absent-hook case)", () => {
    const r = runStep(runScript(trigger), { DEPLOY_HOOK_URL: "" });
    expect(r.status).toBe(0);
    expect(r.curlCalls).toBe("");
    expect(r.githubEnv).toContain("REDEPLOY=manual");
  });

  it("input validation fails closed on anything other than exactly NO or YES", () => {
    const script = runScript(validate);
    for (const ok of ["NO", "YES"]) expect(runStep(script, { INPUT_REDEPLOY: ok }).status).toBe(0);
    for (const bad of ["", "yes", "no", "YES ", "TRUE", "1", "NO;YES"]) {
      const r = runStep(script, { INPUT_REDEPLOY: bad });
      expect(r.status, JSON.stringify(bad)).toBe(1);
    }
  });

  it("validation runs before any database step and before the explicit-intent confirmation", () => {
    expect(idx("- name: Validate redeploy_after_migration input")).toBeLessThan(idx("- name: Confirm explicit intent"));
    expect(idx("- name: Validate redeploy_after_migration input")).toBeLessThan(idx("- name: Checkout code"));
  });

  it("the migration, the runtime-role reconcile and every host, SHA, manifest and verification gate are still present and ordered before any redeploy step", () => {
    const required = [
      "- name: Assert workflow origin is main (fail-closed)",
      "- name: Assert checked-out HEAD equals the reviewed expected_main_sha (MAIN_BATCH, before any database step)",
      "- name: Verify exact production database host matches owner-pinned expectation",
      "- name: MAIN_BATCH preflight (read-only, fail-closed; records recovery point)",
      "- name: MAIN_BATCH post-batch verification (blocking, ledger equals pre-batch anchor plus batch, every object present)",
      "- name: Reconcile runtime role grants (blocking, reconcile-only)",
    ];
    for (const r of required) expect(idx(r), r).toBeLessThan(idx("- name: Trigger production redeploy of main"));
    expect(text).toContain("environment: production-operator");
    expect(text).toContain("MIGRATE PRODUCTION BATCH");
  });
});
