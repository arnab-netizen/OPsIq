import { describe, it, expect } from "vitest";
import {
  buildResearchPlan,
  buildResearchCompletenessReport,
} from "@/domain/owner-strategy/startup-research-planner";

const baseOpts = {
  geography: "AU",
  industry: "services",
  targetCustomer: "SMB owners",
  ideaNames: ["Test Idea"],
  requiresLicence: false,
  hasConnectors: false,
};

describe("buildResearchPlan", () => {
  it("returns an object with evidenceDomains array", () => {
    const plan = buildResearchPlan(baseOpts);
    expect(Array.isArray(plan.evidenceDomains)).toBe(true);
  });

  it("returns exactly 10 evidence domains", () => {
    const plan = buildResearchPlan(baseOpts);
    expect(plan.evidenceDomains).toHaveLength(10);
  });

  it("each domain has required fields", () => {
    const plan = buildResearchPlan(baseOpts);
    for (const domain of plan.evidenceDomains) {
      expect(domain.domain).toBeTruthy();
      expect(domain.requiredEvidence).toBeTruthy();
      expect(domain.acquisitionMode).toMatch(/^(AUTO|REQUIRES_OWNER_APPROVAL|HUMAN_ONLY)$/);
      expect(typeof domain.canAutoAcquire).toBe("boolean");
      expect(typeof domain.decisionValue).toBe("number");
    }
  });

  it("domains in autoAcquireable list have acquisitionMode AUTO (when hasConnectors=true)", () => {
    // Some domains (e.g. supplier_pricing) have canAutoAcquire=true when hasConnectors,
    // but their acquisitionMode is hardcoded REQUIRES_OWNER_APPROVAL because owner approval
    // is mandatory regardless. The autoAcquireable list only includes those whose
    // acquisitionMode === "AUTO".
    const plan = buildResearchPlan({ ...baseOpts, hasConnectors: true });
    for (const domain of plan.autoAcquireable) {
      expect(domain.acquisitionMode).toBe("AUTO");
    }
  });

  it("autoAcquireable array is empty when hasConnectors=false", () => {
    const plan = buildResearchPlan({ ...baseOpts, hasConnectors: false });
    expect(plan.autoAcquireable).toHaveLength(0);
  });

  it("autoAcquireable is populated when hasConnectors=true", () => {
    const plan = buildResearchPlan({ ...baseOpts, hasConnectors: true });
    expect(plan.autoAcquireable.length).toBeGreaterThan(0);
  });

  it("humanOnly domains have HUMAN_ONLY acquisitionMode", () => {
    const plan = buildResearchPlan(baseOpts);
    for (const domain of plan.humanOnly) {
      expect(domain.acquisitionMode).toBe("HUMAN_ONLY");
    }
  });

  it("minimizedOwnerTasks is built from requiresOwnerApproval + humanOnly", () => {
    const plan = buildResearchPlan(baseOpts);
    const expectedCount = plan.requiresOwnerApproval.length + plan.humanOnly.length;
    expect(plan.minimizedOwnerTasks).toHaveLength(expectedCount);
  });

  it("owner task minimization: AUTO domains have ownerTaskIfRequired=null when hasConnectors=true", () => {
    const plan = buildResearchPlan({ ...baseOpts, hasConnectors: true });
    for (const domain of plan.autoAcquireable) {
      expect(domain.ownerTaskIfRequired).toBeNull();
    }
  });

  it("AUTO domains do not appear in minimizedOwnerTasks", () => {
    const plan = buildResearchPlan({ ...baseOpts, hasConnectors: true });
    const autoDomainIds = new Set(plan.autoAcquireable.map((d) => d.domain));
    for (const task of plan.minimizedOwnerTasks) {
      expect(autoDomainIds.has(task.domain)).toBe(false);
    }
  });

  it("willingness_to_pay is always HUMAN_ONLY regardless of connectors", () => {
    const planWith = buildResearchPlan({ ...baseOpts, hasConnectors: true });
    const planWithout = buildResearchPlan({ ...baseOpts, hasConnectors: false });
    const wtpWith = planWith.evidenceDomains.find((d) => d.domain === "willingness_to_pay");
    const wtpWithout = planWithout.evidenceDomains.find((d) => d.domain === "willingness_to_pay");
    expect(wtpWith?.acquisitionMode).toBe("HUMAN_ONLY");
    expect(wtpWithout?.acquisitionMode).toBe("HUMAN_ONLY");
  });

  it("regulatory_requirements domain exists", () => {
    const plan = buildResearchPlan(baseOpts);
    const reg = plan.evidenceDomains.find((d) => d.domain === "regulatory_requirements");
    expect(reg).toBeDefined();
    expect(reg?.decisionValue).toBe(100);
  });
});

describe("buildResearchCompletenessReport", () => {
  it("overallCompleteness is 0 when nothing acquired", () => {
    const plan = buildResearchPlan(baseOpts);
    const report = buildResearchCompletenessReport(
      plan.evidenceDomains,
      new Set(),
      new Set()
    );
    expect(report.overallCompleteness).toBe(0);
  });

  it("overallCompleteness is 100 when all domains acquired", () => {
    const plan = buildResearchPlan(baseOpts);
    const allIds = new Set(plan.evidenceDomains.map((d) => d.domain));
    const report = buildResearchCompletenessReport(
      plan.evidenceDomains,
      allIds,
      new Set()
    );
    expect(report.overallCompleteness).toBe(100);
  });

  it("canClassifyReady is false when there are unaccepted critical gaps", () => {
    const plan = buildResearchPlan(baseOpts);
    const report = buildResearchCompletenessReport(
      plan.evidenceDomains,
      new Set(),
      new Set()
    );
    expect(report.canClassifyReady).toBe(false);
  });

  it("acquired domain has acquired=true in report", () => {
    const plan = buildResearchPlan(baseOpts);
    const acquired = new Set(["market_demand"]);
    const report = buildResearchCompletenessReport(
      plan.evidenceDomains,
      acquired,
      new Set()
    );
    const marketDemandReport = report.domains.find((d) => d.domain === "market_demand");
    expect(marketDemandReport?.acquired).toBe(true);
  });

  it("unacquired domain has materialGaps populated", () => {
    const plan = buildResearchPlan(baseOpts);
    const report = buildResearchCompletenessReport(
      plan.evidenceDomains,
      new Set(),
      new Set()
    );
    const domain = report.domains[0];
    expect(domain.materialGaps.length).toBeGreaterThan(0);
  });

  it("criticalGaps is empty when all domains acquired", () => {
    const plan = buildResearchPlan(baseOpts);
    const allIds = new Set(plan.evidenceDomains.map((d) => d.domain));
    const report = buildResearchCompletenessReport(
      plan.evidenceDomains,
      allIds,
      new Set()
    );
    expect(report.criticalGaps).toHaveLength(0);
  });
});
