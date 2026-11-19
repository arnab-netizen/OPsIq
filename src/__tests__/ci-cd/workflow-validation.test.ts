/**
 * Tests: CI/CD Workflow Validation
 *
 * Validates that GitHub Actions workflows are properly configured
 * and can execute all required checks.
 *
 * Contract source (STALE_TEST_CONTRACT fix): this file previously asserted the
 * pre-CI-MIN-01 shape of ci.yml (a push-to-main trigger, a separate `lint` job,
 * a postgres service on build-and-test, a single "Run full test suite" step
 * running `npm run test:ci`, a 30-minute job cap) and a push trigger on
 * deploy-staging.yml. Both workflows were deliberately restructured:
 *   - ci.yml (CI-MIN-01, see the header comments in .github/workflows/ci.yml):
 *     PR-only gate; classify -> build-and-test / db-verify / actionlint ->
 *     branch-protection (the one required status check, fail-closed on every
 *     dependency's `.result`); lint folded into build-and-test as one ESLint
 *     traversal + blocking ratchet; DB validation moved into the classifier-gated
 *     `db-verify` job with its own throwaway Postgres service; build-and-test job
 *     cap derived in docs/opsiq/ci/NON_DB_SUITE_CAPACITY.md.
 *   - deploy-staging.yml: RETAIN_DISPATCH_ONLY in the 2026-07-12 CI cost
 *     remediation (docs/internal-reference/audits/2026-07-12/BASELINE_WORKFLOW_INVENTORY.json).
 * Every assertion below tests that current contract; every still-valid assertion
 * of the old file is kept unchanged.
 *
 * Pure YAML/markdown file reads — no database. Like ci-trigger-governance.test.ts
 * it is NOT gated behind SHOULD_RUN_DB_TESTS, so it runs in the mandatory non-DB
 * PR gate (build-and-test "Run non-DB test suite") instead of never running.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import YAML from "js-yaml";

type Step = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  "timeout-minutes"?: number;
  "continue-on-error"?: boolean;
};
type Service = {
  image?: string;
  env?: Record<string, string>;
  options?: string;
  ports?: string[];
};
type Job = {
  name?: string;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  needs?: string | string[];
  if?: string;
  outputs?: Record<string, string>;
  env?: Record<string, string>;
  services?: Record<string, Service>;
  strategy?: { matrix?: Record<string, unknown[]> };
  permissions?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  name: string;
  on: Record<string, unknown>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  jobs: Record<string, Job>;
};

const REQUIRED_CI_JOBS = [
  "classify",
  "build-and-test",
  "db-verify",
  "actionlint",
  "branch-protection",
] as const;

function loadWorkflow(file: string): Workflow {
  const p = path.join(process.cwd(), ".github/workflows", file);
  return YAML.load(fs.readFileSync(p, "utf-8")) as Workflow;
}

function stepNamed(job: Job, name: string): Step {
  const step = job.steps.find((s) => s.name === name);
  expect(step, `step "${name}" must exist`).toBeDefined();
  return step as Step;
}

function asArray(needs: string | string[] | undefined): string[] {
  if (needs === undefined) return [];
  return Array.isArray(needs) ? needs : [needs];
}

describe("CI/CD Workflow Validation", () => {
  describe("Main CI Workflow (.github/workflows/ci.yml)", () => {
    let ciWorkflow: Workflow;

    beforeEach(() => {
      ciWorkflow = loadWorkflow("ci.yml");
    });

    it("should have correct workflow name", () => {
      expect(ciWorkflow.name).toBe("CI - Build & Test");
    });

    it("should trigger on PRs to main (including ready_for_review) and NOT on push (CI-MIN-01 PR-only gate)", () => {
      const pr = ciWorkflow.on.pull_request as { branches: string[]; types: string[] };
      expect(pr.branches).toContain("main");
      expect(pr.types).toEqual(
        expect.arrayContaining(["opened", "synchronize", "reopened", "ready_for_review"])
      );
      expect(ciWorkflow.on).not.toHaveProperty("push");
    });

    it("should cancel superseded runs of the same ref", () => {
      expect(ciWorkflow.concurrency?.group).toContain("github.ref");
      expect(ciWorkflow.concurrency?.["cancel-in-progress"]).toBe(true);
    });

    it("should have exactly the required job set", () => {
      expect(Object.keys(ciWorkflow.jobs).sort()).toEqual([...REQUIRED_CI_JOBS].sort());
    });

    it("should have build-and-test job", () => {
      expect(ciWorkflow.jobs).toHaveProperty("build-and-test");
    });

    it("lint has no separate job; it runs inside build-and-test (CI-MIN-01: one npm ci per job)", () => {
      expect(ciWorkflow.jobs).not.toHaveProperty("lint");
      const lintSteps = ciWorkflow.jobs["build-and-test"].steps.filter((s) =>
        /npm run lint(\s|$)/.test(s.run ?? "")
      );
      expect(lintSteps).toHaveLength(1);
    });

    it("classify job exposes the risk outputs every downstream job is gated on", () => {
      const classify = ciWorkflow.jobs["classify"];
      expect(Object.keys(classify.outputs ?? {})).toEqual(
        expect.arrayContaining(["risk_class", "run_non_db_suite", "suite_mode", "db_required"])
      );
      expect(classify.outputs?.db_required).toContain("steps.classify.outputs.db_required");
      const step = classify.steps.find((s) => (s as { id?: string }).id === "classify");
      expect(step?.run).toContain("set -euo pipefail");
      expect(step?.run).toContain("node scripts/ci-risk-classifier.mjs");
      expect(step?.run).toContain('>> "$GITHUB_OUTPUT"');
    });

    it("build-and-test and db-verify both depend on classify", () => {
      expect(asArray(ciWorkflow.jobs["build-and-test"].needs)).toContain("classify");
      expect(asArray(ciWorkflow.jobs["db-verify"].needs)).toContain("classify");
    });

    it("build-and-test job has NO PostgreSQL service and runs with TEST_WITH_DB=false (DB work lives in db-verify)", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      expect(buildJob.services).toBeUndefined();
      expect(buildJob.env?.TEST_WITH_DB).toBe("false");
    });

    it("db-verify job should have a PostgreSQL service with a health check", () => {
      const dbJob = ciWorkflow.jobs["db-verify"];
      expect(dbJob.services).toHaveProperty("postgres");
      const pg = dbJob.services!.postgres;
      expect(pg.image).toContain("postgres");
      expect(pg.image).toBe("postgres:16");
      expect(pg.options).toContain("--health-cmd");
      expect(pg.options).toContain("pg_isready");
      expect(pg.ports).toContain("5432:5432");
    });

    it("db-verify is gated on exactly the classifier's db_required output", () => {
      expect(ciWorkflow.jobs["db-verify"].if).toBe("needs.classify.outputs.db_required == 'true'");
    });

    it("db-verify runs with the DB gate on, a throwaway CI database target, and DATABASE_URL pointing at the service", () => {
      const env = ciWorkflow.jobs["db-verify"].env ?? {};
      expect(env.TEST_WITH_DB).toBe("true");
      expect(env.OPSIQ_DB_TARGET).toBe("ci");
      expect(env.DATABASE_URL).toContain("@localhost:5432/");
      expect(env.TEST_DATABASE_URL).toBe(env.DATABASE_URL);
    });

    it("db-verify generates the client, validates, and deploys migrations (never reset / db push) before running DB tests", () => {
      const steps = ciWorkflow.jobs["db-verify"].steps;
      const idx = (name: string) => steps.findIndex((s) => s.name === name);
      expect(stepNamed(ciWorkflow.jobs["db-verify"], "Generate Prisma client").run).toBe("npx prisma generate");
      expect(stepNamed(ciWorkflow.jobs["db-verify"], "Prisma validate").run).toBe("npx prisma validate");
      const migrate = stepNamed(ciWorkflow.jobs["db-verify"], "Prisma migrate deploy (throwaway container)");
      expect(migrate.run).toBe("npx prisma migrate deploy");
      const suiteIdx = idx("Run DB test suite (*.db.test.ts only)");
      expect(idx("Prisma migrate deploy (throwaway container)")).toBeLessThan(suiteIdx);
      for (const s of steps) {
        expect(s.run ?? "").not.toMatch(/prisma migrate reset|prisma db push/);
      }
      // A step-level `if:` on any of these would let db-verify report success without running DB tests.
      for (const name of [
        "Generate Prisma client",
        "Prisma validate",
        "Prisma migrate deploy (throwaway container)",
        "Run DB test suite (*.db.test.ts only)",
      ]) {
        expect(stepNamed(ciWorkflow.jobs["db-verify"], name)["if"], `${name} must run unconditionally`).toBeUndefined();
      }
    });

    it("build-and-test should run TypeScript check", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const steps = buildJob.steps;
      const tsStep = steps.find(
        (step) => step.name === "TypeScript type checking"
      );
      expect(tsStep).toBeDefined();
      expect(tsStep!.run).toContain("npx tsc --noEmit");
      expect(tsStep!["continue-on-error"]).toBe(false);
    });

    it("build-and-test should validate Prisma schema", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const steps = buildJob.steps;
      const prismaStep = steps.find(
        (step) => step.name === "Prisma schema validation"
      );
      expect(prismaStep).toBeDefined();
      expect(prismaStep!.run).toContain("npx prisma validate");
      expect(prismaStep!["continue-on-error"]).toBe(false);
    });

    it("build-and-test should run npm build (blocking)", () => {
      const buildStep = stepNamed(ciWorkflow.jobs["build-and-test"], "Production build");
      expect(buildStep.run).toContain("npm run build");
      expect(buildStep["continue-on-error"]).toBe(false);
    });

    it("build-and-test runs the blocking governance gates", () => {
      const job = ciWorkflow.jobs["build-and-test"];
      const expected: Array<[string, string]> = [
        ["Governance compliance scan", "npm run governance:scan:strict"],
        ["Auth route governance scan (blocking)", "npm run governance:scan:auth"],
        ["A7.7 recurrence prevention gates (blocking)", "npm run governance:scan:a77"],
        ["Wrapped handlers ratchet (prevent new violations)", "npm run audit:wrapped-handlers:ratchet"],
        ["CI workflow governance check (prevent trigger regressions)", "node scripts/ci-governance-check.mjs"],
        ["Recurrence defect scanners", "node scripts/scan-recurrence-defects.mjs"],
        ["Bundle manifest validator (evidence and closure conditions)", "node scripts/validate-bundle-manifests.mjs"],
        ["Stage 7 evidence artifact validator", "node scripts/validate-evidence-artifacts.mjs"],
      ];
      for (const [name, cmd] of expected) {
        const step = stepNamed(job, name);
        expect(step.run).toContain(cmd);
        expect(step["continue-on-error"]).toBe(false);
      }
    });

    it("build-and-test runs the non-DB suite (blocking, quarantine computed from the ledger, *.db.test.ts excluded)", () => {
      const step = stepNamed(
        ciWorkflow.jobs["build-and-test"],
        "Run non-DB test suite (blocking; DB tests and quarantine excluded)"
      );
      expect(step.if).toBe("needs.classify.outputs.suite_mode == 'BROAD_NON_DB'");
      expect(step.run).toContain("npx vitest run");
      expect(step.run).toContain("--exclude '**/*.db.test.ts'");
      expect(step.run).toContain(".claude/test-quarantine.json");
      expect(step.env?.TEST_WITH_DB).toBe("false");
      expect(step["continue-on-error"]).toBe(false);
    });

    it("db-verify should run the DB tests with DATABASE_URL (blocking)", () => {
      const dbJob = ciWorkflow.jobs["db-verify"];
      const testStep = stepNamed(dbJob, "Run DB test suite (*.db.test.ts only)");
      expect(testStep.run).toContain("npm test");
      expect(testStep.run).toContain(".db.test.ts");
      expect(testStep["continue-on-error"]).toBe(false);
      expect(dbJob.env).toHaveProperty("DATABASE_URL");
    });

    it("build-and-test should run npm run lint as visibility-only (diagnostic)", () => {
      const steps = ciWorkflow.jobs["build-and-test"].steps;
      const lintStep = steps.find(
        (step) => step.name !== undefined && step.name.includes("linter")
      );
      expect(lintStep).toBeDefined();
      expect(lintStep!.run).toContain("npm run lint");
      expect(lintStep!.run).toContain("-o eslint-report.json");
      expect(lintStep!["continue-on-error"]).toBe(true);
    });

    it("build-and-test should enforce regression gate with lint:ratchet", () => {
      const steps = ciWorkflow.jobs["build-and-test"].steps;
      const ratchetStep = steps.find(
        (step) => step.name !== undefined && step.name.includes("ratchet") && (step.run ?? "").includes("lint:ratchet")
      );
      expect(ratchetStep).toBeDefined();
      expect(ratchetStep!.run).toContain("npm run lint:ratchet");
      expect(ratchetStep!.run).toContain("--from-result eslint-report.json");
      expect(ratchetStep!["continue-on-error"]).toBe(false);
      expect(ratchetStep!.if).toBe(
        steps.find((s) => s.name?.includes("linter"))!.if
      );
      const lintIdx = steps.findIndex((s) => s.name?.includes("linter"));
      expect(steps.indexOf(ratchetStep!)).toBeGreaterThan(lintIdx);
    });

    it("branch-protection job should depend on every other required job", () => {
      const branchJob = ciWorkflow.jobs["branch-protection"];
      const needs = asArray(branchJob.needs);
      for (const job of REQUIRED_CI_JOBS.filter((j) => j !== "branch-protection")) {
        expect(needs).toContain(job);
      }
    });

    it("branch-protection always runs on PRs and fails closed on each dependency's result", () => {
      const branchJob = ciWorkflow.jobs["branch-protection"];
      expect(branchJob.if).toContain("always()");
      expect(branchJob.if).toContain("github.event_name == 'pull_request'");
      expect(branchJob.steps).toHaveLength(1);
      const script = branchJob.steps[0].run ?? "";
      expect(branchJob.steps[0]["continue-on-error"]).toBeUndefined();
      expect(script).toContain("set -euo pipefail");
      for (const job of ["classify", "build-and-test", "actionlint", "db-verify"]) {
        expect(script).toContain(`\${{ needs.${job}.result }}`);
      }
      expect(script).toContain('[ "$status" != "success" ]');
      expect(script).toContain("${{ needs.classify.outputs.db_required }}");
      expect(script).toMatch(/exit 1/);
    });

    it("should set reasonable timeouts (job caps bounded; build-and-test cap exceeds every step cap)", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      // Derived in docs/opsiq/ci/NON_DB_SUITE_CAPACITY.md (2026-11 addendum): 45-min suite step + ~5.1 min setup.
      expect(buildJob["timeout-minutes"]).toBe(55);
      const stepCaps = buildJob.steps
        .map((s) => s["timeout-minutes"])
        .filter((t): t is number => typeof t === "number");
      expect(stepCaps.length).toBeGreaterThan(0);
      expect(buildJob["timeout-minutes"]!).toBeGreaterThan(Math.max(...stepCaps));
      for (const name of ["classify", "build-and-test", "db-verify", "actionlint"]) {
        const t = ciWorkflow.jobs[name]["timeout-minutes"];
        expect(typeof t, `${name} must declare timeout-minutes`).toBe("number");
        expect(t!).toBeGreaterThan(0);
        expect(t!).toBeLessThanOrEqual(60);
      }
    });

    it("should have Node.js setup step", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const nodeSetup = buildJob.steps.find(
        (step) => step.name === "Setup Node.js"
      );
      expect(nodeSetup).toBeDefined();
      expect(nodeSetup!.uses).toContain("setup-node");
    });

    it("every Node setup in ci.yml pins Node 20.x", () => {
      expect(ciWorkflow.jobs["build-and-test"].strategy?.matrix?.["node-version"]).toEqual(["20.x"]);
      for (const name of ["classify", "build-and-test", "db-verify"]) {
        const setup = stepNamed(ciWorkflow.jobs[name], "Setup Node.js");
        expect(setup.uses).toBe("actions/setup-node@v4");
        const v = String(setup.with?.["node-version"]);
        expect(v === "20.x" || v === "${{ matrix.node-version }}").toBe(true);
      }
    });

    it("actionlint validates changed workflow YAML", () => {
      const step = stepNamed(ciWorkflow.jobs["actionlint"], "Validate changed workflow YAML with actionlint");
      expect(step.run).toContain("set -euo pipefail");
      expect(step.run).toContain("./actionlint");
      expect(step.run).toContain(".github/workflows/*.yml");
    });
  });

  describe("Staging Deployment Workflow (.github/workflows/deploy-staging.yml)", () => {
    let deployWorkflow: Workflow;

    beforeEach(() => {
      deployWorkflow = loadWorkflow("deploy-staging.yml");
    });

    it("should have correct workflow name", () => {
      expect(deployWorkflow.name).toBe("Deploy to Staging");
    });

    it("should be dispatch-only: no push or pull_request auto-trigger (2026-07-12 RETAIN_DISPATCH_ONLY)", () => {
      expect(Object.keys(deployWorkflow.on)).toEqual(["workflow_dispatch"]);
      expect(deployWorkflow.on).not.toHaveProperty("push");
      expect(deployWorkflow.on).not.toHaveProperty("pull_request");
    });

    it("should allow manual trigger (workflow_dispatch)", () => {
      expect(deployWorkflow.on).toHaveProperty("workflow_dispatch");
    });

    it("deploy job should run pre-deployment checks", () => {
      const deployJob = deployWorkflow.jobs["deploy"];
      const steps = deployJob.steps;
      const checkStep = steps.find(
        (step) => step.name === "Run pre-deployment checks"
      );
      expect(checkStep).toBeDefined();
      expect(checkStep!.run).toContain("npx tsc --noEmit");
      expect(checkStep!.run).toContain("npx prisma validate");
      expect(checkStep!.run).toContain("npm run build");
    });

    it("should have post-deploy-tests job", () => {
      expect(deployWorkflow.jobs).toHaveProperty("post-deploy-tests");
    });

    it("post-deploy-tests should depend on deploy job", () => {
      const postJob = deployWorkflow.jobs["post-deploy-tests"];
      expect(postJob.needs).toBe("deploy");
    });
  });

  describe("Branch Protection Configuration", () => {
    let protectionDocs: string;

    beforeEach(() => {
      const docsPath = path.join(
        process.cwd(),
        "docs/BRANCH_PROTECTION_RULES.md"
      );
      protectionDocs = fs.readFileSync(docsPath, "utf-8");
    });

    it("documents exactly the one required status check ci.yml provides, never a context that does not report", () => {
      expect(protectionDocs).toContain('"context": "branch-protection"');
      expect(protectionDocs).toContain("integration_id\": 15368");
      expect(protectionDocs).not.toMatch(/"contexts":\s*\[/);
      expect(protectionDocs).not.toContain('"lint"');
      const ci = loadWorkflow("ci.yml");
      expect(ci.jobs["branch-protection"]).toBeDefined();
      expect(ci.jobs["lint"]).toBeUndefined();
    });

    it("documents the real review policy (0 approvals) and that the aggregate gates db-verify when required", () => {
      expect(protectionDocs).toContain("required_approving_review_count\": 0");
      expect(protectionDocs).not.toContain("Minimum 1 review approval");
      expect(protectionDocs).toContain("db_required=true");
    });

    it("documents the strict up-to-date requirement", () => {
      expect(protectionDocs).toContain("strict_required_status_checks_policy\": true");
      expect(protectionDocs).toContain("up to date");
    });

    it("should include API configuration instructions", () => {
      expect(protectionDocs).toContain("GitHub API");
      expect(protectionDocs).toContain("curl");
    });
  });

  describe("Workflow File Format", () => {
    it("ci.yml should be valid YAML", () => {
      const parsed = loadWorkflow("ci.yml");
      expect(parsed).toBeDefined();
      expect(parsed.jobs).toBeDefined();
    });

    it("deploy-staging.yml should be valid YAML", () => {
      const parsed = loadWorkflow("deploy-staging.yml");
      expect(parsed).toBeDefined();
      expect(parsed.jobs).toBeDefined();
    });
  });

  describe("Security Configuration", () => {
    let ciWorkflow: Workflow;
    let deployWorkflow: Workflow;

    beforeEach(() => {
      ciWorkflow = loadWorkflow("ci.yml");
      deployWorkflow = loadWorkflow("deploy-staging.yml");
    });

    it("CI should use checkout@v4 (secure version)", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const checkoutStep = buildJob.steps.find(
        (step) => step.uses !== undefined && step.uses.includes("checkout")
      );
      expect(checkoutStep!.uses).toContain("checkout@v4");
    });

    it("every checkout in ci.yml uses checkout@v4", () => {
      for (const [name, job] of Object.entries(ciWorkflow.jobs)) {
        for (const step of job.steps) {
          if (step.uses?.includes("actions/checkout")) {
            expect(step.uses, `${name}`).toBe("actions/checkout@v4");
          }
        }
      }
    });

    it("deploy should request id-token permission", () => {
      const deployJob = deployWorkflow.jobs["deploy"];
      expect(deployJob.permissions).toHaveProperty("id-token");
      expect(deployJob.permissions!["id-token"]).toBe("write");
    });

    it("should use npm ci instead of npm install in CI (bounded retry of npm ci only)", () => {
      for (const name of ["build-and-test", "db-verify"]) {
        const installStep = stepNamed(ciWorkflow.jobs[name], "Install dependencies");
        const run = installStep.run ?? "";
        expect(run).toContain("for i in 1 2 3; do");
        expect(run).toContain("npm ci && break");
        expect(run).not.toMatch(/npm (install|i)(\s|$)/);
      }
      for (const job of Object.values(ciWorkflow.jobs)) {
        for (const step of job.steps) {
          expect(step.run ?? "").not.toMatch(/\bnpm install\b/);
        }
      }
    });
  });
});
