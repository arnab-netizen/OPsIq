import { describe, it, expect } from "vitest";
import {
  FinancialImpactSchema,
  ROIResultSchema,
  BusinessValueSchema,
  ImpactMultiplierSchema,
  BusinessImpactAssessmentSchema,
  BatchImpactResultSchema,
  calculateROI,
  calculateBusinessValue,
  calculateImpactMultipliers,
  assessBusinessImpact,
  assessBatchImpact,
  generateMockBusinessImpactAssessment,
  type FinancialImpact,
  type ROIResult,
  type BusinessValue,
  type ImpactMultiplier,
  type BusinessImpactAssessment,
} from "@/domain/business-impact/business-impact-engine";

describe("ADDENDUM F: Business Impact Engine", () => {
  describe("ROI Calculation", () => {
    it("should calculate ROI for profitable investment", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 150000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      expect(result.roiPercent).toBe(50);
      expect(result.roiRatio).toBe(1.5);
      expect(result.valueCategoryRating).toBe("high");
      expect(result.paybackMonths).toBeGreaterThan(0);
    });

    it("should calculate zero ROI for break-even investment", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 100000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      expect(result.roiPercent).toBe(0);
      expect(result.valueCategoryRating).toBe("low");
      expect(result.paybackMonths).toBeNull();
    });

    it("should calculate negative ROI for losing investment", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 50000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      expect(result.roiPercent).toBe(-50);
      expect(result.valueCategoryRating).toBe("negative");
      expect(result.paybackMonths).toBeNull();
    });

    it("should apply risk adjustment to ROI", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 150000,
        timeToValue: 12,
        riskAdjustmentFactor: 0.8,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      expect(result.riskAdjustedReturn).toBe(40); // 50 * 0.8
      expect(result.riskAdjustedReturn).toBeLessThan(result.roiPercent);
    });

    it("should categorize exceptional ROI (>50%)", () => {
      const impact: FinancialImpact = {
        initialInvestment: 50000,
        expectedBenefit: 150000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      expect(result.roiPercent).toBe(200);
      expect(result.valueCategoryRating).toBe("exceptional");
    });

    it("should calculate payback period correctly", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 150000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      expect(result.paybackMonths).toBeDefined();
      expect(result.paybackMonths).toBeGreaterThan(0);
      expect(result.paybackMonths).toBeLessThanOrEqual(24); // Spread over 12 months means 24 month payback
    });

    it("should validate ROI result schema", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 150000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const result = calculateROI(impact);
      const validated = ROIResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });
  });

  describe("Business Value Calculation", () => {
    it("should calculate critical value for high scores", () => {
      const result = calculateBusinessValue({
        strategicAlignment: 0.9,
        operationalExcellence: 0.9,
        customerValue: 0.85,
        riskMitigation: 0.9,
        timelinessScore: 0.8,
        scalabilityScore: 0.85,
      });

      expect(result.overallScore).toBeGreaterThanOrEqual(0.8);
      expect(result.valueRating).toBe("critical");
    });

    it("should calculate high value for moderate scores", () => {
      const result = calculateBusinessValue({
        strategicAlignment: 0.7,
        operationalExcellence: 0.7,
        customerValue: 0.65,
        riskMitigation: 0.7,
      });

      expect(result.overallScore).toBeGreaterThanOrEqual(0.6);
      expect(result.valueRating).toBe("high");
    });

    it("should calculate low value for poor scores", () => {
      const result = calculateBusinessValue({
        strategicAlignment: 0.2,
        operationalExcellence: 0.3,
        customerValue: 0.25,
        riskMitigation: 0.3,
      });

      expect(result.overallScore).toBeLessThan(0.4);
      expect(result.valueRating).toBe("low");
    });

    it("should use default values for missing factors", () => {
      const result = calculateBusinessValue({
        strategicAlignment: 0.5,
        operationalExcellence: 0.5,
        customerValue: 0.5,
        riskMitigation: 0.5,
      });

      expect(result.timelinessScore).toBe(0.5);
      expect(result.scalabilityScore).toBe(0.5);
    });

    it("should respect weight distribution", () => {
      const result = calculateBusinessValue({
        strategicAlignment: 1.0,
        operationalExcellence: 0.0,
        customerValue: 0.0,
        riskMitigation: 0.0,
        timelinessScore: 0.0,
        scalabilityScore: 0.0,
      });

      expect(result.overallScore).toBe(0.25); // Only strategic alignment at 25% weight
    });

    it("should validate business value schema", () => {
      const result = calculateBusinessValue({
        strategicAlignment: 0.7,
        operationalExcellence: 0.7,
        customerValue: 0.65,
        riskMitigation: 0.7,
      });

      const businessValue: BusinessValue = {
        recordId: "rec_1",
        ...result,
      };

      const validated = BusinessValueSchema.safeParse(businessValue);
      expect(validated.success).toBe(true);
    });
  });

  describe("Impact Multiplier Calculation", () => {
    it("should calculate multipliers for global market", () => {
      const multipliers = calculateImpactMultipliers({
        implementationSuccessProbability: 0.8,
        adoptionRate: 0.7,
        marketSize: "global",
        hasCompetitiveAdvantage: true,
        sustainabilityYears: 3,
      });

      expect(multipliers.marketMultiplier).toBe(2.5);
      expect(multipliers.competitiveAdvantageMultiplier).toBe(2.0);
      expect(multipliers.sustainabilityFactor).toBeGreaterThan(0);
    });

    it("should calculate multipliers for regional market", () => {
      const multipliers = calculateImpactMultipliers({
        implementationSuccessProbability: 0.8,
        adoptionRate: 0.7,
        marketSize: "regional",
        hasCompetitiveAdvantage: false,
      });

      expect(multipliers.marketMultiplier).toBe(1.5);
      expect(multipliers.competitiveAdvantageMultiplier).toBe(1.0);
    });

    it("should clamp probability values between 0 and 1", () => {
      const multipliers = calculateImpactMultipliers({
        implementationSuccessProbability: 1.5,
        adoptionRate: -0.2,
        marketSize: "local",
      });

      expect(multipliers.implementationSuccessProbability).toBeLessThanOrEqual(1);
      expect(multipliers.adoptionRate).toBeGreaterThanOrEqual(0);
    });

    it("should validate multiplier schema", () => {
      const multipliers = calculateImpactMultipliers({
        implementationSuccessProbability: 0.8,
        adoptionRate: 0.7,
      });

      const validated = ImpactMultiplierSchema.safeParse(multipliers);
      expect(validated.success).toBe(true);
    });
  });

  describe("Business Impact Assessment", () => {
    it("should assess comprehensive business impact", () => {
      const assessment = assessBusinessImpact({
        recordId: "rec_1",
        recordType: "decision",
        sourceConnector: "hubspot",
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 200000,
          timeToValue: 12,
          riskAdjustmentFactor: 0.9,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.8,
          operationalExcellence: 0.8,
          customerValue: 0.75,
          riskMitigation: 0.8,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.85,
          adoptionRate: 0.8,
          marketSize: "regional",
          hasCompetitiveAdvantage: true,
          sustainabilityYears: 3,
        },
      });

      expect(assessment.recordId).toBe("rec_1");
      expect(assessment.roi.roiPercent).toBe(100);
      expect(assessment.businessValue.valueRating).toBe("high");
      expect(assessment.adjustedROI).toBeGreaterThan(0);
      expect(assessment.confidenceScore).toBeGreaterThan(0.7);
      expect(assessment.riskLevel).toBe("low");
    });

    it("should classify critical risk for low confidence", () => {
      const assessment = assessBusinessImpact({
        recordId: "rec_1",
        recordType: "action",
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 150000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.3,
          operationalExcellence: 0.3,
          customerValue: 0.3,
          riskMitigation: 0.3,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.2,
          adoptionRate: 0.2,
        },
      });

      expect(assessment.riskLevel).toBe("critical");
      expect(assessment.confidenceScore).toBeLessThan(0.3);
    });

    it("should generate improvement recommendations", () => {
      const assessment = assessBusinessImpact({
        recordId: "rec_1",
        recordType: "recommendation",
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 110000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.5,
          operationalExcellence: 0.4,
          customerValue: 0.4,
          riskMitigation: 0.4,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.5,
          adoptionRate: 0.5,
        },
      });

      expect(assessment.recommendations.length).toBeGreaterThan(0);
      expect(assessment.recommendations[0]?.area).toBeDefined();
      expect(assessment.recommendations[0]?.recommendation).toBeDefined();
    });

    it("should validate business impact assessment schema", () => {
      const assessment = assessBusinessImpact({
        recordId: "rec_1",
        recordType: "decision",
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 200000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.7,
          operationalExcellence: 0.7,
          customerValue: 0.65,
          riskMitigation: 0.7,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.8,
          adoptionRate: 0.75,
        },
      });

      const validated = BusinessImpactAssessmentSchema.safeParse(assessment);
      expect(validated.success).toBe(true);
    });
  });

  describe("Batch Impact Analysis", () => {
    it("should analyze batch of impact assessments", () => {
      const records = [
        {
          recordId: "rec_1",
          recordType: "decision" as const,
          financialImpact: {
            initialInvestment: 100000,
            expectedBenefit: 200000,
            timeToValue: 12,
            riskAdjustmentFactor: 1.0,
            discountRate: 0.1,
          },
          businessValueFactors: {
            strategicAlignment: 0.8,
            operationalExcellence: 0.8,
            customerValue: 0.75,
            riskMitigation: 0.8,
          },
          multiplierFactors: {
            implementationSuccessProbability: 0.85,
            adoptionRate: 0.8,
          },
        },
        {
          recordId: "rec_2",
          recordType: "action" as const,
          financialImpact: {
            initialInvestment: 50000,
            expectedBenefit: 100000,
            timeToValue: 6,
            riskAdjustmentFactor: 0.9,
            discountRate: 0.1,
          },
          businessValueFactors: {
            strategicAlignment: 0.6,
            operationalExcellence: 0.7,
            customerValue: 0.65,
            riskMitigation: 0.7,
          },
          multiplierFactors: {
            implementationSuccessProbability: 0.75,
            adoptionRate: 0.7,
          },
        },
      ];

      const result = assessBatchImpact(records);
      expect(result.totalRecords).toBe(2);
      expect(result.analyzedRecords).toBe(2);
      expect(result.averageROI).toBeGreaterThan(0);
      expect(result.totalExpectedValue).toBeGreaterThan(0);
    });

    it("should calculate ROI distribution correctly", () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        recordId: `rec_${i + 1}`,
        recordType: "decision" as const,
        financialImpact: {
          initialInvestment: 50000 + i * 5000,
          expectedBenefit: 100000 + i * 10000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.5 + Math.random() * 0.5,
          operationalExcellence: 0.5 + Math.random() * 0.5,
          customerValue: 0.5 + Math.random() * 0.5,
          riskMitigation: 0.5 + Math.random() * 0.5,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.7,
          adoptionRate: 0.7,
        },
      }));

      const result = assessBatchImpact(records);
      expect(
        result.roiDistribution.exceptional +
          result.roiDistribution.high +
          result.roiDistribution.moderate +
          result.roiDistribution.low +
          result.roiDistribution.negative,
      ).toBe(10);
    });

    it("should identify critical and high risk records", () => {
      const records = [
        {
          recordId: "rec_critical",
          recordType: "decision" as const,
          financialImpact: {
            initialInvestment: 100000,
            expectedBenefit: 105000,
            timeToValue: 12,
            riskAdjustmentFactor: 1.0,
            discountRate: 0.1,
          },
          businessValueFactors: {
            strategicAlignment: 0.2,
            operationalExcellence: 0.2,
            customerValue: 0.2,
            riskMitigation: 0.2,
          },
          multiplierFactors: {
            implementationSuccessProbability: 0.2,
            adoptionRate: 0.2,
          },
        },
      ];

      const result = assessBatchImpact(records);
      expect(result.criticalRiskCount).toBeGreaterThan(0);
    });

    it("should calculate payback period average", () => {
      const records = Array.from({ length: 5 }, (_, i) => ({
        recordId: `rec_${i + 1}`,
        recordType: "decision" as const,
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 150000 + i * 50000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.7,
          operationalExcellence: 0.7,
          customerValue: 0.7,
          riskMitigation: 0.7,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.8,
          adoptionRate: 0.8,
        },
      }));

      const result = assessBatchImpact(records);
      expect(result.paybackPeriodAverage).toBeGreaterThan(0);
    });

    it("should validate batch impact result schema", () => {
      const records = [
        {
          recordId: "rec_1",
          recordType: "decision" as const,
          financialImpact: {
            initialInvestment: 100000,
            expectedBenefit: 200000,
            timeToValue: 12,
            riskAdjustmentFactor: 1.0,
            discountRate: 0.1,
          },
          businessValueFactors: {
            strategicAlignment: 0.7,
            operationalExcellence: 0.7,
            customerValue: 0.65,
            riskMitigation: 0.7,
          },
          multiplierFactors: {
            implementationSuccessProbability: 0.8,
            adoptionRate: 0.75,
          },
        },
      ];

      const result = assessBatchImpact(records);
      const validated = BatchImpactResultSchema.safeParse(result);
      expect(validated.success).toBe(true);
    });
  });

  describe("Mock Data Generation", () => {
    it("should generate mock assessments", () => {
      const assessments = generateMockBusinessImpactAssessment(10);
      expect(assessments).toHaveLength(10);
      expect(assessments[0]).toHaveProperty("recordId");
      expect(assessments[0]).toHaveProperty("roi");
      expect(assessments[0]).toHaveProperty("businessValue");
    });

    it("should validate all generated mock assessments", () => {
      const assessments = generateMockBusinessImpactAssessment(5);

      for (const assessment of assessments) {
        const validated = BusinessImpactAssessmentSchema.safeParse(assessment);
        expect(validated.success).toBe(true);
      }
    });

    it("should generate varied record types", () => {
      const assessments = generateMockBusinessImpactAssessment(20);
      const recordTypes = new Set(assessments.map((a) => a.recordType));

      expect(recordTypes.size).toBeGreaterThan(1);
    });

    it("should generate realistic ROI values", () => {
      const assessments = generateMockBusinessImpactAssessment(20);

      for (const assessment of assessments) {
        expect(assessment.roi.roiPercent).toBeDefined();
        expect(assessment.roi.initialInvestment).toBeGreaterThan(0);
        expect(assessment.roi.expectedBenefit).toBeDefined();
      }
    });
  });

  describe("Comprehensive Business Impact Coverage", () => {
    it("should cover all assessment types", () => {
      const types: Array<"decision" | "action" | "recommendation" | "experiment"> = [
        "decision",
        "action",
        "recommendation",
        "experiment",
      ];

      for (const type of types) {
        const assessment = assessBusinessImpact({
          recordId: `rec_${type}`,
          recordType: type,
          financialImpact: {
            initialInvestment: 100000,
            expectedBenefit: 200000,
            timeToValue: 12,
            riskAdjustmentFactor: 1.0,
            discountRate: 0.1,
          },
          businessValueFactors: {
            strategicAlignment: 0.7,
            operationalExcellence: 0.7,
            customerValue: 0.65,
            riskMitigation: 0.7,
          },
          multiplierFactors: {
            implementationSuccessProbability: 0.8,
            adoptionRate: 0.75,
          },
        });

        expect(assessment.recordType).toBe(type);
      }
    });

    it("should provide complete ROI calculation workflow", () => {
      const impact: FinancialImpact = {
        initialInvestment: 100000,
        expectedBenefit: 200000,
        timeToValue: 12,
        riskAdjustmentFactor: 1.0,
        discountRate: 0.1,
      };

      const roi = calculateROI(impact);
      expect(roi).toBeDefined();
      expect(roi.roiPercent).toBe(100);
      expect(roi.paybackMonths).toBeDefined();
      expect(roi.npv).toBeDefined();
      expect(roi.irr).toBeDefined();
    });

    it("should calculate risk-adjusted returns accurately", () => {
      const assessment1 = assessBusinessImpact({
        recordId: "rec_low_risk",
        recordType: "decision",
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 200000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.9,
          operationalExcellence: 0.9,
          customerValue: 0.85,
          riskMitigation: 0.9,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.95,
          adoptionRate: 0.95,
        },
      });

      const assessment2 = assessBusinessImpact({
        recordId: "rec_high_risk",
        recordType: "decision",
        financialImpact: {
          initialInvestment: 100000,
          expectedBenefit: 200000,
          timeToValue: 12,
          riskAdjustmentFactor: 1.0,
          discountRate: 0.1,
        },
        businessValueFactors: {
          strategicAlignment: 0.3,
          operationalExcellence: 0.3,
          customerValue: 0.25,
          riskMitigation: 0.3,
        },
        multiplierFactors: {
          implementationSuccessProbability: 0.4,
          adoptionRate: 0.4,
        },
      });

      expect(assessment1.adjustedROI).toBeGreaterThan(assessment2.adjustedROI);
      expect(assessment1.riskLevel).toBe("low");
      expect(assessment2.riskLevel).toMatch(/critical|high|medium/);
    });
  });
});
