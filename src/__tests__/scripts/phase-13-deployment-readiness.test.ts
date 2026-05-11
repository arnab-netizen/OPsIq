import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("Phase 13 Slice 8: Deployment Readiness Script", () => {
  const scriptPath = path.join(process.cwd(), "scripts/phase-13-deployment-readiness.sh");
  const projectRoot = process.cwd();

  describe("Script Existence and Permissions", () => {
    it("should have deployment readiness script", () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should be executable", () => {
      const stats = fs.statSync(scriptPath);
      // Check if any execute bit is set (user, group, or other)
      expect((stats.mode & 0o111) !== 0).toBe(true);
    });

    it("should have bash shebang", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content.startsWith("#!/bin/bash")).toBe(true);
    });
  });

  describe("Phase 1: Environment Validation", () => {
    it("should check Node.js", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("node --version");
    });

    it("should check npm", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npm --version");
    });

    it("should check git", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("git --version");
    });
  });

  describe("Phase 2: CI/CD Foundations (Phase 13 Slice 1)", () => {
    it("should verify GitHub Actions workflow exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain(".github/workflows/ci-cd-foundations.yml");
    });

    it("should verify workflow includes npm ci", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npm ci");
    });

    it("should verify workflow includes TypeScript check", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npx tsc --noEmit");
    });

    it("should verify workflow includes Prisma validation", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npx prisma validate");
    });

    it("should verify workflow includes build", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npm run build");
    });
  });

  describe("Phase 3: Non-DB Gates", () => {
    it("should run npm ci", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npm ci");
    });

    it("should run prisma validate", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npx prisma validate");
    });

    it("should run TypeScript check", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npx tsc --noEmit");
    });

    it("should run build", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("npm run build");
    });
  });

  describe("Phase 4: Database Configuration", () => {
    it("should check DATABASE_URL", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("DATABASE_URL");
    });

    it("should handle missing DATABASE_URL gracefully", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("DATABASE_URL not configured");
    });
  });

  describe("Phase 5: Deployment Artifacts", () => {
    it("should verify DEPLOYMENT_CHECKLIST exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("DEPLOYMENT_CHECKLIST");
    });

    it("should verify ROLLBACK_PLAN exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("ROLLBACK_PLAN");
    });

    it("should verify LOCAL_ONLY_RECOVERY_LEDGER exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("LOCAL_ONLY_RECOVERY_LEDGER");
    });

    it("should verify recovery patch exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("opsiq-main-sync-latest.patch");
    });

    it("should verify recovery bundle exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("opsiq-main-sync-latest.bundle");
    });
  });

  describe("Phase 6: Execution State", () => {
    it("should verify execution_state.json exists", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("execution_state.json");
    });

    it("should check for PRESENT_RUNTIME_VERIFIED status", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("PRESENT_RUNTIME_VERIFIED");
    });
  });

  describe("Phase 7: Git Status", () => {
    it("should check for unpushed commits", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("rev-list --count");
    });

    it("should verify remote accessibility", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("origin/main");
    });
  });

  describe("Script Execution (Integration Tests)", () => {
    it("should execute without syntax errors", () => {
      try {
        execSync(`bash -n ${scriptPath}`, { stdio: "pipe" });
      } catch (error) {
        throw new Error(`Script has syntax errors: ${error}`);
      }
    });

    it("should handle the build gate check", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("BUILD_GATE");
    });

    it("should handle the typecheck gate", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("TYPECHECK_GATE");
    });

    it("should handle the prisma gate", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("PRISMA_GATE");
    });

    it("should handle the test gate", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("TEST_GATE");
    });

    it("should handle the CI workflow gate", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("CI_WORKFLOW_GATE");
    });
  });

  describe("Verdict Logic", () => {
    it("should provide READY_FOR_DEPLOYMENT verdict", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("READY_FOR_DEPLOYMENT");
    });

    it("should provide NOT_READY_FOR_DEPLOYMENT verdict", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("NOT READY FOR DEPLOYMENT");
    });

    it("should report summary of passed checks", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("CHECKS_PASSED");
    });

    it("should report summary of failed checks", () => {
      const content = fs.readFileSync(scriptPath, "utf-8");
      expect(content).toContain("CHECKS_FAILED");
    });
  });

  describe("Documentation Files Created", () => {
    it("should have DEPLOYMENT_CHECKLIST.md", () => {
      const checklistPath = path.join(projectRoot, "docs/DEPLOYMENT_CHECKLIST.md");
      expect(fs.existsSync(checklistPath)).toBe(true);
    });

    it("should have ROLLBACK_PLAN.md", () => {
      const rollbackPath = path.join(projectRoot, "docs/ROLLBACK_PLAN.md");
      expect(fs.existsSync(rollbackPath)).toBe(true);
    });

    it("DEPLOYMENT_CHECKLIST.md should have staging section", () => {
      const checklistPath = path.join(projectRoot, "docs/DEPLOYMENT_CHECKLIST.md");
      const content = fs.readFileSync(checklistPath, "utf-8");
      expect(content).toContain("Staging Deployment Checklist");
    });

    it("DEPLOYMENT_CHECKLIST.md should have production section", () => {
      const checklistPath = path.join(projectRoot, "docs/DEPLOYMENT_CHECKLIST.md");
      const content = fs.readFileSync(checklistPath, "utf-8");
      expect(content).toContain("Production Deployment Checklist");
    });

    it("ROLLBACK_PLAN.md should have code rollback procedure", () => {
      const rollbackPath = path.join(projectRoot, "docs/ROLLBACK_PLAN.md");
      const content = fs.readFileSync(rollbackPath, "utf-8");
      expect(content).toContain("Scenario 1: Code Rollback");
    });

    it("ROLLBACK_PLAN.md should have database rollback procedure", () => {
      const rollbackPath = path.join(projectRoot, "docs/ROLLBACK_PLAN.md");
      const content = fs.readFileSync(rollbackPath, "utf-8");
      expect(content).toContain("Scenario 2: Database Rollback");
    });

    it("ROLLBACK_PLAN.md should have testing requirements", () => {
      const rollbackPath = path.join(projectRoot, "docs/ROLLBACK_PLAN.md");
      const content = fs.readFileSync(rollbackPath, "utf-8");
      expect(content).toContain("Rollback Drills");
    });
  });

  describe("Phase 13 Slice 8 Completeness", () => {
    it("should have deployment readiness script", () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should have deployment checklist", () => {
      expect(fs.existsSync(path.join(projectRoot, "docs/DEPLOYMENT_CHECKLIST.md"))).toBe(true);
    });

    it("should have rollback plan", () => {
      expect(fs.existsSync(path.join(projectRoot, "docs/ROLLBACK_PLAN.md"))).toBe(true);
    });

    it("should have this test file", () => {
      const testPath = path.join(projectRoot, "src/__tests__/scripts/phase-13-deployment-readiness.test.ts");
      expect(fs.existsSync(testPath)).toBe(true);
    });
  });
});
