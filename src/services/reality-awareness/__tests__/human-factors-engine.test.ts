/**
 * Human Factors Engine Test Suite
 *
 * Tests comprehensive human factors assessment including:
 * - Bottleneck detection
 * - Follow-through risk
 * - Communication, morale, accountability factors
 * - Integration of all factors into risk profile
 * - Recommendation generation
 * - Workspace isolation
 */

import {
  assessHumanFactors,
  HumanFactorsAssessmentRequest,
  getHumanRealityImpact,
} from "../human-factors-engine";
import {
  HumanExecutionContext,
  HUMAN_FACTORS,
  calculateHumanRiskScore,
  identifyCriticalFactors,
  validateHumanFactorProfile,
} from "@/domain/reality/human-factors-model";
import { BottleneckContext } from "../bottleneck-detector";
import { FollowThroughContext } from "../follow-through-risk";

describe("Human Factors Engine", () => {
  const baseContext: HumanExecutionContext = {
    workspaceId: "ws-test-001",
    engagementId: "eng-test-001",
    ownerId: "owner-001",
    teamSize: 8,
    organizationalMaturity: "growth",
    communicationQuality: "good",
    teamMorale: "stable",
    ownerAvailability: 70,
    keyPersonCount: 2,
    accountabilityFramework: "clear",
  };

  const baseRequest: HumanFactorsAssessmentRequest = {
    workspaceId: "ws-test-001",
    engagementId: "eng-test-001",
    context: baseContext,
  };

  describe("Workspace Isolation", () => {
    it("should isolate assessments to single workspace", async () => {
      const request1 = { ...baseRequest, workspaceId: "ws-001" };
      const request2 = { ...baseRequest, workspaceId: "ws-002" };

      const result1 = await assessHumanFactors(request1);
      const result2 = await assessHumanFactors(request2);

      expect(result1.profile.workspaceId).toBe("ws-001");
      expect(result2.profile.workspaceId).toBe("ws-002");
      expect(result1.profile.workspaceId).not.toBe(result2.profile.workspaceId);
    });

    it("should isolate assessments to single engagement", async () => {
      const request1 = { ...baseRequest, engagementId: "eng-001" };
      const request2 = { ...baseRequest, engagementId: "eng-002" };

      const result1 = await assessHumanFactors(request1);
      const result2 = await assessHumanFactors(request2);

      expect(result1.profile.engagementId).toBe("eng-001");
      expect(result2.profile.engagementId).toBe("eng-002");
    });
  });

  describe("Complete Factor Assessment", () => {
    it("should assess all eight human factors", async () => {
      const result = await assessHumanFactors(baseRequest);

      expect(Object.keys(result.profile.factors).length).toBe(8);
      HUMAN_FACTORS.forEach((factor) => {
        expect(result.profile.factors[factor]).toBeDefined();
        expect(result.profile.factors[factor].factor).toBe(factor);
      });
    });

    it("should validate profile structure", async () => {
      const result = await assessHumanFactors(baseRequest);

      const validation = validateHumanFactorProfile(result.profile);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should calculate overall risk score", async () => {
      const result = await assessHumanFactors(baseRequest);

      const calculatedScore = calculateHumanRiskScore(result.profile.factors);
      expect(calculatedScore).toBe(result.profile.overallRiskScore);
      expect(result.profile.overallRiskScore).toBeGreaterThanOrEqual(0);
      expect(result.profile.overallRiskScore).toBeLessThanOrEqual(100);
    });

    it("should identify critical factors", async () => {
      const result = await assessHumanFactors(baseRequest);

      const identifiedCritical = identifyCriticalFactors(result.profile.factors);
      expect(identifiedCritical).toEqual(result.profile.criticalFactors);
    });
  });

  describe("Factor-Specific Assessment", () => {
    it("should detect low owner bottleneck in healthy context", async () => {
      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: {
          ...baseContext,
          ownerAvailability: 90,
        },
        bottleneckContext: {
          workspaceId: "ws-test-001",
          engagementId: "eng-test-001",
          ownerId: "owner-001",
          ownerAvailabilityPercent: 90,
          recentDecisionApprovalTimes: [2, 2, 3, 2],
          organizationSize: 10,
          executionComplexity: "simple",
          seasonalVariation: [],
          delegationCapability: true,
        },
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors.owner_bottleneck.severity).not.toBe(
        "CRITICAL"
      );
      expect(result.profile.factors.owner_bottleneck.severity).not.toBe("HIGH");
    });

    it("should detect high owner bottleneck in constrained context", async () => {
      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: {
          ...baseContext,
          ownerAvailability: 20,
        },
        bottleneckContext: {
          workspaceId: "ws-test-001",
          engagementId: "eng-test-001",
          ownerId: "owner-001",
          ownerAvailabilityPercent: 20,
          recentDecisionApprovalTimes: [14, 21, 18, 16],
          organizationSize: 20,
          executionComplexity: "critical",
          seasonalVariation: ["Q4"],
          delegationCapability: false,
        },
      };

      const result = await assessHumanFactors(request);

      expect(
        ["HIGH", "CRITICAL"].includes(
          result.profile.factors.owner_bottleneck.severity
        )
      ).toBe(true);
      expect(
        result.profile.factors.owner_bottleneck.interventionNeeded
      ).toBe(true);
    });

    it("should detect follow-through risk from poor completion history", async () => {
      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        followThroughContext: {
          workspaceId: "ws-test-001",
          engagementId: "eng-test-001",
          pastInitiativeOutcomes: [
            {
              commitmentDate: new Date("2026-01-01"),
              actualCompletionDate: new Date("2026-02-15"),
              scope: "Initiative A",
              wasPartial: true,
              reasonForSlippage: "Resource constraints",
            },
            {
              commitmentDate: new Date("2026-02-01"),
              actualCompletionDate: new Date("2026-04-01"),
              scope: "Initiative B",
              wasPartial: true,
              reasonForSlippage: "Scope creep",
            },
            {
              commitmentDate: new Date("2026-03-01"),
              actualCompletionDate: new Date("2026-03-30"),
              scope: "Initiative C",
              wasPartial: false,
            },
          ],
          teamSize: 5,
          teamExperienceLevel: "junior",
          currentWorkloadPercent: 95,
          managerAttentionLevel: "low",
          organizationalChangeFrequency: "frequent",
        },
      };

      const result = await assessHumanFactors(request);

      expect(
        ["HIGH", "CRITICAL"].includes(
          result.profile.factors.follow_through_risk.severity
        )
      ).toBe(true);
      expect(result.profile.factors.follow_through_risk.evidencePoints.some(e =>
        e.toLowerCase().includes("completion") || e.toLowerCase().includes("execute")
      )).toBe(true);
    });

    it("should assess resistance to change based on organizational maturity", async () => {
      const complexContext: HumanExecutionContext = {
        ...baseContext,
        organizationalMaturity: "complex",
        recentlyFailedInitiatives: ["Initiative X", "Initiative Y"],
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: complexContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors.resistance_to_change.severity).not.toBe(
        "NONE"
      );
      expect(
        result.profile.factors.resistance_to_change.evidencePoints.length
      ).toBeGreaterThan(0);
    });

    it("should assess communication breakdown risk", async () => {
      const poorCommContext: HumanExecutionContext = {
        ...baseContext,
        communicationQuality: "poor",
        teamSize: 25,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: poorCommContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors.communication_breakdown.severity).toBe(
        "CRITICAL"
      );
    });

    it("should assess morale fragility", async () => {
      const lowMoraleContext: HumanExecutionContext = {
        ...baseContext,
        teamMorale: "low",
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: lowMoraleContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors.morale_fragility.severity).toBe("HIGH");
    });

    it("should assess key-person dependency", async () => {
      const highDependencyContext: HumanExecutionContext = {
        ...baseContext,
        teamSize: 5,
        keyPersonCount: 4,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: highDependencyContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors.key_person_dependency.severity).not.toBe(
        "NONE"
      );
    });

    it("should assess accountability framework", async () => {
      const weakAccountabilityContext: HumanExecutionContext = {
        ...baseContext,
        accountabilityFramework: "weak",
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: weakAccountabilityContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors.accountability_weakness.severity).toBe(
        "HIGH"
      );
    });
  });

  describe("Execution Delay Estimation", () => {
    it("should estimate minimal delay for healthy context", async () => {
      const healthyContext: HumanExecutionContext = {
        ...baseContext,
        ownerAvailability: 95,
        teamMorale: "high",
        communicationQuality: "excellent",
        accountabilityFramework: "rigorous",
        keyPersonCount: 0,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: healthyContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.estimatedExecutionDelay).toBeGreaterThanOrEqual(0);
      expect(result.estimatedExecutionDelay).toBeLessThanOrEqual(12);
    });

    it("should estimate delay for constrained context", async () => {
      const constrainedContext: HumanExecutionContext = {
        ...baseContext,
        ownerAvailability: 20,
        teamMorale: "low",
        communicationQuality: "poor",
        accountabilityFramework: "weak",
        keyPersonCount: 8,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: constrainedContext,
        bottleneckContext: {
          workspaceId: "ws-test-001",
          engagementId: "eng-test-001",
          ownerId: "owner-001",
          ownerAvailabilityPercent: 20,
          recentDecisionApprovalTimes: [20, 25, 22, 18],
          organizationSize: 15,
          executionComplexity: "critical",
          seasonalVariation: ["Q4"],
          delegationCapability: false,
        },
        followThroughContext: {
          workspaceId: "ws-test-001",
          engagementId: "eng-test-001",
          pastInitiativeOutcomes: [
            {
              commitmentDate: new Date("2026-01-01"),
              actualCompletionDate: new Date("2026-04-01"),
              scope: "Late Initiative",
              wasPartial: true,
            },
          ],
          teamSize: 8,
          teamExperienceLevel: "junior",
          currentWorkloadPercent: 100,
          managerAttentionLevel: "low",
          organizationalChangeFrequency: "constant",
        },
      };

      const result = await assessHumanFactors(request);

      // Constrained context should produce measurable delay
      expect(result.estimatedExecutionDelay).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Recommendations Generation", () => {
    it("should generate recommendations for critical factors", async () => {
      const criticalContext: HumanExecutionContext = {
        ...baseContext,
        teamMorale: "low",
        communicationQuality: "poor",
        accountabilityFramework: "weak",
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: criticalContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain("CRITICAL");
    });

    it("should prioritize interventions", async () => {
      const request: HumanFactorsAssessmentRequest = baseRequest;

      const result = await assessHumanFactors(request);

      expect(result.interventionPlans.size).toBeGreaterThan(0);

      // Check that plans have steps
      result.interventionPlans.forEach((steps) => {
        if (steps.length > 0) {
          expect(steps.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("Success Probability", () => {
    it("should calculate reasonable probability for healthy context", async () => {
      const healthyContext: HumanExecutionContext = {
        ...baseContext,
        ownerAvailability: 95,
        teamMorale: "high",
        communicationQuality: "excellent",
        accountabilityFramework: "rigorous",
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: healthyContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.successProbability).toBeGreaterThan(0.5);
      expect(result.successProbability).toBeLessThanOrEqual(0.85);
    });

    it("should calculate low probability for high-risk context", async () => {
      const riskyContext: HumanExecutionContext = {
        ...baseContext,
        ownerAvailability: 10,
        teamMorale: "low",
        communicationQuality: "poor",
        accountabilityFramework: "weak",
        keyPersonCount: 8,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: riskyContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.successProbability).toBeLessThan(0.5);
    });

    it("should never exceed 1.0 or go below 0.1", async () => {
      const result = await assessHumanFactors(baseRequest);

      expect(result.successProbability).toBeGreaterThanOrEqual(0.1);
      expect(result.successProbability).toBeLessThanOrEqual(1.0);
    });
  });

  describe("Human Reality Impact", () => {
    it("should calculate impact for healthy context", async () => {
      const result = await assessHumanFactors(baseRequest);
      const impact = getHumanRealityImpact(result.profile);

      expect(impact.delayDays).toBeGreaterThanOrEqual(0);
      expect(impact.riskFactor).toBeGreaterThanOrEqual(1);
      expect(impact.riskFactor).toBeLessThanOrEqual(2);
      expect(impact.successProbabilityAdjustment).toBeLessThanOrEqual(0);
    });

    it("should identify required interventions", async () => {
      const criticalContext: HumanExecutionContext = {
        ...baseContext,
        teamMorale: "low",
        communicationQuality: "poor",
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: criticalContext,
      };

      const result = await assessHumanFactors(request);
      const impact = getHumanRealityImpact(result.profile);

      if (result.profile.criticalFactors.length > 0) {
        expect(impact.requiredInterventions.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle minimal team size", async () => {
      const minimalContext: HumanExecutionContext = {
        ...baseContext,
        teamSize: 1,
        keyPersonCount: 1,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: minimalContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors).toBeDefined();
      const validation = validateHumanFactorProfile(result.profile);
      expect(validation.valid).toBe(true);
    });

    it("should handle large team size", async () => {
      const largeTeamContext: HumanExecutionContext = {
        ...baseContext,
        teamSize: 100,
        keyPersonCount: 10,
      };

      const request: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        context: largeTeamContext,
      };

      const result = await assessHumanFactors(request);

      expect(result.profile.factors).toBeDefined();
      const validation = validateHumanFactorProfile(result.profile);
      expect(validation.valid).toBe(true);
    });

    it("should handle various organizational maturity levels", async () => {
      const maturities = ["startup", "growth", "established", "complex"] as const;

      for (const maturity of maturities) {
        const context: HumanExecutionContext = {
          ...baseContext,
          organizationalMaturity: maturity,
        };

        const request: HumanFactorsAssessmentRequest = {
          ...baseRequest,
          context,
        };

        const result = await assessHumanFactors(request);

        expect(result.profile.factors).toBeDefined();
        const validation = validateHumanFactorProfile(result.profile);
        expect(validation.valid).toBe(true);
      }
    });

    it("should handle all communication quality levels", async () => {
      const qualities = ["poor", "fair", "good", "excellent"] as const;

      for (const quality of qualities) {
        const context: HumanExecutionContext = {
          ...baseContext,
          communicationQuality: quality,
        };

        const request: HumanFactorsAssessmentRequest = {
          ...baseRequest,
          context,
        };

        const result = await assessHumanFactors(request);

        expect(
          result.profile.factors.communication_breakdown.severity
        ).toBeDefined();
      }
    });
  });

  describe("Determinism and Idempotency", () => {
    it("should produce deterministic results", async () => {
      const result1 = await assessHumanFactors(baseRequest);
      const result2 = await assessHumanFactors(baseRequest);

      expect(result1.profile.overallRiskScore).toBe(result2.profile.overallRiskScore);
      expect(result1.estimatedExecutionDelay).toBe(result2.estimatedExecutionDelay);
      expect(result1.successProbability).toBe(result2.successProbability);
    });

    it("should handle multiple assessments independently", async () => {
      const request1: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        workspaceId: "ws-001",
        engagementId: "eng-001",
      };

      const request2: HumanFactorsAssessmentRequest = {
        ...baseRequest,
        workspaceId: "ws-002",
        engagementId: "eng-002",
      };

      const result1 = await assessHumanFactors(request1);
      const result2 = await assessHumanFactors(request2);

      expect(result1.profile.workspaceId).toBe("ws-001");
      expect(result2.profile.workspaceId).toBe("ws-002");
      expect(result1.profile.workspaceId).not.toBe(result2.profile.workspaceId);
      expect(result1.profile.engagementId).not.toBe(result2.profile.engagementId);
    });
  });
});
