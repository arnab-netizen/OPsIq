/**
 * P2C: BUSINESS-CONDITION HARDENING CONTRACT TESTS
 *
 * These tests define the expected service/domain contract for how business
 * condition assessment should inform recommendation hardening (risk/safety pressure).
 *
 * Contract:
 * - Strong/healthy condition → low hardening pressure (confidence in recommendations)
 * - Weak/critical condition → high hardening pressure (caution in recommendations)
 * - Financial distress → increased recommendation risk concern
 * - Owner/team weakness → reduced confidence or raised caution
 * - Missing data → no false confidence
 * - Workspace isolation → preserved if DB-backed
 */

import { describe, it, expect } from "vitest";
import {
  FinancialHealth,
  OwnerAvailability,
  OwnerCommitment,
  TeamCapability,
  assessFinancialHealth,
  scoreOwnerHealth,
  scoreTeamCapability,
  scoreCustomerHealth,
  calculateOverallHealth,
  healthScoreToStatus,
  identifyRiskFactors,
  identifyStrengths,
  evaluateBusinessConditionHardeningContext,
  deriveHardeningContextFromConditionProfile,
  type ConditionProfileLike,
} from "@/domain/business-condition/business-condition";
import { summarizeConditionHardening } from "@/services/business-condition";

// Ordering helper (test-only) for caution-level comparisons in the adapter contract.
const CAUTION_ORDER = [
  "low",
  "standard",
  "elevated_caution",
  "manual_review_required",
] as const;

// Ordering helpers (test-only) used to assert that one hardening signal is
// stronger/weaker than another. These rank the production enum values; they do
// NOT reimplement the production status→hardening mapping.
const RISK_ADJUSTMENT_ORDER = [
  "minimal",
  "low",
  "neutral",
  "medium_high",
  "high",
] as const;

// Higher index = more confidence retained. "reduces confidence" means a lower index.
const CONFIDENCE_ORDER = [
  "strongly_reduce",
  "reduce",
  "neutral",
  "maintain",
  "maintain_or_increase",
] as const;

const exceptionalCapacity = {
  teamSize: 25,
  capabilityLevel: TeamCapability.EXCEPTIONAL,
  engineeringCapability: "strong" as const,
  productCapability: "strong" as const,
  salesCapability: "strong" as const,
  operationsCapability: "strong" as const,
  keyPersonDependency: [],
  turnoverRate: 5,
  recentHires: 2,
  recentDepartures: 0,
  culturHealth: "excellent" as const,
};

// Test fixtures for full condition objects
const healthyOwner = {
  availability: OwnerAvailability.FULL_TIME,
  commitment: OwnerCommitment.RELENTLESS,
  capabilityLevel: "strong" as const,
  isBottleneck: false,
  burnoutRisk: 20,
  hasSuccessor: true,
  lastAssessmentAt: new Date(),
};

const weakOwner = {
  availability: OwnerAvailability.UNAVAILABLE,
  commitment: OwnerCommitment.UNCOMMITTED,
  capabilityLevel: "weak" as const,
  isBottleneck: true,
  burnoutRisk: 80,
  hasSuccessor: false,
  lastAssessmentAt: new Date(),
};

const strongCapacity = {
  teamSize: 15,
  capabilityLevel: TeamCapability.STRONG,
  engineeringCapability: "strong" as const,
  productCapability: "strong" as const,
  salesCapability: "competent" as const,
  operationsCapability: "strong" as const,
  keyPersonDependency: [],
  turnoverRate: 5,
  recentHires: 2,
  recentDepartures: 0,
  culturHealth: "excellent" as const,
};

const weakCapacity = {
  teamSize: 2,
  capabilityLevel: TeamCapability.MINIMAL,
  engineeringCapability: "minimal" as const,
  productCapability: "minimal" as const,
  salesCapability: "minimal" as const,
  operationsCapability: "minimal" as const,
  keyPersonDependency: ["founder"],
  turnoverRate: 50,
  recentHires: 0,
  recentDepartures: 1,
  culturHealth: "toxic" as const,
};

const healthyCustomer = {
  totalCustomers: 500,
  activeCustomers: 450,
  monthlyChurn: 2,
  netRetentionRate: 115,
  npsScore: 65,
  customerAcquisitionCost: 5000,
  customerLifetimeValue: 50000,
  paybackMonths: 3,
  marketShare: 15,
  marketPosition: "strong" as const,
  competitiveAdvantage: ["superior tech", "better support"],
  lastAssessmentAt: new Date(),
};

const weakCustomer = {
  totalCustomers: 30,
  activeCustomers: 15,
  monthlyChurn: 15,
  netRetentionRate: 75,
  npsScore: -40,
  customerAcquisitionCost: 20000,
  customerLifetimeValue: 10000,
  paybackMonths: 24,
  marketShare: 1,
  marketPosition: "lost" as const,
  competitiveAdvantage: [],
  lastAssessmentAt: new Date(),
};

const healthyFinancials = {
  monthlyRecurringRevenue: 500000,
  monthlyExpenses: 200000,
  cashOnHand: 3000000,
  burnRate: 0,
  cashRunwayMonths: 15,
  grossMargin: 80,
  customerConcentration: 10,
  operatingMargin: 60,
  dataSource: "accounting_software" as const,
  lastUpdated: new Date(),
};

const criticalFinancials = {
  monthlyRecurringRevenue: 50000,
  monthlyExpenses: 60000,
  cashOnHand: 10000,
  burnRate: 10000,
  cashRunwayMonths: 0.2,
  grossMargin: 40,
  customerConcentration: 50,
  operatingMargin: -50,
  dataSource: "accounting_software" as const,
  lastUpdated: new Date(),
};

const stressedFinancials = {
  monthlyRecurringRevenue: 100000,
  monthlyExpenses: 120000,
  cashOnHand: 50000,
  burnRate: 20000,
  cashRunwayMonths: 2.5,
  grossMargin: 70,
  customerConcentration: 25,
  operatingMargin: -20,
  dataSource: "accounting_software" as const,
  lastUpdated: new Date(),
};

describe("P2C: Business Condition Hardening Contract", () => {
  /**
   * CONTRACT 1: Strong/healthy condition produces low hardening pressure
   *
   * Meaning: When business is healthy, recommendations can be presented with
   * higher confidence. The business can absorb implementation risk.
   */
  describe("Contract 1: Healthy condition = low hardening pressure", () => {
    it("should identify HEALTHY status for strong financials", () => {
      const health = assessFinancialHealth(healthyFinancials);
      expect(health).toBe(FinancialHealth.HEALTHY);
    });

    it("should score high for available committed owner", () => {
      const ownerScore = scoreOwnerHealth(healthyOwner);
      expect(ownerScore).toBeGreaterThanOrEqual(75);
    });

    it("should score high for capable team", () => {
      const teamScore = scoreTeamCapability(strongCapacity);
      expect(teamScore).toBeGreaterThan(75);
    });

    it("should score high for healthy customer base", () => {
      const customerScore = scoreCustomerHealth(healthyCustomer);
      expect(customerScore).toBeGreaterThan(75);
    });

    it("should calculate overall healthy status from strong components", () => {
      const condition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const overallScore = calculateOverallHealth(condition);
      const status = healthScoreToStatus(overallScore);
      expect(status).toBe("healthy" || "thriving");
      expect(overallScore).toBeGreaterThan(75);
    });

    it("should identify strengths when condition is healthy", () => {
      const condition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        overallHealth: "healthy" as const,
        riskFactors: [],
        strengths: [],
      };

      const strengths = identifyStrengths(condition);
      expect(strengths.length).toBeGreaterThan(0);
    });
  });

  /**
   * CONTRACT 2: Weak/critical condition produces high hardening pressure
   *
   * Meaning: When business is in distress, recommendations must be presented
   * with caution and risk disclosure. Implementation complexity should be minimal.
   */
  describe("Contract 2: Weak/critical condition = high hardening pressure", () => {
    it("should identify CRITICAL status for severe cash crisis", () => {
      const health = assessFinancialHealth(criticalFinancials);
      expect(health).toBe(FinancialHealth.CRITICAL);
    });

    it("should score low for unavailable owner", () => {
      const ownerScore = scoreOwnerHealth(weakOwner);
      expect(ownerScore).toBeLessThan(50);
    });

    it("should score low for weak team", () => {
      const teamScore = scoreTeamCapability(weakCapacity);
      expect(teamScore).toBeLessThan(50);
    });

    it("should score low for weak customer base", () => {
      const customerScore = scoreCustomerHealth(weakCustomer);
      expect(customerScore).toBeLessThan(50);
    });

    it("should calculate CRITICAL overall status from weak components", () => {
      const condition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: criticalFinancials,
        owner: weakOwner,
        capacity: weakCapacity,
        customer: weakCustomer,
        riskFactors: [],
        strengths: [],
      };

      const overallScore = calculateOverallHealth(condition);
      const status = healthScoreToStatus(overallScore);
      expect(status).toBe("critical" || "stressed");
      expect(overallScore).toBeLessThan(50);
    });

    it("should identify risk factors when condition is critical", () => {
      const condition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: criticalFinancials,
        owner: weakOwner,
        capacity: weakCapacity,
        customer: weakCustomer,
        overallHealth: "critical" as const,
        riskFactors: [],
        strengths: [],
      };

      const risks = identifyRiskFactors(condition);
      expect(risks.length).toBeGreaterThan(0);
    });
  });

  /**
   * CONTRACT 3: Financial distress increases recommendation risk concern
   *
   * Meaning: Financial weakness should independently raise hardening pressure,
   * even if other dimensions are strong.
   */
  describe("Contract 3: Financial distress raises risk concern independently", () => {
    it("should assess STRESSED despite strong team", () => {
      const health = assessFinancialHealth(stressedFinancials);
      expect(health).toBe(FinancialHealth.STRESSED);
    });

    it("should lower overall health when financials are stressed", () => {
      const stressedCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: stressedFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const healthyCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const stressedScore = calculateOverallHealth(stressedCondition);
      const healthyScore = calculateOverallHealth(healthyCondition);

      // Financial stress should pull down overall score
      expect(stressedScore).toBeLessThan(healthyScore);
    });
  });

  /**
   * CONTRACT 4: Owner/team weakness reduces confidence, even with good financials
   *
   * Meaning: Execution risk from weak ownership/team should independently
   * raise hardening pressure.
   */
  describe("Contract 4: Owner/team weakness raises hardening pressure independently", () => {
    it("should lower overall health when owner is unavailable", () => {
      const weakOwnerCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: weakOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const strongOwnerCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const weakOwnerScore = calculateOverallHealth(weakOwnerCondition);
      const strongOwnerScore = calculateOverallHealth(strongOwnerCondition);

      expect(weakOwnerScore).toBeLessThan(strongOwnerScore);
    });

    it("should lower overall health when team is weak", () => {
      const weakTeamCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: weakCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const strongTeamCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const weakTeamScore = calculateOverallHealth(weakTeamCondition);
      const strongTeamScore = calculateOverallHealth(strongTeamCondition);

      expect(weakTeamScore).toBeLessThan(strongTeamScore);
    });
  });

  /**
   * CONTRACT 5: Missing/insufficient condition data must not create false confidence
   *
   * Meaning: If we don't have condition assessment, we should not assume the
   * business is healthy. Missing data should default to caution.
   */
  describe("Contract 5: No false confidence from missing data", () => {
    it("should not produce HEALTHY status from critical conditions across all dimensions", () => {
      const criticalCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: criticalFinancials,
        owner: weakOwner,
        capacity: weakCapacity,
        customer: weakCustomer,
        riskFactors: [],
        strengths: [],
      };

      const score = calculateOverallHealth(criticalCondition);
      const status = healthScoreToStatus(score);
      expect(["critical", "stressed"].includes(status)).toBe(true);
    });

    it("should identify risks when all dimensions are weak", () => {
      const criticalCondition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: criticalFinancials,
        owner: weakOwner,
        capacity: weakCapacity,
        customer: weakCustomer,
        overallHealth: "critical" as const,
        riskFactors: [],
        strengths: [],
      };

      const risks = identifyRiskFactors(criticalCondition);
      expect(risks.length).toBeGreaterThan(0);
    });
  });

  /**
   * CONTRACT 6: Determinism - same input produces same hardening signal
   *
   * Meaning: Business condition assessment must be deterministic and repeatable.
   * Same company assessed twice should produce the same hardening pressure.
   */
  describe("Contract 6: Deterministic hardening signals", () => {
    const testFinancials = {
      monthlyRecurringRevenue: 250000,
      monthlyExpenses: 100000,
      cashOnHand: 500000,
      burnRate: 0,
      cashRunwayMonths: 12,
      grossMargin: 75,
      customerConcentration: 20,
      operatingMargin: 60,
      dataSource: "accounting_software" as const,
      lastUpdated: new Date(),
    };

    it("should produce same financial health assessment for same input", () => {
      const health1 = assessFinancialHealth(testFinancials);
      const health2 = assessFinancialHealth(testFinancials);
      expect(health1).toBe(health2);
    });

    it("should produce same owner score for same input", () => {
      const score1 = scoreOwnerHealth(healthyOwner);
      const score2 = scoreOwnerHealth(healthyOwner);
      expect(score1).toBe(score2);
    });

    it("should produce same overall health status for same inputs", () => {
      const condition = {
        workspaceId: "test-ws",
        engagementId: "test-eng",
        assessedAt: new Date(),
        assessedByUserId: "test-user",
        financials: testFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const status1 = healthScoreToStatus(calculateOverallHealth(condition));
      const status2 = healthScoreToStatus(calculateOverallHealth(condition));
      expect(status1).toBe(status2);
    });
  });

  /**
   * CONTRACT 7: Workspace isolation must be preserved if DB-backed
   *
   * Note: This test documents the contract but doesn't test DB directly.
   * If getCurrentCondition uses DB, the caller must verify workspace isolation
   * at the route/service layer.
   */
  describe("Contract 7: Workspace isolation requirement", () => {
    it("should accept workspaceId in condition objects", () => {
      const condition = {
        workspaceId: "workspace-1",
        engagementId: "engagement-1",
        assessedAt: new Date(),
        assessedByUserId: "user-1",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      expect(condition.workspaceId).toBe("workspace-1");
    });

    it("should include workspace context in assessment", () => {
      const ws1Condition = {
        workspaceId: "workspace-1",
        engagementId: "engagement-1",
        assessedAt: new Date(),
        assessedByUserId: "user-1",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      const ws2Condition = {
        workspaceId: "workspace-2",
        engagementId: "engagement-2",
        assessedAt: new Date(),
        assessedByUserId: "user-2",
        financials: healthyFinancials,
        owner: healthyOwner,
        capacity: strongCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      };

      // Both should produce same health score (domain logic is workspace-agnostic)
      // But callers must enforce that queries respect workspaceId
      const score1 = calculateOverallHealth(ws1Condition);
      const score2 = calculateOverallHealth(ws2Condition);
      expect(score1).toBe(score2);

      // However, workspace isolation enforcement happens at service/route layer
      expect(ws1Condition.workspaceId).not.toBe(ws2Condition.workspaceId);
    });
  });

  /**
   * CONTRACT 8: Hardening mapping - severity score to safety pressure
   *
   * This contract test documents what the expected mapping should be.
   * It serves as input to implementation of a future hardening service.
   */
  describe("Contract 8: Hardening pressure mapping (future service contract)", () => {
    it("should map CRITICAL (score < 20) → maximum caution", () => {
      // When a recommendation service checks BC context:
      // - See status CRITICAL
      // - Apply maximum hardening (high caution, complex action avoidance)
      expect(healthScoreToStatus(15)).toBe("critical");
    });

    it("should map STRESSED (score 20-40) → elevated caution", () => {
      // Recommendation service should apply elevated hardening
      expect(healthScoreToStatus(30)).toBe("stressed");
    });

    it("should map STABLE (score 40-60) → normal confidence", () => {
      // Recommendation service can proceed normally
      expect(healthScoreToStatus(50)).toBe("stable");
    });

    it("should map HEALTHY (score 60-80) → standard confidence", () => {
      // Recommendation service can present normally
      expect(healthScoreToStatus(70)).toBe("healthy");
    });

    it("should map THRIVING (score 80+) → high confidence", () => {
      // Recommendation service can present with high confidence
      expect(healthScoreToStatus(85)).toBe("thriving");
    });
  });

  /**
   * CONTRACT 9: Production service-layer hardening context
   *
   * Exercises the production aggregator
   * evaluateBusinessConditionHardeningContext, which converts an existing
   * business-condition assessment into deterministic recommendation safety
   * context. No DB, no routes, no AI — pure derivation from existing primitives.
   */
  describe("Contract 9: Production hardening context (evaluateBusinessConditionHardeningContext)", () => {
    const baseMeta = {
      workspaceId: "test-ws",
      engagementId: "test-eng",
      assessedAt: new Date("2025-01-01T00:00:00Z"),
      assessedByUserId: "test-user",
    };

    const healthyConditionInput = {
      ...baseMeta,
      financials: healthyFinancials,
      owner: healthyOwner,
      capacity: strongCapacity,
      customer: healthyCustomer,
      riskFactors: [],
      strengths: [],
    };

    const thrivingConditionInput = {
      ...baseMeta,
      financials: healthyFinancials,
      owner: healthyOwner,
      capacity: exceptionalCapacity,
      customer: healthyCustomer,
      riskFactors: [],
      strengths: [],
    };

    const criticalConditionInput = {
      ...baseMeta,
      financials: criticalFinancials,
      owner: weakOwner,
      capacity: weakCapacity,
      customer: weakCustomer,
      riskFactors: [],
      strengths: [],
    };

    // Weak non-financial dimensions; only financials vary between the two.
    const weakDimsHealthyFinancials = {
      ...baseMeta,
      financials: healthyFinancials,
      owner: weakOwner,
      capacity: weakCapacity,
      customer: weakCustomer,
      riskFactors: [],
      strengths: [],
    };

    const weakDimsCriticalFinancials = {
      ...baseMeta,
      financials: criticalFinancials,
      owner: weakOwner,
      capacity: weakCapacity,
      customer: weakCustomer,
      riskFactors: [],
      strengths: [],
    };

    // 1. Healthy/thriving condition → low/minimal hardening pressure.
    it("should return low hardening pressure for a healthy condition", () => {
      const ctx = evaluateBusinessConditionHardeningContext(healthyConditionInput);
      expect(ctx.conditionStatus).toBe("healthy");
      expect(["low", "minimal"]).toContain(ctx.hardeningPressure);
      expect(ctx.cautionLevel).toBe("standard");
    });

    it("should return minimal hardening pressure for a thriving condition", () => {
      const ctx = evaluateBusinessConditionHardeningContext(thrivingConditionInput);
      expect(ctx.conditionStatus).toBe("thriving");
      expect(ctx.hardeningPressure).toBe("minimal");
      expect(ctx.confidenceAdjustment).toBe("maintain_or_increase");
      expect(ctx.cautionLevel).toBe("low");
    });

    // 2. Critical condition → maximum hardening pressure + manual-review caution.
    it("should return maximum hardening and manual-review caution for a critical condition", () => {
      const ctx = evaluateBusinessConditionHardeningContext(criticalConditionInput);
      expect(ctx.conditionStatus).toBe("critical");
      expect(ctx.hardeningPressure).toBe("maximum");
      expect(ctx.recommendationRiskAdjustment).toBe("high");
      expect(ctx.cautionLevel).toBe("manual_review_required");
    });

    // 3. Financial distress raises recommendation risk adjustment.
    it("should raise recommendation risk adjustment under financial distress", () => {
      const healthyFin = evaluateBusinessConditionHardeningContext(
        weakDimsHealthyFinancials
      );
      const distressedFin = evaluateBusinessConditionHardeningContext(
        weakDimsCriticalFinancials
      );

      const healthyRank = RISK_ADJUSTMENT_ORDER.indexOf(
        healthyFin.recommendationRiskAdjustment
      );
      const distressedRank = RISK_ADJUSTMENT_ORDER.indexOf(
        distressedFin.recommendationRiskAdjustment
      );

      expect(distressedRank).toBeGreaterThan(healthyRank);
    });

    // 4. Owner/team weakness reduces confidence or increases caution.
    it("should reduce confidence when owner/team are weak versus strong", () => {
      const strong = evaluateBusinessConditionHardeningContext(healthyConditionInput);

      const weakOwnerTeam = evaluateBusinessConditionHardeningContext({
        ...baseMeta,
        financials: healthyFinancials,
        owner: weakOwner,
        capacity: weakCapacity,
        customer: healthyCustomer,
        riskFactors: [],
        strengths: [],
      });

      const strongConfidence = CONFIDENCE_ORDER.indexOf(strong.confidenceAdjustment);
      const weakConfidence = CONFIDENCE_ORDER.indexOf(
        weakOwnerTeam.confidenceAdjustment
      );

      // Either confidence is reduced (lower index) or caution rose above standard.
      const cautionRose =
        weakOwnerTeam.cautionLevel === "elevated_caution" ||
        weakOwnerTeam.cautionLevel === "manual_review_required";

      expect(weakConfidence < strongConfidence || cautionRose).toBe(true);
    });

    // 5. Missing/insufficient/weak condition must not produce false confidence.
    it("should not produce false confidence for a fully weak condition", () => {
      const ctx = evaluateBusinessConditionHardeningContext(criticalConditionInput);
      expect(["maintain", "maintain_or_increase"]).not.toContain(
        ctx.confidenceAdjustment
      );
      expect(["minimal", "low"]).not.toContain(ctx.hardeningPressure);
      expect(ctx.cautionLevel).not.toBe("low");
    });

    // 6. Output includes reasons from risk factors.
    it("should include reasons derived from identified risk factors", () => {
      const ctx = evaluateBusinessConditionHardeningContext(criticalConditionInput);
      const expectedRisks = identifyRiskFactors({
        ...criticalConditionInput,
        overallHealth: "critical" as const,
      });
      expect(ctx.reasons.length).toBeGreaterThan(0);
      expect(ctx.reasons).toEqual(expectedRisks);
    });

    // 7. Output includes strengths when present.
    it("should include strengths when the condition is healthy", () => {
      const ctx = evaluateBusinessConditionHardeningContext(healthyConditionInput);
      expect(ctx.strengths.length).toBeGreaterThan(0);
    });

    // 8. Same input produces identical output (determinism).
    it("should produce identical output for identical input", () => {
      const a = evaluateBusinessConditionHardeningContext(healthyConditionInput);
      const b = evaluateBusinessConditionHardeningContext(healthyConditionInput);
      expect(a).toEqual(b);
    });

    it("should expose a numeric conditionScore consistent with healthScoreToStatus", () => {
      const ctx = evaluateBusinessConditionHardeningContext(criticalConditionInput);
      expect(typeof ctx.conditionScore).toBe("number");
      expect(healthScoreToStatus(ctx.conditionScore)).toBe(ctx.conditionStatus);
    });
  });
});

/**
 * P2C-BATCH-4A: PERSISTED-PROFILE → HARDENING ADAPTER CONTRACT
 *
 * Contract for deriveHardeningContextFromConditionProfile, which maps the
 * PERSISTED categorical BusinessConditionProfile shape (businessStatus /
 * severityScore / pressure & maturity levels) onto the existing
 * BusinessConditionHardeningContext, reusing the status→hardening mapping.
 *
 * Persisted vocabularies (src/domain/constants/statuses.ts):
 * - businessStatus: critical | distressed | challenged | stable | improving | strong
 * - pressure/risk: low | medium | high | critical
 * - maturity: low | medium | high
 * - severityScore: 1..10 (higher = worse)
 * - engagementId present; workspaceId is NOT stored on the profile.
 */
describe("P2C-BATCH-4A: Profile -> Hardening Adapter", () => {
  const benignProfile: ConditionProfileLike = {
    engagementId: "eng-benign",
    businessStatus: "strong",
    severityScore: 2,
    urgencyLevel: "low",
    cashPressureLevel: "low",
    marginPressureLevel: "low",
    clientConcentrationRisk: "low",
    ownerDependencyRisk: "low",
    keyPersonDependencyRisk: "low",
    processMaturityLevel: "high",
    managementMaturityLevel: "high",
    executionCapacityLevel: "high",
    moralFragilityLevel: "low",
    resilienceLevel: "high",
    growthReadinessLevel: "high",
  };

  const criticalProfile: ConditionProfileLike = {
    engagementId: "eng-critical",
    businessStatus: "critical",
    severityScore: 9,
    urgencyLevel: "critical",
    cashPressureLevel: "critical",
    marginPressureLevel: "critical",
    clientConcentrationRisk: "high",
    ownerDependencyRisk: "critical",
    keyPersonDependencyRisk: "critical",
    processMaturityLevel: "low",
    managementMaturityLevel: "low",
    executionCapacityLevel: "low",
    moralFragilityLevel: "high",
    resilienceLevel: "low",
    growthReadinessLevel: "low",
  };

  const distressedProfile: ConditionProfileLike = {
    engagementId: "eng-distressed",
    businessStatus: "distressed",
    severityScore: 7,
    urgencyLevel: "high",
    cashPressureLevel: "high",
    marginPressureLevel: "medium",
    clientConcentrationRisk: "medium",
    ownerDependencyRisk: "high",
    keyPersonDependencyRisk: "medium",
    processMaturityLevel: "medium",
    managementMaturityLevel: "medium",
    executionCapacityLevel: "medium",
    moralFragilityLevel: "medium",
    resilienceLevel: "medium",
    growthReadinessLevel: "medium",
  };

  const stableProfile: ConditionProfileLike = {
    engagementId: "eng-stable",
    businessStatus: "stable",
    severityScore: 4,
    urgencyLevel: "medium",
    cashPressureLevel: "medium",
    marginPressureLevel: "medium",
    clientConcentrationRisk: "medium",
    ownerDependencyRisk: "medium",
    keyPersonDependencyRisk: "medium",
    processMaturityLevel: "medium",
    managementMaturityLevel: "medium",
    executionCapacityLevel: "medium",
    moralFragilityLevel: "medium",
    resilienceLevel: "medium",
    growthReadinessLevel: "medium",
  };

  const improvingProfile: ConditionProfileLike = {
    ...benignProfile,
    engagementId: "eng-improving",
    businessStatus: "improving",
    severityScore: 3,
  };

  // 1. Critical/high-severity → maximum hardening + manual review.
  it("maps a critical/high-severity profile to maximum hardening + manual review", () => {
    const ctx = deriveHardeningContextFromConditionProfile(criticalProfile);
    expect(ctx.conditionStatus).toBe("critical");
    expect(ctx.hardeningPressure).toBe("maximum");
    expect(ctx.recommendationRiskAdjustment).toBe("high");
    expect(ctx.confidenceAdjustment).toBe("strongly_reduce");
    expect(ctx.cautionLevel).toBe("manual_review_required");
    expect(ctx.sufficientData).toBe(true);
  });

  // 2. Stressed/elevated-severity → high hardening, reduce, elevated caution.
  it("maps a distressed/elevated-severity profile to high hardening + elevated caution", () => {
    const ctx = deriveHardeningContextFromConditionProfile(distressedProfile);
    expect(ctx.conditionStatus).toBe("stressed");
    expect(ctx.hardeningPressure).toBe("high");
    expect(ctx.confidenceAdjustment).toBe("reduce");
    expect(ctx.cautionLevel).toBe("elevated_caution");
  });

  // 3. stable / healthy(improving) / thriving(strong) → normal/low/minimal.
  it("maps stable/improving/strong profiles to normal/low/minimal pressure", () => {
    const stable = deriveHardeningContextFromConditionProfile(stableProfile);
    expect(stable.conditionStatus).toBe("stable");
    expect(stable.hardeningPressure).toBe("normal");

    const improving = deriveHardeningContextFromConditionProfile(improvingProfile);
    expect(improving.conditionStatus).toBe("healthy");
    expect(improving.hardeningPressure).toBe("low");

    const strong = deriveHardeningContextFromConditionProfile(benignProfile);
    expect(strong.conditionStatus).toBe("thriving");
    expect(strong.hardeningPressure).toBe("minimal");
  });

  // 4. High cash pressure OR high severity raises risk/caution vs benign.
  it("raises risk/caution when cash pressure or severity is high vs benign", () => {
    const benign = deriveHardeningContextFromConditionProfile(benignProfile);
    const highCash = deriveHardeningContextFromConditionProfile({
      ...benignProfile,
      cashPressureLevel: "critical",
    });
    const highSeverity = deriveHardeningContextFromConditionProfile({
      ...benignProfile,
      severityScore: 9,
    });

    const benignRisk = RISK_ADJUSTMENT_ORDER.indexOf(benign.recommendationRiskAdjustment);
    const benignCaution = CAUTION_ORDER.indexOf(benign.cautionLevel);

    expect(
      RISK_ADJUSTMENT_ORDER.indexOf(highCash.recommendationRiskAdjustment)
    ).toBeGreaterThan(benignRisk);
    expect(CAUTION_ORDER.indexOf(highCash.cautionLevel)).toBeGreaterThan(benignCaution);
    expect(
      RISK_ADJUSTMENT_ORDER.indexOf(highSeverity.recommendationRiskAdjustment)
    ).toBeGreaterThan(benignRisk);
  });

  // 5. Dependency/maturity weakness adds reasons and no false confidence.
  it("adds reasons for dependency/maturity weakness without false confidence", () => {
    const weak = deriveHardeningContextFromConditionProfile({
      ...benignProfile,
      businessStatus: "stable",
      severityScore: 5,
      ownerDependencyRisk: "critical",
      keyPersonDependencyRisk: "critical",
      processMaturityLevel: "low",
      executionCapacityLevel: "low",
      resilienceLevel: "low",
    });

    expect(weak.reasons.length).toBeGreaterThan(0);
    expect(weak.reasons.join(" | ").toLowerCase()).toMatch(
      /owner|key-person|maturity|execution|resilience/
    );
    expect(["minimal", "low"]).not.toContain(weak.hardeningPressure);
    expect(["maintain", "maintain_or_increase"]).not.toContain(weak.confidenceAdjustment);
  });

  // 6. Missing/null profile → caution-preserving context (no false confidence).
  it("returns a caution-preserving context for a missing/null profile", () => {
    for (const input of [null, undefined, {} as ConditionProfileLike]) {
      const ctx = deriveHardeningContextFromConditionProfile(input);
      expect(ctx.sufficientData).toBe(false);
      expect(ctx.hardeningPressure).not.toBe("low");
      expect(ctx.hardeningPressure).not.toBe("minimal");
      expect(ctx.confidenceAdjustment).not.toBe("maintain_or_increase");
      expect(ctx.cautionLevel).not.toBe("low");
      expect(ctx.reasons.length).toBeGreaterThan(0);
      expect(ctx.reasons.join(" ").toLowerCase()).toContain("insufficient");
    }
  });

  // 7. Deterministic: same input → identical output.
  it("produces identical output for identical input", () => {
    expect(deriveHardeningContextFromConditionProfile(distressedProfile)).toEqual(
      deriveHardeningContextFromConditionProfile(distressedProfile)
    );
    expect(deriveHardeningContextFromConditionProfile(null)).toEqual(
      deriveHardeningContextFromConditionProfile(null)
    );
  });

  // 8. engagementId surfaced; workspaceId never fabricated.
  it("surfaces engagementId from the profile and does not invent workspaceId", () => {
    const ctx = deriveHardeningContextFromConditionProfile(criticalProfile);
    expect(ctx.engagementId).toBe("eng-critical");
    expect((ctx as Record<string, unknown>).workspaceId).toBeUndefined();
    expect(deriveHardeningContextFromConditionProfile(null).engagementId ?? null).toBeNull();
  });

  // Invariant: band score consistent with the stressed range.
  it("keeps conditionScore consistent with the derived conditionStatus band", () => {
    const ctx = deriveHardeningContextFromConditionProfile(distressedProfile);
    expect(typeof ctx.conditionScore).toBe("number");
    expect(ctx.conditionScore).toBeGreaterThanOrEqual(20);
    expect(ctx.conditionScore).toBeLessThan(40);
  });
});

/**
 * P2C-BATCH-4B: READ-ONLY CONDITION HARDENING SERVICE SURFACE
 *
 * Contract for summarizeConditionHardening — the pure composer that pairs a
 * persisted condition profile (or null) with its derived hardening context.
 * No DB, no routes, no mutation. (The DB wrapper getCurrentConditionWithHardening
 * simply delegates to the unchanged getCurrentCondition and this composer; its
 * DB read is exercised by the P2B-style DB suite, not this DB-free P2C file.)
 */
describe("P2C-BATCH-4B: summarizeConditionHardening (read-only service surface)", () => {
  const sampleProfile: ConditionProfileLike = {
    engagementId: "eng-4b",
    businessStatus: "distressed",
    severityScore: 7,
    urgencyLevel: "high",
    cashPressureLevel: "high",
    marginPressureLevel: "medium",
    clientConcentrationRisk: "medium",
    ownerDependencyRisk: "high",
    keyPersonDependencyRisk: "medium",
    processMaturityLevel: "medium",
    managementMaturityLevel: "medium",
    executionCapacityLevel: "medium",
    moralFragilityLevel: "medium",
    resilienceLevel: "medium",
    growthReadinessLevel: "medium",
  };

  // 1. Valid profile → profile unchanged + hardeningContext from the adapter + sufficientData true.
  it("returns the profile unchanged with adapter-derived hardening context", () => {
    const summary = summarizeConditionHardening(sampleProfile);
    expect(summary.profile).toBe(sampleProfile);
    expect(summary.hardeningContext).toEqual(
      deriveHardeningContextFromConditionProfile(sampleProfile)
    );
    expect(summary.hardeningContext.sufficientData).toBe(true);
  });

  // 2. Null profile → profile null, caution-preserving, no false confidence.
  it("returns a caution-preserving summary for a null profile", () => {
    const summary = summarizeConditionHardening(null);
    expect(summary.profile).toBeNull();
    expect(summary.hardeningContext.sufficientData).toBe(false);
    expect(summary.hardeningContext.hardeningPressure).not.toBe("low");
    expect(summary.hardeningContext.hardeningPressure).not.toBe("minimal");
    expect(summary.hardeningContext.confidenceAdjustment).not.toBe("maintain_or_increase");
    expect(summary.hardeningContext.cautionLevel).not.toBe("low");
  });

  // 3. Deterministic: same input → identical output.
  it("produces identical output for identical input", () => {
    expect(summarizeConditionHardening(sampleProfile)).toEqual(
      summarizeConditionHardening(sampleProfile)
    );
    expect(summarizeConditionHardening(null)).toEqual(
      summarizeConditionHardening(null)
    );
  });

  // 4. engagementId preserved through the hardening context.
  it("preserves engagementId through the hardening context", () => {
    const summary = summarizeConditionHardening(sampleProfile);
    expect(summary.hardeningContext.engagementId).toBe("eng-4b");
    expect(summarizeConditionHardening(null).hardeningContext.engagementId ?? null).toBeNull();
  });

  // 5. No mutation of the input profile.
  it("does not mutate the input profile", () => {
    const snapshot = JSON.parse(JSON.stringify(sampleProfile));
    summarizeConditionHardening(sampleProfile);
    expect(sampleProfile).toEqual(snapshot);
  });
});
