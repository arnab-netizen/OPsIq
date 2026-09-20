/**
 * Regression controls for CI trigger hardening.
 *
 * CI_TRIGGER_GAP_PR284: PR #284 converted from draft to ready-for-review but CI
 * did not re-run because the default pull_request event set omits ready_for_review.
 * This can leave a PR with no CI run at the HEAD that merges.
 *
 * CI_RECOVERY_DISPATCH_ABSENT: main-integration.yml had no workflow_dispatch trigger,
 * making manual re-runs after a missing or stale CI run impossible without a dummy push.
 *
 * These tests are pure YAML file reads — no database, no mocking. They are NOT gated
 * behind SHOULD_RUN_DB_TESTS and run in the standard non-DB PR gate.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import YAML from "js-yaml";

const root = join(__dirname, "..", "..", "..");
const CI_PATH = join(root, ".github", "workflows", "ci.yml");
const MI_PATH = join(root, ".github", "workflows", "main-integration.yml");

type Step = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  shell?: string;
  "timeout-minutes"?: number;
  "continue-on-error"?: boolean;
};
type Job = {
  "timeout-minutes"?: number;
  steps?: Step[];
  needs?: string | string[];
  if?: string;
  services?: Record<string, unknown>;
};
type Workflow = {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
};

const ci = YAML.load(readFileSync(CI_PATH, "utf8")) as Workflow;
const mi = YAML.load(readFileSync(MI_PATH, "utf8")) as Workflow;

// ─── ci.yml trigger coverage ────────────────────────────────────────────────

describe("ci.yml — pull_request trigger coverage (CI_TRIGGER_GAP_PR284)", () => {
  const pr = ci.on["pull_request"] as {
    branches?: string[];
    types?: string[];
  } | undefined;

  it("pull_request trigger is defined", () => {
    expect(pr).toBeDefined();
  });

  it("branches filter includes main", () => {
    const branches = pr?.branches ?? [];
    expect(branches).toContain("main");
  });

  it("explicit types block is present (absent block = missing ready_for_review)", () => {
    expect(Array.isArray(pr?.types)).toBe(true);
    expect((pr?.types ?? []).length).toBeGreaterThan(0);
  });

  it("types includes opened", () => {
    expect(pr?.types ?? []).toContain("opened");
  });

  it("types includes synchronize", () => {
    expect(pr?.types ?? []).toContain("synchronize");
  });

  it("types includes reopened", () => {
    expect(pr?.types ?? []).toContain("reopened");
  });

  it("types includes ready_for_review (the missing type that caused CI_TRIGGER_GAP_PR284)", () => {
    expect(pr?.types ?? []).toContain("ready_for_review");
  });

  it("ci.yml does not have a push trigger (adding one would double-run on every main push)", () => {
    const on = ci.on as Record<string, unknown>;
    expect(on).not.toHaveProperty("push");
  });
});

// ─── main-integration.yml trigger and dispatch controls ────────────────────

describe("main-integration.yml — workflow_dispatch trigger (CI_RECOVERY_DISPATCH_ABSENT)", () => {
  const on = mi.on as Record<string, unknown>;

  // CI-MIN-01: normal pushes to main no longer auto-run the full DB
  // integration suite -- DB-risk validation now runs pre-merge on the PR
  // itself (db-verification.yml), so a PR that already passed the merge
  // gate does not pay for the identical suite a second time post-merge.
  // This workflow is kept available via workflow_dispatch only, for
  // disaster-recovery / release re-verification of main.
  it("push trigger is NOT present (CI-MIN-01 -- DB validation moved pre-merge)", () => {
    expect(on).not.toHaveProperty("push");
  });

  it("workflow_dispatch trigger is present", () => {
    expect(on).toHaveProperty("workflow_dispatch");
  });

  it("workflow_dispatch has no inputs block (callers cannot target an arbitrary SHA)", () => {
    const dispatch = on.workflow_dispatch as { inputs?: Record<string, unknown> } | null | undefined;
    // dispatch is null when 'workflow_dispatch:' is a bare key with no children
    if (dispatch != null) {
      expect(dispatch.inputs).toBeUndefined();
    }
  });
});

// ─── identity gate structural enforcement ──────────────────────────────────

describe("main-integration.yml — identity gate step (fail-closed dispatch)", () => {
  const fullSuiteJob = mi.jobs["full-suite"];
  const steps = fullSuiteJob?.steps ?? [];

  const gateStep = steps.find(
    (s) => typeof s.name === "string" && /identity gate/i.test(s.name)
  );
  const checkoutStep = steps.find(
    (s) => typeof s.name === "string" && /checkout/i.test(s.name)
  );
  const migrationStep = steps.find(
    (s) => typeof s.name === "string" && /prisma database migration/i.test(s.name)
  );
  const dbTestStep = steps.find(
    (s) => typeof s.name === "string" && /run full test suite/i.test(s.name)
  );

  const gateIdx = gateStep ? steps.indexOf(gateStep) : -1;
  const checkoutIdx = checkoutStep ? steps.indexOf(checkoutStep) : -1;
  const migrationIdx = migrationStep ? steps.indexOf(migrationStep) : -1;
  const dbTestIdx = dbTestStep ? steps.indexOf(dbTestStep) : -1;

  it("identity gate step exists", () => {
    expect(gateStep).toBeDefined();
  });

  it("identity gate has an if condition", () => {
    expect(gateStep?.if).toBeDefined();
  });

  it("identity gate if condition gates on workflow_dispatch only", () => {
    expect(gateStep?.if ?? "").toMatch(/workflow_dispatch/);
  });

  it("identity gate runs after checkout (needs the repo)", () => {
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeGreaterThan(checkoutIdx);
  });

  it("identity gate runs before Prisma migration (before DB credentials are consumed)", () => {
    expect(migrationIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(migrationIdx);
  });

  it("identity gate runs before the DB test step", () => {
    expect(dbTestIdx).toBeGreaterThanOrEqual(0);
    expect(gateIdx).toBeLessThan(dbTestIdx);
  });

  it("identity gate is not allow-failure (continue-on-error is false or absent)", () => {
    expect(gateStep?.["continue-on-error"] ?? false).toBe(false);
  });

  it("identity gate run script verifies github.ref equals refs/heads/main", () => {
    expect(gateStep?.run ?? "").toContain("refs/heads/main");
  });

  it("identity gate run script checks HEAD SHA matches github.sha", () => {
    expect(gateStep?.run ?? "").toContain("git rev-parse HEAD");
  });

  it("identity gate run script fetches origin/main to detect post-dispatch main advancement", () => {
    expect(gateStep?.run ?? "").toContain("origin/main");
  });

  it("identity gate run script exits non-zero on any identity failure", () => {
    expect(gateStep?.run ?? "").toContain("exit 1");
  });
});

// ─── ci.yml branch-protection fail-closed semantics (owner correction pass, ─
//     2026-08-29, Issue 9: "Ensure conditional jobs cannot leave the final
//     required check: skipped unexpectedly; permanently pending; falsely
//     green despite classifier failure.")
//
// HOSTILE-AUDIT FINDING, semantics corrected 2026-08-29: branch-protection
// had `needs: [...]` but a plain `if: github.event_name == 'pull_request'`
// with no status-check function in it. The precise mechanism (an earlier
// version of this comment mischaracterized this as the custom `if:`
// "replacing" the success gate, which is not how GitHub Actions actually
// works): GitHub Actions implicitly ANDs a job's `if:` with `success()`
// whenever the condition contains none of success()/always()/cancelled()/
// failure(). So the old condition actually evaluated as
// `success() && github.event_name == 'pull_request'` -- if any upstream
// required job failed, this job's effective condition was false and the job
// was SKIPPED, not executed. The defect is what GitHub does with that skip:
// a skipped job/check is reported to the checks API as a non-blocking,
// passing conclusion, and GitHub's required-status-checks branch protection
// treats a skipped required check as satisfying "required to pass." So the
// one required PR gate still reported green after a real upstream failure --
// via a skip counting as success, not via this job's body executing despite
// failure.
//
// These tests execute the ACTUAL deployed step script (extracted verbatim
// from ci.yml, with GitHub's own `${{ needs.<job>.result }}` template tokens
// substituted exactly the way GitHub's runner substitutes them -- pure text
// substitution before bash ever sees the script) against all 9 scenarios the
// owner named, and assert the real exit code. This proves the real file's
// behavior, not a reimplementation that could drift from it.
describe("ci.yml — branch-protection fails closed on any required-job non-success (Issue 9, 2026-08-29)", () => {
  const bp = ci.jobs["branch-protection"];
  // CI-MIN-01: the standalone `lint` and `bundle-validate` jobs were merged
  // into build-and-test (each previously paid for its own separate `npm ci`
  // on every PR -- see ci.yml's build-and-test job comments). Their steps
  // now run inside build-and-test, so a failure in either surfaces as a
  // build-and-test failure, not a separate job result.
  const requiredJobs = ["classify", "build-and-test", "actionlint"];
  const ALL_SUCCESS: Record<string, string> = Object.fromEntries(requiredJobs.map((j) => [j, "success"]));

  /**
   * Runs the real "Verify all required jobs succeeded" step script from
   * ci.yml's branch-protection job, substituting each `${{ needs.<job>.result }}`
   * token with the given fixture value -- exactly how GitHub Actions'
   * template-expression substitution works (plain text replacement, before
   * the shell interpreter runs) -- then actually executes the resulting
   * script via bash and returns its real exit code.
   *
   * db-verify (CI-MIN-01 owner correction, item 1) is handled separately
   * from the generic per-job loop above: it is the one required job allowed
   * a non-"success" passing result (a legitimate "skipped" when
   * db_required=false), driven by the classifier's own db_required output,
   * so its two tokens are substituted independently via `dbOpts`.
   */
  function runBranchProtectionStep(
    results: Record<string, string>,
    dbOpts: { dbRequired?: string; dbVerifyResult?: string } = {},
  ): { exitCode: number; stdout: string } {
    let script = bp?.steps?.[0]?.run ?? "";
    for (const job of requiredJobs) {
      const token = `\${{ needs.${job}.result }}`;
      const value = results[job];
      expect(value, `test fixture must stub a result for '${job}'`).toBeDefined();
      script = script.split(token).join(value);
    }
    const dbRequired = dbOpts.dbRequired ?? "false";
    const dbVerifyResult = dbOpts.dbVerifyResult ?? "skipped";
    script = script.split("${{ needs.classify.outputs.db_required }}").join(dbRequired);
    script = script.split("${{ needs.db-verify.result }}").join(dbVerifyResult);
    expect(script, "unstubbed GitHub template expression remains in the script").not.toContain("${{");
    try {
      const stdout = execFileSync("bash", ["-c", script], { encoding: "utf8" });
      return { exitCode: 0, stdout };
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      return { exitCode: typeof e.status === "number" ? e.status : 1, stdout: String(e.stdout ?? "") };
    }
  }

  it("branch-protection still depends on every required job", () => {
    expect(bp?.needs).toEqual(expect.arrayContaining(requiredJobs));
  });

  it("branch-protection also depends on db-verify (CI-MIN-01 owner correction, item 1)", () => {
    expect(bp?.needs).toEqual(expect.arrayContaining(["db-verify"]));
  });

  it("branch-protection's if-condition uses always() so it is never silently skipped when a dependency fails or is skipped", () => {
    expect(bp?.if ?? "").toContain("always()");
  });

  it("branch-protection's if-condition still restricts execution to pull_request events", () => {
    expect(bp?.if ?? "").toContain("github.event_name == 'pull_request'");
  });

  it("RECURRENCE GUARD: branch-protection's if-condition is not the bare event-name check alone (the exact bug found by hostile audit -- a custom `if:` with no status-check function is implicitly ANDed with success(), so a failed dependency causes a SKIP, and GitHub reports a skipped required check as passing)", () => {
    expect((bp?.if ?? "").trim()).not.toBe("github.event_name == 'pull_request'");
  });

  // CI-MIN-01: the standalone `lint` and `bundle-validate` jobs were merged
  // into build-and-test, so scenarios that used to name them individually
  // now exercise the same code path via build-and-test's own result --
  // renumbered to match the 3 required jobs that remain.
  describe("real script execution against all required-job scenarios", () => {
    it("1. all upstream success -> aggregate PASS", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS);
      expect(exitCode).toBe(0);
    });

    it("2. build-and-test failure (covers a governance/tsc/prisma/preservation/lint-ratchet/bundle-manifest/build/suite step failing inside it) -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep({ ...ALL_SUCCESS, "build-and-test": "failure" });
      expect(exitCode).not.toBe(0);
    });

    it("3. actionlint failure -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep({ ...ALL_SUCCESS, actionlint: "failure" });
      expect(exitCode).not.toBe(0);
    });

    it("4. classifier (classify job) failure -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep({ ...ALL_SUCCESS, classify: "failure" });
      expect(exitCode).not.toBe(0);
    });

    it("5. cancelled dependency -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep({ ...ALL_SUCCESS, "build-and-test": "cancelled" });
      expect(exitCode).not.toBe(0);
    });

    it("6. unexpected skipped dependency -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep({ ...ALL_SUCCESS, "build-and-test": "skipped" });
      expect(exitCode).not.toBe(0);
    });

    it("7. RECOVERY_INFRA_ONLY (only the expensive step inside build-and-test is conditionally skipped; the job itself still completes success) -> aggregate PASS", () => {
      // A step skipped via its own `if:` does not make the enclosing job's
      // result anything other than success -- that is GitHub Actions'
      // platform behavior, not something this repo's YAML can override. What
      // this repo's YAML controls, and what must be verified, is that the
      // conditionally-skipped step in build-and-test cannot itself cause a
      // failure when skipped: it is one of two mutually-exclusive suiteMode
      // steps (never both run, never both skipped for a given suite_mode),
      // and nothing later in the job unconditionally depends on output only
      // the skipped step would have produced.
      const buildAndTest = ci.jobs["build-and-test"];
      const steps = buildAndTest.steps ?? [];
      const targeted = steps.find((s) => s.name?.includes("Run targeted recovery validation"));
      const broad = steps.find((s) => s.name?.includes("Run non-DB test suite"));
      expect(targeted?.if).toBe("needs.classify.outputs.suite_mode == 'TARGETED_RECOVERY'");
      expect(broad?.if).toBe("needs.classify.outputs.suite_mode == 'BROAD_NON_DB'");

      // With build-and-test's own job-level result still "success" (as it
      // legitimately is when its internal suite step is skipped, not
      // failed), the aggregate gate must pass -- same fixture as scenario 1,
      // asserted again here under its own name because it is the specific
      // case Issue 2's suiteMode design depends on.
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS);
      expect(exitCode).toBe(0);
    });
  });

  // CI-MIN-01 owner correction, item 1: db-verify is the one required job
  // allowed a non-"success" passing result -- but ONLY when the classifier's
  // own db_required output says it was legitimately not needed. These
  // scenarios prove the real script's handling of that conditional exactly,
  // via the same real-script-execution technique as the block above.
  describe("db-verify conditional requirement (CI-MIN-01 owner correction, item 1)", () => {
    it("db_required=true, db-verify=success -> aggregate PASS", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "true", dbVerifyResult: "success" });
      expect(exitCode).toBe(0);
    });

    it("db_required=false, db-verify=skipped (the normal case for a non-DB-risk PR) -> aggregate PASS", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "false", dbVerifyResult: "skipped" });
      expect(exitCode).toBe(0);
    });

    it("db_required=true, db-verify=skipped -> aggregate FAIL (a DB-risk PR must not merge with no DB validation)", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "true", dbVerifyResult: "skipped" });
      expect(exitCode).not.toBe(0);
    });

    it("db_required=true, db-verify=failure -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "true", dbVerifyResult: "failure" });
      expect(exitCode).not.toBe(0);
    });

    it("db_required=true, db-verify=cancelled -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "true", dbVerifyResult: "cancelled" });
      expect(exitCode).not.toBe(0);
    });

    it("db_required=false, db-verify=failure (defensive -- should be unreachable given db-verify's own if: gate, but must still fail closed) -> aggregate FAIL", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "false", dbVerifyResult: "failure" });
      expect(exitCode).not.toBe(0);
    });

    it("db_required=false, db-verify=success (also should be unreachable, but a job that ran and succeeded must never fail the gate) -> aggregate PASS", () => {
      const { exitCode } = runBranchProtectionStep(ALL_SUCCESS, { dbRequired: "false", dbVerifyResult: "success" });
      expect(exitCode).toBe(0);
    });
  });
});
