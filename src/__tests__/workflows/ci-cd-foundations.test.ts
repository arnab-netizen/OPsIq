import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

describe("CI/CD Foundations Workflow (.github/workflows/ci-cd-foundations.yml)", () => {
  let workflowContent: unknown;
  let workflowPath: string;

  beforeAll(() => {
    workflowPath = path.join(
      process.cwd(),
      ".github/workflows/ci-cd-foundations.yml"
    );
    const fileContent = fs.readFileSync(workflowPath, "utf-8");
    workflowContent = yaml.load(fileContent);
  });

  describe("Workflow metadata", () => {
    it("should have correct name", () => {
      expect(workflowContent.name).toBe("CI/CD Foundations - Phase 13 Slice 1");
    });

    it("should define triggers: push, pull_request, workflow_dispatch", () => {
      expect(workflowContent.on).toBeDefined();
      expect(workflowContent.on.push).toBeDefined();
      expect(workflowContent.on.pull_request).toBeDefined();
      expect(workflowContent.on.workflow_dispatch).toBeDefined();
    });

    it("should trigger on main and develop branches for push", () => {
      const pushBranches = workflowContent.on.push.branches;
      expect(pushBranches).toContain("main");
      expect(pushBranches).toContain("develop");
    });

    it("should trigger on main and develop branches for pull_request", () => {
      const prBranches = workflowContent.on.pull_request.branches;
      expect(prBranches).toContain("main");
      expect(prBranches).toContain("develop");
    });
  });

  describe("Concurrency control", () => {
    it("should define concurrency group with workflow and ref", () => {
      expect(workflowContent.concurrency).toBeDefined();
      expect(workflowContent.concurrency.group).toBe(
        "${{ github.workflow }}-${{ github.ref }}"
      );
    });

    it("should cancel in-progress runs on same ref", () => {
      expect(workflowContent.concurrency["cancel-in-progress"]).toBe(true);
    });
  });

  describe("Jobs structure", () => {
    it("should define all required jobs", () => {
      expect(workflowContent.jobs).toBeDefined();
      expect(workflowContent.jobs.verify).toBeDefined();
      expect(workflowContent.jobs.test).toBeDefined();
      expect(workflowContent.jobs["branch-protection"]).toBeDefined();
      expect(workflowContent.jobs["deploy-staging"]).toBeDefined();
    });
  });

  describe("Verify job (build + type + prisma)", () => {
    let verifyJob: unknown;

    beforeAll(() => {
      verifyJob = workflowContent.jobs.verify;
    });

    it("should have correct name", () => {
      expect(verifyJob.name).toBe("Build + Type + Prisma Verify");
    });

    it("should run on ubuntu-latest", () => {
      expect(verifyJob["runs-on"]).toBe("ubuntu-latest");
    });

    it("should have 20 minute timeout", () => {
      expect(verifyJob["timeout-minutes"]).toBe(20);
    });

    it("should set NODE_ENV=test and SKIP_ENV_VALIDATION=true", () => {
      expect(verifyJob.env.NODE_ENV).toBe("test");
      expect(verifyJob.env.SKIP_ENV_VALIDATION).toBe("true");
    });

    it("should have checkout step with fetch-depth=0", () => {
      const checkoutStep = verifyJob.steps[0];
      expect(checkoutStep.name).toContain("Checkout");
      expect(checkoutStep.uses).toContain("actions/checkout@v4");
      expect(checkoutStep.with["fetch-depth"]).toBe(0);
    });

    it("should setup Node.js 20 with npm cache", () => {
      const nodeStep = verifyJob.steps[1];
      expect(nodeStep.name).toContain("Setup Node.js");
      expect(nodeStep.with["node-version"]).toBe("20");
      expect(nodeStep.with.cache).toBe("npm");
    });

    it("should install dependencies with npm ci", () => {
      const installStep = verifyJob.steps[2];
      expect(installStep.name).toContain("Install dependencies");
      expect(installStep.run).toBe("npm ci");
    });

    it("should validate prisma schema", () => {
      const prismaStep = verifyJob.steps[3];
      expect(prismaStep.name).toContain("Prisma validate");
      expect(prismaStep.run).toBe("npx prisma validate");
    });

    it("should run typescript type-check with --noEmit", () => {
      const typeCheckStep = verifyJob.steps[4];
      expect(typeCheckStep.name).toContain("TypeScript");
      expect(typeCheckStep.run).toBe("npx tsc --noEmit");
    });

    it("should build Next.js", () => {
      const buildStep = verifyJob.steps[5];
      expect(buildStep.name).toContain("Next.js build");
      expect(buildStep.run).toBe("npm run build");
    });

    it("should have exactly 6 steps", () => {
      expect(verifyJob.steps.length).toBe(6);
    });
  });

  describe("Test job", () => {
    let testJob: unknown;

    beforeAll(() => {
      testJob = workflowContent.jobs.test;
    });

    it("should have correct name", () => {
      expect(testJob.name).toBe("Run Tests");
    });

    it("should run on ubuntu-latest", () => {
      expect(testJob["runs-on"]).toBe("ubuntu-latest");
    });

    it("should have 30 minute timeout", () => {
      expect(testJob["timeout-minutes"]).toBe(30);
    });

    it("should depend on verify job", () => {
      expect(testJob.needs).toBe("verify");
    });

    it("should set NODE_ENV=test and SKIP_ENV_VALIDATION=true", () => {
      expect(testJob.env.NODE_ENV).toBe("test");
      expect(testJob.env.SKIP_ENV_VALIDATION).toBe("true");
    });

    it("should checkout code", () => {
      const checkoutStep = testJob.steps[0];
      expect(checkoutStep.name).toContain("Checkout");
    });

    it("should setup Node.js 20", () => {
      const nodeStep = testJob.steps[1];
      expect(nodeStep.with["node-version"]).toBe("20");
    });

    it("should install dependencies", () => {
      const installStep = testJob.steps[2];
      expect(installStep.run).toBe("npm ci");
    });

    it("should run tests with continue-on-error", () => {
      const testStep = testJob.steps[3];
      expect(testStep.name).toContain("Run tests");
      expect(testStep.run).toBe("npm test");
      expect(testStep["continue-on-error"]).toBe(true);
    });

    it("should add test summary to GitHub Step Summary", () => {
      const summaryStep = testJob.steps[4];
      expect(summaryStep.name).toContain("Test Summary");
      expect(summaryStep.if).toBe("always()");
      expect(summaryStep.run).toContain("GITHUB_STEP_SUMMARY");
    });
  });

  describe("Branch protection job", () => {
    let branchProtectionJob: unknown;

    beforeAll(() => {
      branchProtectionJob = workflowContent.jobs["branch-protection"];
    });

    it("should have correct name", () => {
      expect(branchProtectionJob.name).toBe("Enforce Branch Protection");
    });

    it("should run on ubuntu-latest", () => {
      expect(branchProtectionJob["runs-on"]).toBe("ubuntu-latest");
    });

    it("should depend on verify and test", () => {
      expect(branchProtectionJob.needs).toEqual(["verify", "test"]);
    });

    it("should run even if previous jobs fail (always)", () => {
      expect(branchProtectionJob.if).toBe("always()");
    });

    it("should have contents:read and pull-requests:read permissions", () => {
      expect(branchProtectionJob.permissions.contents).toBe("read");
      expect(branchProtectionJob.permissions["pull-requests"]).toBe("read");
    });

    it("should check PR status and enforce verify success", () => {
      const prCheckStep = branchProtectionJob.steps[1];
      expect(prCheckStep.name).toContain("Check PR status");
      expect(prCheckStep.if).toBe("github.event_name == 'pull_request'");
      expect(prCheckStep.run).toContain('needs.verify.result');
      expect(prCheckStep.run).toContain('exit 1');
    });

    it("should report workflow status to GitHub summary", () => {
      const statusStep = branchProtectionJob.steps[2];
      expect(statusStep.name).toContain("Report workflow status");
      expect(statusStep.if).toBe("always()");
      expect(statusStep.run).toContain("Verify (build/type/prisma)");
      expect(statusStep.run).toContain("Tests");
    });
  });

  describe("Deploy-staging job", () => {
    let deployStagingJob: unknown;

    beforeAll(() => {
      deployStagingJob = workflowContent.jobs["deploy-staging"];
    });

    it("should have correct name", () => {
      expect(deployStagingJob.name).toBe("Auto-deploy to Staging");
    });

    it("should run on ubuntu-latest", () => {
      expect(deployStagingJob["runs-on"]).toBe("ubuntu-latest");
    });

    it("should depend on verify and test", () => {
      expect(deployStagingJob.needs).toEqual(["verify", "test"]);
    });

    it("should only trigger on main branch push", () => {
      expect(deployStagingJob.if).toBe(
        "github.ref == 'refs/heads/main' && github.event_name == 'push'"
      );
    });

    it("should have contents:read and deployments:write permissions", () => {
      expect(deployStagingJob.permissions.contents).toBe("read");
      expect(deployStagingJob.permissions.deployments).toBe("write");
    });

    it("should create deployment with github-script", () => {
      const deployStep = deployStagingJob.steps[1];
      expect(deployStep.name).toContain("Create deployment");
      expect(deployStep.uses).toContain("actions/github-script@v7");
      expect(deployStep.with.script).toContain("github.rest.repos.createDeployment");
    });

    it("should set environment to staging", () => {
      const deployStep = deployStagingJob.steps[1];
      expect(deployStep.with.script).toContain("environment: 'staging'");
    });

    it("should add deployment notification to GitHub summary", () => {
      const notifyStep = deployStagingJob.steps[2];
      expect(notifyStep.name).toContain("Deployment notification");
      expect(notifyStep.run).toContain("GITHUB_STEP_SUMMARY");
      expect(notifyStep.run).toContain("Manual approval required");
    });
  });

  describe("Gate enforcement", () => {
    it("verify job must complete before test job runs", () => {
      const testJob = workflowContent.jobs.test;
      expect(testJob.needs).toBe("verify");
    });

    it("branch-protection enforces verify passed for PRs", () => {
      const branchProtection = workflowContent.jobs["branch-protection"];
      const prCheckStep = branchProtection.steps[1];
      expect(prCheckStep.run).toContain("needs.verify.result");
      expect(prCheckStep.run).toContain("success");
    });

    it("staging deployment only on main branch push", () => {
      const deployStagingJob = workflowContent.jobs["deploy-staging"];
      expect(deployStagingJob.if).toContain("refs/heads/main");
      expect(deployStagingJob.if).toContain("push");
    });
  });

  describe("GitHub Actions best practices", () => {
    it("should use checkout@v4", () => {
      const verify = workflowContent.jobs.verify;
      const checkout = verify.steps[0];
      expect(checkout.uses).toContain("actions/checkout@v4");
    });

    it("should use setup-node@v4", () => {
      const verify = workflowContent.jobs.verify;
      const nodeSetup = verify.steps[1];
      expect(nodeSetup.uses).toContain("actions/setup-node@v4");
    });

    it("should use github-script@v7", () => {
      const deployStagingJob = workflowContent.jobs["deploy-staging"];
      const deployStep = deployStagingJob.steps[1];
      expect(deployStep.uses).toContain("actions/github-script@v7");
    });

    it("should use npm cache for Node.js setup", () => {
      const verify = workflowContent.jobs.verify;
      const nodeSetup = verify.steps[1];
      expect(nodeSetup.with.cache).toBe("npm");
    });

    it("should use fetch-depth=0 for full history", () => {
      const verify = workflowContent.jobs.verify;
      const checkout = verify.steps[0];
      expect(checkout.with["fetch-depth"]).toBe(0);
    });
  });

  describe("CI/CD gates verification", () => {
    it("verify job runs: npm ci, prisma validate, tsc, build", () => {
      const verifyJob = workflowContent.jobs.verify;
      const runs = verifyJob.steps.map((s: unknown) => s.run).filter(Boolean);
      expect(runs).toContain("npm ci");
      expect(runs).toContain("npx prisma validate");
      expect(runs).toContain("npx tsc --noEmit");
      expect(runs).toContain("npm run build");
    });

    it("test job runs: npm ci, npm test", () => {
      const testJob = workflowContent.jobs.test;
      const runs = testJob.steps.map((s: unknown) => s.run).filter(Boolean);
      expect(runs).toContain("npm ci");
      expect(runs).toContain("npm test");
    });

    it("branch-protection reports to GitHub summary", () => {
      const branchProtectionJob = workflowContent.jobs["branch-protection"];
      const statusStep = branchProtectionJob.steps[2];
      expect(statusStep.run).toContain("Workflow Status");
      expect(statusStep.run).toContain("needs.verify.result");
      expect(statusStep.run).toContain("needs.test.result");
    });
  });

  describe("Deployment workflow", () => {
    it("deploy-staging only runs after verify and test pass", () => {
      const deployStagingJob = workflowContent.jobs["deploy-staging"];
      expect(deployStagingJob.needs).toEqual(["verify", "test"]);
      expect(deployStagingJob.if).toContain("main");
      expect(deployStagingJob.if).toContain("push");
    });

    it("deploy-staging creates GitHub deployment with staging environment", () => {
      const deployStagingJob = workflowContent.jobs["deploy-staging"];
      const deployStep = deployStagingJob.steps[1];
      const script = deployStep.with.script;
      expect(script).toContain("environment: 'staging'");
      expect(script).toContain("auto_merge: false");
    });

    it("staging deployment notes manual approval required", () => {
      const deployStagingJob = workflowContent.jobs["deploy-staging"];
      const notifyStep = deployStagingJob.steps[2];
      expect(notifyStep.run).toContain("Manual approval required");
    });
  });

  describe("Workflow file YAML syntax", () => {
    it("should be valid YAML", () => {
      expect(workflowContent).toBeDefined();
      expect(typeof workflowContent).toBe("object");
    });

    it("should not have undefined critical fields", () => {
      expect(workflowContent.name).toBeTruthy();
      expect(workflowContent.on).toBeTruthy();
      expect(workflowContent.jobs).toBeTruthy();
    });

    it("file should exist at .github/workflows/ci-cd-foundations.yml", () => {
      expect(fs.existsSync(workflowPath)).toBe(true);
    });
  });
});
