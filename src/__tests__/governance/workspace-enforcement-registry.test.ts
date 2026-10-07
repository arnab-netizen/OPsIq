/**
 * Governance — the Prisma workspace backstop (src/lib/prisma-workspace-enforcement.ts) agrees with the schema.
 *
 * The backstop's documented contract: its set is EVERY model with a REQUIRED direct `workspaceId`. This test reads
 * prisma/schema.prisma and pins that contract as a ratchet:
 *   - every new workspace-owned model must be registered (a new model fails here until it is);
 *   - the set never names a model that is not workspace-owned (no stale entries);
 *   - the models that predate this ratchet and are not yet enrolled are FROZEN below. Enrolling one means removing it from
 *     the list (the test then requires it to be in the set), so the gap can only shrink. Enrolling them is deliberately not
 *     done here: it would start enforcing "create must carry workspaceId" on write paths that were never audited for it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { WORKSPACE_OWNED_MODELS } from "@/lib/prisma-workspace-enforcement";

const PRE_EXISTING_UNENFORCED: readonly string[] = [
  "AcquisitionMetricsRecord", "Alert", "BusinessObjective", "BusinessObjectiveDependency",
  "BusinessRiskEntry", "ComplaintRecoveryAction", "ComplianceTaskLink", "ConstraintResolutionRecord",
  "CustomerComplaint", "CustomerRecord", "DecisionConfidenceRecord", "Entity",
  "ExplainabilityRecord", "ExternalOpportunitySignal", "ExternalSpreadsheetAllowlist", "GoalArbitrationRecord",
  "GrowthPriceTier", "KPIOwnershipRecord", "MarketingCampaign", "OperatingMemoryEntry",
  "OperatingPolicy", "OperatingPolicyOverride", "OperationalEvent", "OpportunityExecutionTask",
  "OpportunityValidationOutcome", "OwnerActionAssignment", "OwnerApprovalEvidence", "OwnerApprovalRequest",
  "OwnerArbitrationOverride", "OwnerBusinessConditionProfile", "OwnerConnector", "OwnerFinanceOutcomeSignal",
  "OwnerGoal", "OwnerGoalMilestone", "OwnerOnboarding", "OwnerSopNonComplianceAlert",
  "OwnerSopTrainingAssignment", "OwnerStartupSession", "ProcessExecutionTask", "ProcessExecutionTaskProgress",
  "ProofRiskAdjudication", "PurchaseOrder", "ResourceAllocation", "ResourcePool",
  "RetentionCohort", "RevenueStreamRecord", "RiskTaskLink", "SalesDealRecord",
  "StartupBusinessModelVersion", "StartupContextProfileVersion", "StartupEconomicModel", "StartupEvidenceRecord",
  "StartupExecutionBlueprint", "StartupExecutionPlan", "StartupExperiment", "StartupHypothesis",
  "StartupIdeaCandidate", "StartupIdeaGenerationBatch", "StartupIdeaRecord", "StartupInitiative",
  "StartupMarketSizing", "StartupOwnerDecision", "StartupReadinessAssessment", "StartupResearchAcquisition",
  "StartupResearchPlan", "StartupSystemRecommendation", "StartupValidationPlan", "StartupVerificationWindow",
  "StockItem", "VendorContract", "VendorDeliveryRecord", "WasteLeakageEvent",
];

function modelsWithRequiredWorkspaceId(): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const out: string[] = [];
  for (const m of schema.matchAll(/\nmodel (\w+) \{([\s\S]*?)\n\}/g)) {
    const required = m[2].split("\n").some((l) => {
      const t = l.trim().split(/\s+/);
      return t[0] === "workspaceId" && t.length >= 2 && !t[1].endsWith("?");
    });
    if (required) out.push(m[1]);
  }
  return out.sort();
}

describe("governance — workspace enforcement backstop vs schema", () => {
  const schemaModels = modelsWithRequiredWorkspaceId();

  it("scans the real schema", () => {
    expect(schemaModels.length).toBeGreaterThan(150);
    expect(schemaModels).toContain("OwnerBusiness");
  });

  it("the Owner Outcome Persistence v1 models are enforced", () => {
    for (const model of ["OwnerDecisionRecord", "OwnerOutcomeAssessment"]) {
      expect(schemaModels, model).toContain(model);
      expect(WORKSPACE_OWNED_MODELS.has(model), `${model} must be in WORKSPACE_OWNED_MODELS`).toBe(true);
      expect(PRE_EXISTING_UNENFORCED, model).not.toContain(model);
    }
  });

  it("every workspace-owned model is registered, except the frozen pre-existing gap (a NEW model must be registered)", () => {
    const unregistered = schemaModels.filter((m) => !WORKSPACE_OWNED_MODELS.has(m));
    expect(unregistered).toEqual([...PRE_EXISTING_UNENFORCED].sort());
  });

  it("the set names no model that is not workspace-owned in the schema", () => {
    const stale = [...WORKSPACE_OWNED_MODELS].filter((m) => !schemaModels.includes(m));
    expect(stale).toEqual([]);
  });
});
