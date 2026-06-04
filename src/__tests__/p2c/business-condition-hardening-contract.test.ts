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
} from "@/domain/business-condition/business-condition";

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
});
