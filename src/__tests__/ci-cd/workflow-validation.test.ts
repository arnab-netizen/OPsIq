/**
 * Tests: CI/CD Workflow Validation
 *
 * Validates that GitHub Actions workflows are properly configured
 * and can execute all required checks.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import YAML from "js-yaml";

describe("CI/CD Workflow Validation", () => {
  describe("Main CI Workflow (.github/workflows/ci.yml)", () => {
    let ciWorkflow: any;

    beforeEach(() => {
      const ciPath = path.join(
        process.cwd(),
        ".github/workflows/ci.yml"
      );
      const ciContent = fs.readFileSync(ciPath, "utf-8");
      ciWorkflow = YAML.load(ciContent);
    });

    it("should have correct workflow name", () => {
      expect(ciWorkflow.name).toBe("CI - Build & Test");
    });

    it("should trigger on push to main and PRs", () => {
      expect(ciWorkflow.on.push.branches).toContain("main");
      expect(ciWorkflow.on.pull_request.branches).toContain("main");
    });

    it("should have build-and-test job", () => {
      expect(ciWorkflow.jobs).toHaveProperty("build-and-test");
    });

    it("should have lint job", () => {
      expect(ciWorkflow.jobs).toHaveProperty("lint");
    });

    it("build-and-test job should have PostgreSQL service", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      expect(buildJob.services).toHaveProperty("postgres");
      expect(buildJob.services.postgres.image).toContain("postgres");
    });

    it("build-and-test should run TypeScript check", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const steps = buildJob.steps;
      const tsStep = steps.find(
        (step: any) => step.name === "TypeScript type checking"
      );
      expect(tsStep).toBeDefined();
      expect(tsStep.run).toContain("npx tsc --noEmit");
    });

    it("build-and-test should validate Prisma schema", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const steps = buildJob.steps;
      const prismaStep = steps.find(
        (step: any) => step.name === "Prisma schema validation"
      );
      expect(prismaStep).toBeDefined();
      expect(prismaStep.run).toContain("npx prisma validate");
    });

    it("build-and-test should run npm build", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const steps = buildJob.steps;
      const buildStep = steps.find(
        (step: any) => step.name === "Build project"
      );
      expect(buildStep).toBeDefined();
      expect(buildStep.run).toContain("npm run build");
    });

    it("build-and-test should run tests with DATABASE_URL", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const steps = buildJob.steps;
      const testStep = steps.find(
        (step: any) => step.name === "Run full test suite"
      );
      expect(testStep).toBeDefined();
      expect(testStep.run).toContain("npm run test:ci");
      expect(testStep.env).toHaveProperty("DATABASE_URL");
    });

    it("lint job should run npm run lint as visibility-only (diagnostic)", () => {
      const lintJob = ciWorkflow.jobs["lint"];
      const steps = lintJob.steps;
      const lintStep = steps.find(
        (step: any) => step.name && step.name.includes("linter")
      );
      expect(lintStep).toBeDefined();
      expect(lintStep.run).toContain("npm run lint");
      expect(lintStep["continue-on-error"]).toBe(true);
    });

    it("lint job should enforce regression gate with lint:ratchet", () => {
      const lintJob = ciWorkflow.jobs["lint"];
      const steps = lintJob.steps;
      const ratchetStep = steps.find(
        (step: any) => step.name && step.name.includes("ratchet")
      );
      expect(ratchetStep).toBeDefined();
      expect(ratchetStep.run).toContain("npm run lint:ratchet");
      expect(ratchetStep["continue-on-error"]).toBe(false);
    });

    it("branch-protection job should depend on build-and-test and lint", () => {
      const branchJob = ciWorkflow.jobs["branch-protection"];
      expect(branchJob.needs).toContain("build-and-test");
      expect(branchJob.needs).toContain("lint");
    });

    it("should set reasonable timeout (30 minutes)", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      expect(buildJob["timeout-minutes"]).toBe(30);
    });

    it("should have Node.js setup step", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const nodeSetup = buildJob.steps.find(
        (step: any) => step.name === "Setup Node.js"
      );
      expect(nodeSetup).toBeDefined();
      expect(nodeSetup.uses).toContain("setup-node");
    });
  });

  describe("Staging Deployment Workflow (.github/workflows/deploy-staging.yml)", () => {
    let deployWorkflow: any;

    beforeEach(() => {
      const deployPath = path.join(
        process.cwd(),
        ".github/workflows/deploy-staging.yml"
      );
      const deployContent = fs.readFileSync(deployPath, "utf-8");
      deployWorkflow = YAML.load(deployContent);
    });

    it("should have correct workflow name", () => {
      expect(deployWorkflow.name).toBe("Deploy to Staging");
    });

    it("should trigger on push to main", () => {
      expect(deployWorkflow.on.push.branches).toContain("main");
    });

    it("should allow manual trigger (workflow_dispatch)", () => {
      expect(deployWorkflow.on).toHaveProperty("workflow_dispatch");
    });

    it("deploy job should run pre-deployment checks", () => {
      const deployJob = deployWorkflow.jobs["deploy"];
      const steps = deployJob.steps;
      const checkStep = steps.find(
        (step: any) => step.name === "Run pre-deployment checks"
      );
      expect(checkStep).toBeDefined();
      expect(checkStep.run).toContain("npx tsc --noEmit");
      expect(checkStep.run).toContain("npx prisma validate");
      expect(checkStep.run).toContain("npm run build");
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

    it("should document required status checks", () => {
      expect(protectionDocs).toContain("CI - Build & Test");
      expect(protectionDocs).toContain("build-and-test");
    });

    it("should document PR review requirements", () => {
      expect(protectionDocs).toContain("Minimum 1 review approval");
      expect(protectionDocs).toContain("required_pull_request_reviews");
    });

    it("should document branch up-to-date requirement", () => {
      expect(protectionDocs).toContain("up to date");
      expect(protectionDocs).toContain("rebased");
    });

    it("should include API configuration instructions", () => {
      expect(protectionDocs).toContain("GitHub API");
      expect(protectionDocs).toContain("curl");
    });
  });

  describe("Workflow File Format", () => {
    it("ci.yml should be valid YAML", () => {
      const ciPath = path.join(
        process.cwd(),
        ".github/workflows/ci.yml"
      );
      const ciContent = fs.readFileSync(ciPath, "utf-8");
      const parsed = YAML.load(ciContent) as any;
      expect(parsed).toBeDefined();
      expect(parsed.jobs).toBeDefined();
    });

    it("deploy-staging.yml should be valid YAML", () => {
      const deployPath = path.join(
        process.cwd(),
        ".github/workflows/deploy-staging.yml"
      );
      const deployContent = fs.readFileSync(deployPath, "utf-8");
      const parsed = YAML.load(deployContent) as any;
      expect(parsed).toBeDefined();
      expect(parsed.jobs).toBeDefined();
    });
  });

  describe("Security Configuration", () => {
    let ciWorkflow: any;
    let deployWorkflow: any;

    beforeEach(() => {
      const ciPath = path.join(
        process.cwd(),
        ".github/workflows/ci.yml"
      );
      const ciContent = fs.readFileSync(ciPath, "utf-8");
      ciWorkflow = YAML.load(ciContent);

      const deployPath = path.join(
        process.cwd(),
        ".github/workflows/deploy-staging.yml"
      );
      const deployContent = fs.readFileSync(deployPath, "utf-8");
      deployWorkflow = YAML.load(deployContent);
    });

    it("CI should use checkout@v4 (secure version)", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const checkoutStep = buildJob.steps.find(
        (step: any) => step.uses && step.uses.includes("checkout")
      );
      expect(checkoutStep.uses).toContain("checkout@v4");
    });

    it("deploy should request id-token permission", () => {
      const deployJob = deployWorkflow.jobs["deploy"];
      expect(deployJob.permissions).toHaveProperty("id-token");
      expect(deployJob.permissions["id-token"]).toBe("write");
    });

    it("should use npm ci instead of npm install in CI", () => {
      const buildJob = ciWorkflow.jobs["build-and-test"];
      const installStep = buildJob.steps.find(
        (step: any) => step.name === "Install dependencies"
      );
      expect(installStep.run).toBe("npm ci");
    });
  });
});
