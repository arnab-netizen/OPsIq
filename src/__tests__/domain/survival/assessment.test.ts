import {
  SurvivalAssessment,
  AssessmentStatus,
  SurvivalRisk,
  classifyOverallRisk,
  validateAssessment,
  assessmentToDTO,
  ASSESSMENT_REQUIREMENTS,
} from "@/domain/survival/assessment";
import { SurvivalFactorHealth } from "@/domain/reality/survival-factors";
import { ResilienceLevel } from "@/services/org-resilience-scorer";
import { CrisisState } from "@/domain/survival/gating-policy";

describe("SurvivalAssessment Domain", () => {
  const mockAssessment: SurvivalAssessment = {
    id: "assessment-123",
    workspaceId: "ws-test-xyz",
    status: AssessmentStatus.COMPLETE,
    assessedAt: new Date(),
    assessedBy: "user-456",

    factorAssessments: [
      {
        factor: "cash_runway_months",
        category: "financial",
        health: SurvivalFactorHealth.HEALTHY,
        current_value: 15,
        threshold_critical: 3,
        threshold_warning: 6,
        last_measured_at: new Date(),
        measurement_confidence: "high",
      },
    ],

    healthySummary: { count: 1, factors: ["cash_runway_months"] },
    warningSummary: { count: 0, factors: [] },
    criticalSummary: { count: 0, factors: [] },

    shockAnalysis: {
      detected: false,
      criticalFactorCount: 0,
      riskEscalation: "stable",
    },

    resilienceAnalysis: {
      score: {
        overallScore: 85,
        level: ResilienceLevel.HIGHLY_RESILIENT,
        scoreByCategory: { financial: 85 },
        criticalGaps: [],
        strengthAreas: ["financial: 85"],
        shockAbsorptionCapacity: 3,
        recoveryTimelineDays: 18,
        workspaceId: "ws-test-xyz",
        assessedAt: new Date(),
      },
      trend: "stable",
      recoveryEstimate: 18,
    },

    gatingAnalysis: {
      crisisState: CrisisState.HEALTHY,
      growthBlocked: false,
      blockedActions: [],
      permittedActions: [
        "HIRE_KEY_ROLE",
        "EXPAND_TO_NEW_MARKET",
        "LAUNCH_NEW_PRODUCT",
      ],
    },

    overallRisk: SurvivalRisk.LOW,
    recommendations: [
      {
        priority: "medium",
        category: "financial",
        action: "Monitor cash burn rate quarterly",
        rationale: "Current runway is healthy but requires ongoing monitoring",
        timeframe: "quarter",
      },
    ],
    criticalActions: [],
  };

  describe("classifyOverallRisk", () => {
    it("should classify CRITICAL risk with shock detected", () => {
      const risk = classifyOverallRisk(50, true, 0);
      expect(risk).toBe(SurvivalRisk.CRITICAL);
    });

    it("should classify CRITICAL risk with resilience < 40", () => {
      const risk = classifyOverallRisk(35, false, 0);
      expect(risk).toBe(SurvivalRisk.CRITICAL);
    });

    it("should classify CRITICAL risk with multiple critical factors", () => {
      const risk = classifyOverallRisk(70, false, 2);
      expect(risk).toBe(SurvivalRisk.CRITICAL);
    });

    it("should classify HIGH risk with one critical factor", () => {
      const risk = classifyOverallRisk(70, false, 1);
      expect(risk).toBe(SurvivalRisk.HIGH);
    });

    it("should classify MEDIUM risk with resilience 60-79", () => {
      const risk = classifyOverallRisk(65, false, 0);
      expect(risk).toBe(SurvivalRisk.MEDIUM);
    });

    it("should classify HIGH risk with resilience 40-59", () => {
      const risk = classifyOverallRisk(50, false, 0);
      expect(risk).toBe(SurvivalRisk.HIGH);
    });

    it("should classify LOW risk with resilience >= 80", () => {
      const risk = classifyOverallRisk(85, false, 0);
      expect(risk).toBe(SurvivalRisk.LOW);
    });
  });

  describe("validateAssessment", () => {
    it("should validate complete assessment", () => {
      expect(validateAssessment(mockAssessment)).toBe(true);
    });

    it("should reject assessment with no factor assessments", () => {
      const invalid = { ...mockAssessment, factorAssessments: [] };
      expect(validateAssessment(invalid)).toBe(false);
    });

    it("should reject assessment with missing resilience score", () => {
      const invalid = {
        ...mockAssessment,
        resilienceAnalysis: { ...mockAssessment.resilienceAnalysis, score: null },
      };
      expect(validateAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment with missing shock analysis", () => {
      const invalid = { ...mockAssessment, shockAnalysis: undefined };
      expect(validateAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment with missing gating analysis", () => {
      const invalid = { ...mockAssessment, gatingAnalysis: null };
      expect(validateAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment with missing overall risk", () => {
      const invalid = { ...mockAssessment, overallRisk: undefined };
      expect(validateAssessment(invalid as any)).toBe(false);
    });
  });

  describe("assessmentToDTO", () => {
    it("should convert assessment to DTO with key metrics", () => {
      const dto = assessmentToDTO(mockAssessment);

      expect(dto.id).toBe(mockAssessment.id);
      expect(dto.workspaceId).toBe(mockAssessment.workspaceId);
      expect(dto.overallRisk).toBe(mockAssessment.overallRisk);
      expect(dto.resilienceScore).toBe(85);
      expect(dto.crisisState).toBe(CrisisState.HEALTHY);
      expect(dto.shockDetected).toBe(false);
      expect(dto.growthBlocked).toBe(false);
    });

    it("should include recommendations in DTO", () => {
      const dto = assessmentToDTO(mockAssessment);
      expect(dto.recommendations).toHaveLength(1);
      expect(dto.recommendations[0].action).toContain("Monitor cash");
    });

    it("should include trend in DTO", () => {
      const dto = assessmentToDTO(mockAssessment);
      expect(dto.trend).toBe("stable");
    });
  });

  describe("Assessment Constants", () => {
    it("should define minimum factors required", () => {
      expect(ASSESSMENT_REQUIREMENTS.minFactorsRequired).toBe(1);
    });

    it("should define minimum healthy percentage for growth", () => {
      expect(ASSESSMENT_REQUIREMENTS.minHealthyForGrowth).toBe(50);
    });

    it("should define critical factor threshold", () => {
      expect(ASSESSMENT_REQUIREMENTS.criticalFactorThreshold).toBe(1);
    });

    it("should define assessment recency (7 days)", () => {
      expect(ASSESSMENT_REQUIREMENTS.assessmentRecency).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe("Assessment Structure", () => {
    it("should have all required metadata fields", () => {
      expect(mockAssessment.id).toBeDefined();
      expect(mockAssessment.workspaceId).toBeDefined();
      expect(mockAssessment.status).toBeDefined();
      expect(mockAssessment.assessedAt).toBeDefined();
      expect(mockAssessment.assessedBy).toBeDefined();
    });

    it("should include all four analysis sections", () => {
      expect(mockAssessment.factorAssessments).toBeDefined();
      expect(mockAssessment.shockAnalysis).toBeDefined();
      expect(mockAssessment.resilienceAnalysis).toBeDefined();
      expect(mockAssessment.gatingAnalysis).toBeDefined();
    });

    it("should include summary counts", () => {
      expect(mockAssessment.healthySummary.count).toBe(1);
      expect(mockAssessment.warningSummary.count).toBe(0);
      expect(mockAssessment.criticalSummary.count).toBe(0);
    });

    it("should include recommendations and critical actions", () => {
      expect(mockAssessment.recommendations).toBeDefined();
      expect(mockAssessment.criticalActions).toBeDefined();
    });
  });

  describe("Assessment Status Enum", () => {
    it("should have all status values", () => {
      expect(AssessmentStatus.PENDING).toBe("PENDING");
      expect(AssessmentStatus.IN_PROGRESS).toBe("IN_PROGRESS");
      expect(AssessmentStatus.COMPLETE).toBe("COMPLETE");
      expect(AssessmentStatus.PARTIAL).toBe("PARTIAL");
      expect(AssessmentStatus.FAILED).toBe("FAILED");
    });
  });

  describe("Risk Classification", () => {
    it("should have all risk levels", () => {
      expect(SurvivalRisk.CRITICAL).toBe("CRITICAL");
      expect(SurvivalRisk.HIGH).toBe("HIGH");
      expect(SurvivalRisk.MEDIUM).toBe("MEDIUM");
      expect(SurvivalRisk.LOW).toBe("LOW");
    });
  });
});
