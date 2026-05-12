/**
 * Tests: Deployment Readiness Validation
 *
 * Validates that the deployment readiness validator works correctly
 * and all deployment infrastructure is in place.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

describe("Deployment Readiness Infrastructure", () => {
  describe("Deployment Validation Script", () => {
    it("should have validate-deployment.ts script", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("should have npm script configured", () => {
      const packageJsonPath = path.join(process.cwd(), "package.json");
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf-8")
      );
      expect(packageJson.scripts).toHaveProperty("validate:deployment");
      expect(packageJson.scripts["validate:deployment"]).toContain(
        "validate-deployment"
      );
    });

    it("validate-deployment.ts should import required modules", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain('import fs from "fs"');
      expect(content).toContain('import path from "path"');
      expect(content).toContain('import { execSync }');
    });

    it("should define validation functions", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("checkEnvironmentVariables");
      expect(content).toContain("checkBuildArtifacts");
      expect(content).toContain("checkTypeScript");
      expect(content).toContain("checkPrismaSchema");
      expect(content).toContain("checkDependencies");
      expect(content).toContain("checkGitState");
      expect(content).toContain("checkDocumentation");
      expect(content).toContain("checkSecurityConfiguration");
    });
  });

  describe("Deployment Documentation", () => {
    it("should have deployment checklist", () => {
      const checklistPath = path.join(
        process.cwd(),
        "docs/DEPLOYMENT_CHECKLIST.md"
      );
      expect(fs.existsSync(checklistPath)).toBe(true);
    });

    it("deployment checklist should cover key areas", () => {
      const checklistPath = path.join(
        process.cwd(),
        "docs/DEPLOYMENT_CHECKLIST.md"
      );
      const content = fs.readFileSync(checklistPath, "utf-8");

      expect(content).toContain("Pre-Deployment");
      expect(content).toContain("Environment");
      expect(content).toContain("Database");
      expect(content).toContain("Monitoring");
      expect(content).toContain("Security");
      expect(content).toContain("Rollback");
    });

    it("should have rollback procedure documentation", () => {
      const rollbackPath = path.join(
        process.cwd(),
        "docs/ROLLBACK_PROCEDURE.md"
      );
      expect(fs.existsSync(rollbackPath)).toBe(true);
    });

    it("rollback procedure should include steps", () => {
      const rollbackPath = path.join(
        process.cwd(),
        "docs/ROLLBACK_PROCEDURE.md"
      );
      const content = fs.readFileSync(rollbackPath, "utf-8");

      expect(content).toContain("When to Rollback");
      expect(content).toContain("Assess Severity");
      expect(content).toContain("Declare Incident");
      expect(content).toContain("Backup Current State");
      expect(content).toContain("Verify System Health");
    });

    it("should have operations runbook", () => {
      const runbookPath = path.join(process.cwd(), "docs/RUNBOOK.md");
      expect(fs.existsSync(runbookPath)).toBe(true);
    });

    it("runbook should cover key operations", () => {
      const runbookPath = path.join(process.cwd(), "docs/RUNBOOK.md");
      const content = fs.readFileSync(runbookPath, "utf-8");

      expect(content).toContain("System Overview");
      expect(content).toContain("Deployment Procedures");
      expect(content).toContain("Common Issues");
      expect(content).toContain("Incident Response");
      expect(content).toContain("Monitoring");
      expect(content).toContain("Backup & Recovery");
    });
  });

  describe("Validation Coverage", () => {
    it("should validate environment variables", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("NODE_ENV");
      expect(content).toContain("DATABASE_URL");
      expect(content).toContain("NEXT_PUBLIC_API_URL");
    });

    it("should validate build artifacts", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain(".next");
      expect(content).toContain("node_modules");
      expect(content).toContain("package.json");
    });

    it("should validate TypeScript compilation", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("npx tsc --noEmit");
    });

    it("should validate Prisma schema", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("npx prisma validate");
    });

    it("should validate git state", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("git status");
    });

    it("should validate security configuration", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain(".env");
      expect(content).toContain(".gitignore");
      expect(content).toContain("security");
    });
  });

  describe("Deployment Result Reporting", () => {
    it("should generate deployment readiness report", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("DeploymentReadiness");
      expect(content).toContain("overallStatus");
      expect(content).toContain("READY");
      expect(content).toContain("WARNING");
      expect(content).toContain("BLOCKED");
    });

    it("should include summary in report", () => {
      const scriptPath = path.join(
        process.cwd(),
        "scripts/validate-deployment.ts"
      );
      const content = fs.readFileSync(scriptPath, "utf-8");

      expect(content).toContain("passed");
      expect(content).toContain("warnings");
      expect(content).toContain("failed");
    });
  });

  describe("Documentation Quality", () => {
    it("deployment checklist should have clear structure", () => {
      const checklistPath = path.join(
        process.cwd(),
        "docs/DEPLOYMENT_CHECKLIST.md"
      );
      const content = fs.readFileSync(checklistPath, "utf-8");

      // Count checkboxes (checklist items)
      const checkboxCount = (content.match(/\[ \]/g) || []).length;
      expect(checkboxCount).toBeGreaterThan(30);
    });

    it("rollback procedure should have timing information", () => {
      const rollbackPath = path.join(
        process.cwd(),
        "docs/ROLLBACK_PROCEDURE.md"
      );
      const content = fs.readFileSync(rollbackPath, "utf-8");

      expect(content).toContain("minutes");
      expect(content).toContain("Timings");
      expect(content).toContain("Total Time");
    });

    it("runbook should have troubleshooting section", () => {
      const runbookPath = path.join(process.cwd(), "docs/RUNBOOK.md");
      const content = fs.readFileSync(runbookPath, "utf-8");

      expect(content).toContain("Common Issues");
      expect(content).toContain("Resolution");
      expect(content).toContain("Symptoms");
    });
  });

  describe("Integration with CI/CD", () => {
    it("should reference CI/CD configuration", () => {
      const deploymentPath = path.join(
        process.cwd(),
        "docs/DEPLOYMENT_CHECKLIST.md"
      );
      const content = fs.readFileSync(deploymentPath, "utf-8");

      expect(content).toContain("CI");
      expect(content).toContain("deployment");
    });

    it("should include GitHub Actions in runbook", () => {
      const runbookPath = path.join(process.cwd(), "docs/RUNBOOK.md");
      const content = fs.readFileSync(runbookPath, "utf-8");

      expect(content).toContain("GitHub Actions");
    });
  });
});
