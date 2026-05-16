/**
 * Tests: System Truth Contract Foundation
 *
 * Validates that recommendations cannot be safely made without
 * assessing all 4 dimensions of business truth:
 * 1. Business Condition Profile
 * 2. Intervention Reality
 * 3. Evidence Sufficiency
 * 4. Execution Readiness
 */

import { describe, it, expect } from "vitest";
import {
  ConsultingStage,
  BusinessMaturity,
  InterventionMode,
  InterventionPhase,
  SystemTruthContractSchema,
  BusinessConditionSchema,
  InterventionRealitySchema,
  EvidenceSufficiencySchema,
  ExecutionReadinessSchema,
  validateBusinessCondition,
  validateInterventionReality,
  validateEvidenceSufficiency,
  validateExecutionReadiness,
  assessTruthGate,
  canMakeRecommendation,
  getTruthAssessmentSummary,
} from "@/domain/system-truth/truth-contract";

describe("System Truth Contract Foundation", () => {
  const baseContract = {
    workspaceId: "550e8400-e29b-41d4-a716-446655440123",
    engagementId: "550e8400-e29b-41d4-a716-446655440456",
    assessedAt: new Date(),
    assessedByUserId: "550e8400-e29b-41d4-a716-446655440789",
    businessCondition: {
      maturity: BusinessMaturity.STABLE,
      financialHealth: "healthy" as const,
      cashRunwayMonths: 12,
      burnRate: 50000,
      revenuePerMonth: 100000,
      keyPersonDependency: false,
      ownerAvailability: "full_time" as const,
      teamCapability: "strong" as const,
      customerHealthScore: 85,
      marketPosition: "strong" as const,
    },
    interventionReality: {
      stage: ConsultingStage.OPTIMIZATION,
      mode: InterventionMode.GROWTH_ACCELERATION,
      phase: InterventionPhase.EXECUTION,
      daysInPhase: 30,
      blockerCount: 0,
      completedMilestones: 3,
      ownerCommitment: "committed" as const,
      teamAdoption: "driving" as const,
    },
    evidenceSufficiency: {
      hasFinancialData: true,
      hasCustomerData: true,
      hasOperationalData: true,
      hasOwnerAssessment: true,
      dataFreshness: "current" as const,
      sourceDiversity: "comprehensive" as const,
      contradictionsDetected: false,
      reliabilityScore: 95,
    },
    executionReadiness: {
      ownerCanCommit: true,
      teamCanExecute: true,
      resourcesAvailable: true,
      timelineRealistic: true,
      dependenciesMapped: true,
      risksMitigated: true,
      measurablesSet: true,
      backupPlanExists: true,
    },
    truthGatePassed: true,
  };

  describe("Schema Validation", () => {
    it("should validate complete system truth contract", () => {
      const parsed = SystemTruthContractSchema.safeParse(baseContract);

      expect(parsed.success).toBe(true);
    });

    it("should validate business condition schema", () => {
      const parsed = BusinessConditionSchema.safeParse(
        baseContract.businessCondition
      );

      expect(parsed.success).toBe(true);
    });

    it("should validate intervention reality schema", () => {
      const parsed = InterventionRealitySchema.safeParse(
        baseContract.interventionReality
      );

      expect(parsed.success).toBe(true);
    });

    it("should validate evidence sufficiency schema", () => {
      const parsed = EvidenceSufficiencySchema.safeParse(
        baseContract.evidenceSufficiency
      );

      expect(parsed.success).toBe(true);
    });

    it("should validate execution readiness schema", () => {
      const parsed = ExecutionReadinessSchema.safeParse(
        baseContract.executionReadiness
      );

      expect(parsed.success).toBe(true);
    });
  });

  describe("Business Condition Validation", () => {
    it("should allow recommendation for healthy stable business", () => {
      const result = validateBusinessCondition(baseContract.businessCondition);

      expect(result.valid).toBe(true);
    });

    it("should block recommendation for struggling business with <1 month runway", () => {
      const result = validateBusinessCondition({
        ...baseContract.businessCondition,
        maturity: BusinessMaturity.STRUGGLING,
        cashRunwayMonths: 0,
        financialHealth: "critical" as const,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("survival mode");
    });

    it("should block recommendation when owner unavailable AND team incapable", () => {
      const result = validateBusinessCondition({
        ...baseContract.businessCondition,
        ownerAvailability: "limited" as const,
        teamCapability: "minimal" as const,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("owner commitment or team capability");
    });

    it("should allow recommendation if team is strong even if owner limited", () => {
      const result = validateBusinessCondition({
        ...baseContract.businessCondition,
        ownerAvailability: "limited" as const,
        teamCapability: "strong" as const,
      });

      expect(result.valid).toBe(true);
    });

    it("should allow recommendation if owner committed even if team minimal", () => {
      const result = validateBusinessCondition({
        ...baseContract.businessCondition,
        ownerAvailability: "full_time" as const,
        teamCapability: "minimal" as const,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Intervention Reality Validation", () => {
    it("should allow execution phase with completed milestones", () => {
      const result = validateInterventionReality(
        baseContract.interventionReality
      );

      expect(result.valid).toBe(true);
    });

    it("should block execution phase without milestones completed", () => {
      const result = validateInterventionReality({
        ...baseContract.interventionReality,
        phase: InterventionPhase.EXECUTION,
        completedMilestones: 0,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("planning milestones");
    });

    it("should block execution phase with uncommitted owner", () => {
      const result = validateInterventionReality({
        ...baseContract.interventionReality,
        phase: InterventionPhase.EXECUTION,
        ownerCommitment: "uncommitted" as const,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Owner commitment required");
    });

    it("should allow assessment phase with uncommitted owner", () => {
      const result = validateInterventionReality({
        ...baseContract.interventionReality,
        phase: InterventionPhase.ASSESSMENT,
        ownerCommitment: "uncommitted" as const,
      });

      expect(result.valid).toBe(true);
    });

    it("should block verification phase with conditional owner", () => {
      const result = validateInterventionReality({
        ...baseContract.interventionReality,
        phase: InterventionPhase.VERIFICATION,
        ownerCommitment: "conditional" as const,
      });

      expect(result.valid).toBe(false);
    });

    it("should allow scaling phase with relentless owner", () => {
      const result = validateInterventionReality({
        ...baseContract.interventionReality,
        phase: InterventionPhase.SCALING,
        ownerCommitment: "relentless" as const,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Evidence Sufficiency Validation", () => {
    it("should allow recommendation with complete evidence", () => {
      const result = validateEvidenceSufficiency(
        baseContract.evidenceSufficiency
      );

      expect(result.valid).toBe(true);
    });

    it("should block recommendation without owner assessment", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        hasOwnerAssessment: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("owner assessment");
    });

    it("should block recommendation with stale data", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        dataFreshness: "stale",
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("stale data");
    });

    it("should allow recommendation with recent data", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        dataFreshness: "recent" as const,
      });

      expect(result.valid).toBe(true);
    });

    it("should block contradictions with low reliability", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        contradictionsDetected: true,
        reliabilityScore: 50,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Contradictions");
    });

    it("should allow contradictions if reliability high", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        contradictionsDetected: true,
        reliabilityScore: 75,
      });

      expect(result.valid).toBe(true);
    });

    it("should block single-source evidence", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        sourceDiversity: "single" as const,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("diverse evidence sources");
    });

    it("should allow comprehensive source diversity", () => {
      const result = validateEvidenceSufficiency({
        ...baseContract.evidenceSufficiency,
        sourceDiversity: "comprehensive" as const,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("Execution Readiness Validation", () => {
    it("should allow recommendation when fully ready", () => {
      const result = validateExecutionReadiness(
        baseContract.executionReadiness
      );

      expect(result.valid).toBe(true);
    });

    it("should block if owner cannot commit", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        ownerCanCommit: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Owner cannot commit");
    });

    it("should block if team cannot execute", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        teamCanExecute: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Team cannot execute");
    });

    it("should block if resources unavailable", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        resourcesAvailable: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Resources unavailable");
    });

    it("should block if timeline unrealistic", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        timelineRealistic: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Timeline unrealistic");
    });

    it("should block if dependencies not mapped", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        dependenciesMapped: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Dependencies not mapped");
    });

    it("should block if risks not mitigated", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        risksMitigated: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Risks not mitigated");
    });

    it("should block if metrics not set", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        measurablesSet: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Success metrics");
    });

    it("should block if backup plan missing", () => {
      const result = validateExecutionReadiness({
        ...baseContract.executionReadiness,
        backupPlanExists: false,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Backup plan");
    });
  });

  describe("Full Truth Gate Assessment", () => {
    it("should pass gate when all 4 dimensions valid", () => {
      const result = assessTruthGate(baseContract);

      expect(result.passed).toBe(true);
      expect(result.businessConditionValid).toBe(true);
      expect(result.interventionRealityValid).toBe(true);
      expect(result.evidenceSufficient).toBe(true);
      expect(result.executionReady).toBe(true);
      expect(result.failureReasons).toHaveLength(0);
    });

    it("should fail gate if business condition invalid", () => {
      const contract = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          cashRunwayMonths: 0,
          financialHealth: "critical" as const,
        },
      };

      const result = assessTruthGate(contract);

      expect(result.passed).toBe(false);
      expect(result.businessConditionValid).toBe(false);
      expect(result.failureReasons.length).toBeGreaterThan(0);
    });

    it("should fail gate if intervention reality invalid", () => {
      const contract = {
        ...baseContract,
        interventionReality: {
          ...baseContract.interventionReality,
          phase: InterventionPhase.EXECUTION,
          completedMilestones: 0,
        },
      };

      const result = assessTruthGate(contract);

      expect(result.passed).toBe(false);
      expect(result.interventionRealityValid).toBe(false);
    });

    it("should fail gate if evidence insufficient", () => {
      const contract = {
        ...baseContract,
        evidenceSufficiency: {
          ...baseContract.evidenceSufficiency,
          dataFreshness: "stale" as const,
        },
      };

      const result = assessTruthGate(contract);

      expect(result.passed).toBe(false);
      expect(result.evidenceSufficient).toBe(false);
    });

    it("should fail gate if execution not ready", () => {
      const contract = {
        ...baseContract,
        executionReadiness: {
          ...baseContract.executionReadiness,
          ownerCanCommit: false,
        },
      };

      const result = assessTruthGate(contract);

      expect(result.passed).toBe(false);
      expect(result.executionReady).toBe(false);
    });

    it("should fail gate if multiple dimensions invalid", () => {
      const contract = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          cashRunwayMonths: 0,
          financialHealth: "critical" as const,
        },
        evidenceSufficiency: {
          ...baseContract.evidenceSufficiency,
          dataFreshness: "stale" as const,
        },
      };

      const result = assessTruthGate(contract);

      expect(result.passed).toBe(false);
      expect(result.failureReasons.length).toBeGreaterThanOrEqual(2);
    });

    it("should provide recommended actions when gate fails", () => {
      const contract = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          cashRunwayMonths: 0,
          financialHealth: "critical" as const,
        },
      };

      const result = assessTruthGate(contract);

      expect(result.passed).toBe(false);
      expect(result.recommendedActions.length).toBeGreaterThan(0);
    });
  });

  describe("Recommendation Safety Gate", () => {
    it("should allow recommendation when truth gate passes", () => {
      const can = canMakeRecommendation(baseContract);

      expect(can).toBe(true);
    });

    it("should block recommendation when any dimension invalid", () => {
      const contract = {
        ...baseContract,
        evidenceSufficiency: {
          ...baseContract.evidenceSufficiency,
          hasOwnerAssessment: false,
        },
      };

      const can = canMakeRecommendation(contract);

      expect(can).toBe(false);
    });

    it("should block recommendation for survival-mode business", () => {
      const contract = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          cashRunwayMonths: 0,
        },
      };

      const can = canMakeRecommendation(contract);

      expect(can).toBe(false);
    });

    it("should block recommendation without execution readiness", () => {
      const contract = {
        ...baseContract,
        executionReadiness: {
          ...baseContract.executionReadiness,
          teamCanExecute: false,
        },
      };

      const can = canMakeRecommendation(contract);

      expect(can).toBe(false);
    });
  });

  describe("Truth Assessment Summary", () => {
    it("should generate success summary when gate passes", () => {
      const summary = getTruthAssessmentSummary(baseContract);

      expect(summary).toContain("✓");
      expect(summary).toContain("All 4");
    });

    it("should generate failure summary when gate fails", () => {
      const contract = {
        ...baseContract,
        evidenceSufficiency: {
          ...baseContract.evidenceSufficiency,
          hasOwnerAssessment: false,
        },
      };

      const summary = getTruthAssessmentSummary(contract);

      expect(summary).toContain("✗");
      expect(summary).toContain("Evidence");
    });

    it("should list all failed dimensions", () => {
      const contract = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          cashRunwayMonths: 0,
          financialHealth: "critical" as const,
        },
        executionReadiness: {
          ...baseContract.executionReadiness,
          ownerCanCommit: false,
        },
      };

      const summary = getTruthAssessmentSummary(contract);

      expect(summary).toContain("Business Condition");
      expect(summary).toContain("Execution Readiness");
    });
  });

  describe("Real-World Scenarios", () => {
    it("should prevent recommendation for early-stage startup with no revenue", () => {
      const earlyStage = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          revenuePerMonth: 0,
          cashRunwayMonths: 3,
          financialHealth: "stressed" as const,
        },
      };

      expect(canMakeRecommendation(earlyStage)).toBe(true); // Can recommend with 3 months runway
    });

    it("should prevent recommendation for pre-revenue startup with <1 month runway", () => {
      const preRevenue = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.STRUGGLING,
          revenuePerMonth: 0,
          cashRunwayMonths: 0,
          financialHealth: "critical" as const,
        },
      };

      expect(canMakeRecommendation(preRevenue)).toBe(false);
    });

    it("should allow recommendation for stable scaling business with full execution readiness", () => {
      const scaling = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          maturity: BusinessMaturity.SCALING,
        },
      };

      expect(canMakeRecommendation(scaling)).toBe(true);
    });

    it("should block recommendation if owner missing and team unproven", () => {
      const ownerless = {
        ...baseContract,
        businessCondition: {
          ...baseContract.businessCondition,
          ownerAvailability: "unavailable" as const,
          teamCapability: "emerging" as const,
        },
      };

      expect(canMakeRecommendation(ownerless)).toBe(false);
    });

    it("should block recommendation if still in discovery without owner perspective", () => {
      const discovery = {
        ...baseContract,
        interventionReality: {
          ...baseContract.interventionReality,
          stage: ConsultingStage.DISCOVERY,
        },
        evidenceSufficiency: {
          ...baseContract.evidenceSufficiency,
          hasOwnerAssessment: false,
        },
      };

      expect(canMakeRecommendation(discovery)).toBe(false);
    });
  });
});
