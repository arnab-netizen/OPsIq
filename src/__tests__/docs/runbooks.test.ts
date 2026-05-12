import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("D6: Runbooks - Documentation Structure & Content", () => {
  const docsDir = path.join(process.cwd(), "docs");

  // Runbook files that should exist
  const requiredRunbooks = [
    "DEPLOYMENT_RUNBOOK.md",
    "INCIDENT_RESPONSE_GUIDE.md",
    "OPERATIONAL_RUNBOOK.md",
    "BACKUP_RESTORE_PROCEDURE.md", // From D4
  ];

  describe("Runbook File Existence", () => {
    requiredRunbooks.forEach((runbook) => {
      it(`should have ${runbook} documentation file`, () => {
        const filePath = path.join(docsDir, runbook);
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it(`${runbook} should be readable and non-empty`, () => {
        const filePath = path.join(docsDir, runbook);
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content.length).toBeGreaterThan(1000); // Should be substantial
      });
    });
  });

  describe("DEPLOYMENT_RUNBOOK.md Content", () => {
    const content = fs.readFileSync(
      path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
      "utf-8"
    );

    it("should have Pre-Deployment Checklist section", () => {
      expect(content).toContain("Pre-Deployment Checklist");
    });

    it("should have Deployment Process section", () => {
      expect(content).toContain("Deployment Process");
    });

    it("should have Post-Deployment Verification section", () => {
      expect(content).toContain("Post-Deployment Verification");
    });

    it("should have Rollback Procedure section", () => {
      expect(content).toContain("Rollback Procedure");
    });

    it("should have code quality gates (npm run build)", () => {
      expect(content).toContain("npm run build");
      expect(content).toContain("npx tsc --noEmit");
    });

    it("should have database migration steps", () => {
      expect(content).toContain("npx prisma migrate deploy");
      expect(content).toContain("npx prisma validate");
    });

    it("should have health check verification", () => {
      expect(content).toContain("/api/health");
      expect(content).toContain("curl");
    });

    it("should have database backup pre-deployment", () => {
      expect(content).toContain("backup-database.sh");
    });

    it("should have maintenance mode section", () => {
      expect(content).toContain("Maintenance Mode");
    });

    it("should have on-call responsibilities section", () => {
      expect(content).toContain("On-Call Responsibilities");
    });

    it("should have escalation matrix", () => {
      expect(content).toContain("Escalation");
    });

    it("should document rollback trigger conditions", () => {
      expect(content).toContain("Error rate");
      expect(content).toContain("Response time");
    });

    it("should include scaling procedures", () => {
      expect(content).toContain("Scaling");
      expect(content).toContain("Horizontal");
    });
  });

  describe("INCIDENT_RESPONSE_GUIDE.md Content", () => {
    const content = fs.readFileSync(
      path.join(docsDir, "INCIDENT_RESPONSE_GUIDE.md"),
      "utf-8"
    );

    it("should have incident severity classification", () => {
      expect(content).toContain("P0-CRITICAL");
      expect(content).toContain("P1-HIGH");
      expect(content).toContain("P2-MEDIUM");
      expect(content).toContain("P3-LOW");
    });

    it("should have response SLA for each severity", () => {
      expect(content).toContain("Response SLA");
      expect(content).toContain("Resolution SLA");
    });

    it("should have first response procedures (0-5 min)", () => {
      expect(content).toContain("First Response");
      expect(content).toContain("5 minutes");
    });

    it("should have incident investigation procedures", () => {
      expect(content).toContain("Investigation");
      expect(content).toContain("Incident Investigation");
    });

    it("should have common incidents with quick fixes", () => {
      expect(content).toContain("Common Incidents");
      expect(content).toContain("API Server Not Responding");
      expect(content).toContain("Database Connection Lost");
    });

    it("should have post-incident procedures", () => {
      expect(content).toContain("Post-Incident");
      expect(content).toContain("Post-Mortem");
    });

    it("should have escalation paths", () => {
      expect(content).toContain("Escalation");
      expect(content).toContain("Phone Tree");
    });

    it("should document memory leak response", () => {
      expect(content).toContain("Memory Leak");
    });

    it("should document disk full response", () => {
      expect(content).toContain("Disk Full");
    });

    it("should document high error rate response", () => {
      expect(content).toContain("High Error Rate");
    });

    it("should have audit trail incident procedures", () => {
      expect(content).toContain("Audit Trail");
      expect(content).toContain("Audit Events");
    });

    it("should have webhook delivery incident procedures", () => {
      expect(content).toContain("Webhook");
      expect(content).toContain("webhook_jobs");
    });
  });

  describe("OPERATIONAL_RUNBOOK.md Content", () => {
    const content = fs.readFileSync(
      path.join(docsDir, "OPERATIONAL_RUNBOOK.md"),
      "utf-8"
    );

    it("should have daily operations section", () => {
      expect(content).toContain("Daily Operations");
    });

    it("should have health monitoring section", () => {
      expect(content).toContain("Health Monitoring");
    });

    it("should have capacity planning section", () => {
      expect(content).toContain("Capacity Planning");
    });

    it("should define key metrics to track", () => {
      expect(content).toContain("Key Metrics");
      expect(content).toContain("Response Time");
      expect(content).toContain("Error Rate");
      expect(content).toContain("Disk Space");
    });

    it("should have performance optimization section", () => {
      expect(content).toContain("Performance Optimization");
    });

    it("should have security hardening section", () => {
      expect(content).toContain("Security Hardening");
    });

    it("should have backup and recovery section", () => {
      expect(content).toContain("Backup & Recovery");
    });

    it("should document automated backup schedule", () => {
      expect(content).toContain("Automated Backup");
      expect(content).toContain("Daily Backup");
    });

    it("should document weekly restore test", () => {
      expect(content).toContain("Weekly Restore Test");
    });

    it("should have retention policy table", () => {
      expect(content).toContain("Retention Policy");
      expect(content).toContain("7 days");
      expect(content).toContain("30 days");
    });

    it("should have troubleshooting guide", () => {
      expect(content).toContain("Troubleshooting Guide");
    });

    it("should have on-call handoff checklist", () => {
      expect(content).toContain("On-Call Handoff Checklist");
      expect(content).toContain("[ ]"); // Checklist items
    });

    it("should have monthly maintenance section", () => {
      expect(content).toContain("Monthly Maintenance");
    });

    it("should document slow query optimization", () => {
      expect(content).toContain("Slow Queries");
      expect(content).toContain("pg_stat_statements");
    });

    it("should document N+1 problem identification", () => {
      expect(content).toContain("N+1");
    });
  });

  describe("Runbook Integration", () => {
    it("all runbooks should exist and work together", () => {
      // Core runbooks should all exist
      expect(
        fs.existsSync(path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(docsDir, "INCIDENT_RESPONSE_GUIDE.md"))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(docsDir, "OPERATIONAL_RUNBOOK.md"))
      ).toBe(true);
    });

    it("should have consistent escalation procedures", () => {
      const deployment = fs.readFileSync(
        path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
        "utf-8"
      );
      const incident = fs.readFileSync(
        path.join(docsDir, "INCIDENT_RESPONSE_GUIDE.md"),
        "utf-8"
      );

      // Both should mention escalation
      expect(deployment).toContain("Escalation");
      expect(incident).toContain("Escalation");
    });
  });

  describe("Runbook Command Coverage", () => {
    const deployment = fs.readFileSync(
      path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
      "utf-8"
    );

    it("should include common deployment commands", () => {
      const commands = [
        "npm run build",
        "npx tsc",
        "npx prisma validate",
        "npx prisma migrate deploy",
        "npm test",
        "systemctl",
      ];

      commands.forEach((cmd) => {
        expect(deployment).toContain(cmd);
      });
    });

    it("should include database verification commands", () => {
      const deployment = fs.readFileSync(
        path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
        "utf-8"
      );

      expect(deployment).toContain("psql");
      expect(deployment).toContain("SELECT");
      expect(deployment).toContain("information_schema");
    });

    it("should include backup/restore commands", () => {
      const deployment = fs.readFileSync(
        path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
        "utf-8"
      );

      expect(deployment).toContain("backup-database.sh");
    });
  });

  describe("Runbook Accessibility", () => {
    it("deployment runbook should be under 20KB (readable)", () => {
      const filePath = path.join(docsDir, "DEPLOYMENT_RUNBOOK.md");
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeLessThan(20000); // Reasonable size for quick reference
    });

    it("incident response guide should have clear sections", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "INCIDENT_RESPONSE_GUIDE.md"),
        "utf-8"
      );

      // Should have multiple sections for quick navigation
      const sectionCount = (content.match(/^##+ /gm) || []).length;
      expect(sectionCount).toBeGreaterThan(5);
    });

    it("operational runbook should have table of contents", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "OPERATIONAL_RUNBOOK.md"),
        "utf-8"
      );

      expect(content).toContain("Table of Contents");
    });
  });

  describe("Runbook Procedures Completeness", () => {
    it("should document complete deployment flow", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
        "utf-8"
      );

      // Should cover: pre-checks → code quality → database → services → verification
      expect(content).toContain("Pre-Deployment");
      expect(content).toContain("Deployment Process");
      expect(content).toContain("Post-Deployment");
    });

    it("should document complete rollback flow", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
        "utf-8"
      );

      // Should cover: when to rollback → steps → verification
      expect(content).toContain("Rollback");
      expect(content).toContain("Trigger");
      expect(content).toContain("git checkout");
    });

    it("should document complete incident response flow", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "INCIDENT_RESPONSE_GUIDE.md"),
        "utf-8"
      );

      // Should cover: classification → response → investigation → resolution
      expect(content).toContain("Severity");
      expect(content).toContain("First Response");
      expect(content).toContain("Investigation");
      expect(content).toContain("Resolution");
    });
  });

  describe("Runbook Contact Information", () => {
    it("deployment runbook should have contact information", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "DEPLOYMENT_RUNBOOK.md"),
        "utf-8"
      );

      expect(content).toContain("Key Contacts");
    });

    it("incident response guide should have phone tree", () => {
      const content = fs.readFileSync(
        path.join(docsDir, "INCIDENT_RESPONSE_GUIDE.md"),
        "utf-8"
      );

      expect(content).toContain("Phone");
    });
  });

  describe("Runbook Maintenance Information", () => {
    // Only check new runbooks for maintenance metadata
    const maintenanceRunbooks = [
      "DEPLOYMENT_RUNBOOK.md",
      "INCIDENT_RESPONSE_GUIDE.md",
      "OPERATIONAL_RUNBOOK.md",
    ];

    maintenanceRunbooks.forEach((runbook) => {
      it(`${runbook} should have version and last updated date`, () => {
        const filePath = path.join(docsDir, runbook);
        const content = fs.readFileSync(filePath, "utf-8");

        expect(content).toContain("Last Updated");
        expect(content).toContain("Version");
      });

      it(`${runbook} should have owner information`, () => {
        const filePath = path.join(docsDir, runbook);
        const content = fs.readFileSync(filePath, "utf-8");

        expect(content).toContain("Owner");
      });

      it(`${runbook} should have review cycle`, () => {
        const filePath = path.join(docsDir, runbook);
        const content = fs.readFileSync(filePath, "utf-8");

        expect(content).toMatch(
          /Quarterly|Monthly|Annual|[Rr]eview [Ss]chedule/
        );
      });
    });
  });
});
