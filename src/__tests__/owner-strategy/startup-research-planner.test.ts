import { describe, it, expect } from "vitest";
import {
  buildResearchPlan,
  minimizeOwnerTasks,
  type EvidenceDomain,
} from "../../domain/owner-strategy/startup-research-planner";

describe("startup-research-planner", () => {
  // ── buildResearchPlan ─────────────────────────────────────────────────────
  describe("buildResearchPlan", () => {
    it("returns all standard evidence domains (6 domains)", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      expect(plan.evidenceDomains).toHaveLength(6);
    });

    it("every domain has an acquisitionMode set", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      plan.evidenceDomains.forEach((d) => {
        expect(["AUTO", "REQUIRES_OWNER_APPROVAL", "HUMAN_ONLY"]).toContain(d.acquisitionMode);
      });
    });

    it("domains requiring owner approval map to REQUIRES_OWNER_APPROVAL", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const approvalDomains = plan.evidenceDomains.filter((d) => d.ownerApprovalRequired);
      approvalDomains.forEach((d) => {
        expect(d.acquisitionMode).toBe("REQUIRES_OWNER_APPROVAL");
      });
    });

    it("autoAcquireable list contains only AUTO domains", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      plan.autoAcquireable.forEach((d) => {
        expect(d.acquisitionMode).toBe("AUTO");
      });
    });

    it("humanOnly list contains only HUMAN_ONLY domains", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      plan.humanOnly.forEach((d) => {
        expect(d.acquisitionMode).toBe("HUMAN_ONLY");
      });
    });

    it("ownerTaskCount equals requiresOwnerApproval + humanOnly counts", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      expect(plan.ownerTaskCount).toBe(plan.requiresOwnerApproval.length + plan.humanOnly.length);
    });

    it("regulatory_requirements domain has decisionValue=95 (highest)", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const reg = plan.evidenceDomains.find((d) => d.domain === "regulatory_requirements");
      expect(reg?.decisionValue).toBe(95);
      expect(reg?.reliability).toBe("AUTHORITATIVE");
    });

    it("customer_demand domain is HUMAN_ONLY (canAutoAcquire=false, ownerApprovalRequired=false)", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const demand = plan.evidenceDomains.find((d) => d.domain === "customer_demand");
      expect(demand?.acquisitionMode).toBe("HUMAN_ONLY");
    });

    it("estimatedAutoCompletionDays is 0 when no auto-acquirable domains exist", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      if (plan.autoAcquireable.length === 0) {
        expect(plan.estimatedAutoCompletionDays).toBe(0);
      } else {
        expect(plan.estimatedAutoCompletionDays).toBe(1);
      }
    });
  });

  // ── Scenario M: HUMAN_ONLY domain generates a task via minimizeOwnerTasks ──
  describe("Scenario M — minimizeOwnerTasks handles HUMAN_ONLY domains", () => {
    it("HUMAN_ONLY domains appear in minimizeOwnerTasks output", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const humanOnlyDomains = plan.humanOnly;
      expect(humanOnlyDomains.length).toBeGreaterThan(0); // at least one HUMAN_ONLY domain exists

      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      const humanOnlyDomainNames = humanOnlyDomains.map((d) => d.domain);
      const humanOnlyTasks = tasks.filter((t) => humanOnlyDomainNames.includes(t.domain));
      expect(humanOnlyTasks.length).toBeGreaterThan(0);
    });

    it("customer_demand (HUMAN_ONLY) generates a task when not auto-acquired", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []); // nothing auto-acquired
      const demandTask = tasks.find((t) => t.domain === "customer_demand");
      expect(demandTask).toBeDefined();
      expect(demandTask?.prompt).toContain("Customer interviews");
    });

    it("HUMAN_ONLY task importance is CRITICAL when decisionValue >= 85", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      const demandTask = tasks.find((t) => t.domain === "customer_demand");
      // customer_demand has decisionValue=90
      expect(demandTask?.importance).toBe("CRITICAL");
    });
  });

  // ── minimizeOwnerTasks ────────────────────────────────────────────────────
  describe("minimizeOwnerTasks", () => {
    it("excludes auto-acquired domains from the task list", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const allDomains = plan.evidenceDomains;
      const toAutoAcquire = ["pricing_benchmarks"];
      const tasks = minimizeOwnerTasks(allDomains, toAutoAcquire);
      expect(tasks.find((t) => t.domain === "pricing_benchmarks")).toBeUndefined();
    });

    it("returns all domains as tasks when nothing is auto-acquired", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      expect(tasks).toHaveLength(plan.evidenceDomains.length);
    });

    it("each task prompt mentions both bestSource and fallbackSource", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      tasks.forEach((task) => {
        // Prompt format: "Collect: <evidence>. Best source: <source>. Fallback: <fallback>."
        expect(task.prompt).toContain("Best source:");
        expect(task.prompt).toContain("Fallback:");
      });
    });

    it("estimatedTimeMinutes is 30 for FREE domains", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      const freeTasks = tasks.filter((t) => {
        const domain = plan.evidenceDomains.find((d) => d.domain === t.domain)!;
        return domain.retrievalCost === "FREE";
      });
      freeTasks.forEach((t) => expect(t.estimatedTimeMinutes).toBe(30));
    });

    it("estimatedTimeMinutes is 60 for LOW cost domains", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      const lowTasks = tasks.filter((t) => {
        const domain = plan.evidenceDomains.find((d) => d.domain === t.domain)!;
        return domain.retrievalCost === "LOW";
      });
      lowTasks.forEach((t) => expect(t.estimatedTimeMinutes).toBe(60));
    });

    it("importance CRITICAL when decisionValue >= 85", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      tasks.forEach((task) => {
        const domain = plan.evidenceDomains.find((d) => d.domain === task.domain)!;
        if (domain.decisionValue >= 85) {
          expect(task.importance).toBe("CRITICAL");
        } else if (domain.decisionValue >= 65) {
          expect(task.importance).toBe("IMPORTANT");
        } else {
          expect(task.importance).toBe("OPTIONAL");
        }
      });
    });

    it("task alternatives array is non-empty (contains fallbackSource)", () => {
      const plan = buildResearchPlan("My Idea", "Retail");
      const tasks = minimizeOwnerTasks(plan.evidenceDomains, []);
      tasks.forEach((task) => {
        expect(task.alternatives.length).toBeGreaterThan(0);
      });
    });
  });
});
