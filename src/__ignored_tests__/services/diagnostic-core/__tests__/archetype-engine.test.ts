import { ArchetypeEngine } from "../archetype-engine";
import { v4 as uuidv4 } from "uuid";

describe("ArchetypeEngine (STRICT CLASSIFICATION MODE)", () => {
  const engine = new ArchetypeEngine();
  const engagementId = uuidv4();
  const workspaceId = uuidv4();

  describe("Data Sufficiency Gate (FAIL CLOSED)", () => {
    const validIndicators = {
      revenueTrend: 25,
      profitMargin: 15,
      cashFlow: 500000,
      debtToEquity: 0.5,
      marketShare: 5,
      customerAcquisitionCost: 500,
      customerLifetimeValue: 5000,
      burnRate: 100000,
      runwayMonths: 24,
    };

    it("should FAIL on missing revenue trend", async () => {
      const indicators = { ...validIndicators };
      delete indicators.revenueTrend;

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        indicators as any
      );

      expect(result).toBeNull();
    });

    it("should FAIL on missing profit margin", async () => {
      const indicators = { ...validIndicators };
      delete indicators.profitMargin;

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        indicators as any
      );

      expect(result).toBeNull();
    });

    it("should FAIL on missing cash flow", async () => {
      const indicators = { ...validIndicators };
      delete indicators.cashFlow;

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        indicators as any
      );

      expect(result).toBeNull();
    });

    it("should FAIL on missing debt to equity", async () => {
      const indicators = { ...validIndicators };
      delete indicators.debtToEquity;

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        indicators as any
      );

      expect(result).toBeNull();
    });

    it("should PASS with all required indicators", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
    });
  });

  describe("Archetype Classification (STRICT)", () => {
    it("should classify High-Growth SaaS", async () => {
      const highGrowthIndicators = {
        revenueTrend: 120, // Extreme growth
        profitMargin: -25, // Deep negative (early SaaS)
        cashFlow: -800000, // Heavy burn
        debtToEquity: 0.05, // Very low debt
        marketShare: 1,
        customerAcquisitionCost: 2000,
        customerLifetimeValue: 25000,
        burnRate: 500000,
        runwayMonths: 15,
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        highGrowthIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        // Should be one of the high-risk, high-growth archetypes
        expect(
          result.selectedArchetype.riskProfile === "HIGH" ||
            result.selectedArchetype.riskProfile === "MEDIUM"
        ).toBe(true);
        expect(
          result.selectedArchetype.growthMode === "scale" ||
            result.selectedArchetype.growthMode === "grow"
        ).toBe(true);
      }
    });

    it("should classify Turnaround Play", async () => {
      const turnaroundIndicators = {
        revenueTrend: -25, // Declining revenue
        profitMargin: -30, // Deep losses
        cashFlow: -800000, // Significant burn
        debtToEquity: 2.0, // High debt
        marketShare: 1,
        customerAcquisitionCost: 2000,
        customerLifetimeValue: 3000,
        burnRate: 400000,
        runwayMonths: 4, // Critical runway
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        turnaroundIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.riskProfile).toBe("CRITICAL");
        expect(result.selectedArchetype.growthMode).toBe("survival");
      }
    });

    it("should classify Stable Mature Business", async () => {
      const matureIndicators = {
        revenueTrend: 3, // Low growth
        profitMargin: 25, // Solid profits
        cashFlow: 1000000, // Strong positive
        debtToEquity: 0.3, // Low debt
        marketShare: 15,
        customerAcquisitionCost: 100,
        customerLifetimeValue: 10000,
        burnRate: -50000, // Generating cash
        runwayMonths: 240, // 20 years runway (theoretical)
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        matureIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.riskProfile).toBe("LOW");
        expect(result.selectedArchetype.growthMode).toBe("stabilize");
      }
    });

    it("should classify Growth-Stage Company", async () => {
      const growthIndicators = {
        revenueTrend: 35, // Solid growth
        profitMargin: 5, // Near breakeven
        cashFlow: 100000, // Positive
        debtToEquity: 0.6, // Moderate debt
        marketShare: 8,
        customerAcquisitionCost: 750,
        customerLifetimeValue: 8000,
        burnRate: 150000,
        runwayMonths: 16,
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        growthIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.riskProfile).toBe("MEDIUM");
        expect(result.selectedArchetype.growthMode).toBe("grow");
      }
    });
  });

  describe("Decision Constraints (MANDATORY)", () => {
    const highGrowthIndicators = {
      revenueTrend: 80,
      profitMargin: -10,
      cashFlow: -500000,
      debtToEquity: 0.1,
      marketShare: 2,
      customerAcquisitionCost: 1000,
      customerLifetimeValue: 15000,
      burnRate: 300000,
      runwayMonths: 18,
    };

    it("should enforce allowed strategy types", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        highGrowthIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const constraints = result.selectedArchetype.decisionConstraints;
        expect(constraints.allowedStrategyTypes.length).toBeGreaterThan(0);
        expect(constraints.allowedStrategyTypes).toContain("revenue_growth");
      }
    });

    it("should forbid incompatible strategy types", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        highGrowthIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const constraints = result.selectedArchetype.decisionConstraints;
        expect(constraints.forbiddenStrategyTypes.length).toBeGreaterThan(0);
        expect(constraints.forbiddenStrategyTypes).toContain("debt_reduction");
      }
    });

    it("should set maximum investment horizon", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        highGrowthIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const constraints = result.selectedArchetype.decisionConstraints;
        expect(constraints.maximumInvestmentHorizonMonths).toBeGreaterThan(0);
        expect(constraints.maximumInvestmentHorizonMonths).toBeLessThanOrEqual(
          60
        );
      }
    });

    it("should set maximum execution complexity", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        highGrowthIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const constraints = result.selectedArchetype.decisionConstraints;
        const validComplexity = [
          "simple",
          "moderate",
          "complex",
          "expert",
        ];
        expect(validComplexity).toContain(
          constraints.maximumExecutionComplexity
        );
      }
    });
  });

  describe("Confidence Scoring (STRICT)", () => {
    const validIndicators = {
      revenueTrend: 25,
      profitMargin: 15,
      cashFlow: 500000,
      debtToEquity: 0.5,
      marketShare: 5,
      customerAcquisitionCost: 500,
      customerLifetimeValue: 5000,
      burnRate: 100000,
      runwayMonths: 24,
    };

    it("should score archetype confidence 0-1", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.confidenceScore).toBeGreaterThan(0);
        expect(result.selectedArchetype.confidenceScore).toBeLessThanOrEqual(1);
      }
    });

    it("should select best-scoring archetype", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const allArchetypes = [
          result.selectedArchetype,
          ...result.alternativeArchetypes,
        ];
        const scores = allArchetypes.map((a) => a.confidenceScore);
        const maxScore = Math.max(...scores);
        expect(result.selectedArchetype.confidenceScore).toEqual(maxScore);
      }
    });

    it("should include confidence reason", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.confidenceReason).toBeDefined();
        expect(result.selectedArchetype.confidenceReason.length).toBeGreaterThan(
          0
        );
        expect(result.selectedArchetype.confidenceReason).toContain(
          result.selectedArchetype.growthMode
        );
      }
    });
  });

  describe("Archetype Ranking (STRICT)", () => {
    const indicators = {
      revenueTrend: 20,
      profitMargin: 12,
      cashFlow: 600000,
      debtToEquity: 0.4,
      marketShare: 6,
      customerAcquisitionCost: 400,
      customerLifetimeValue: 6000,
      burnRate: 80000,
      runwayMonths: 36,
    };

    it("should generate minimum 2 competing archetypes", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        indicators
      );

      expect(result).not.toBeNull();
      if (result) {
        const totalArchetypes =
          1 + result.alternativeArchetypes.length;
        expect(totalArchetypes).toBeGreaterThanOrEqual(2);
      }
    });

    it("should rank alternatives by confidence", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        indicators
      );

      expect(result).not.toBeNull();
      if (result) {
        if (result.alternativeArchetypes.length > 0) {
          const first = result.selectedArchetype.confidenceScore;
          const second = result.alternativeArchetypes[0].confidenceScore;
          expect(first).toBeGreaterThanOrEqual(second);
        }
      }
    });
  });

  describe("Risk Profile Alignment", () => {
    it("should identify CRITICAL risk in turnaround scenario", async () => {
      const criticalIndicators = {
        revenueTrend: -30,
        profitMargin: -40,
        cashFlow: -1000000,
        debtToEquity: 3.0,
        marketShare: 0.5,
        customerAcquisitionCost: 3000,
        customerLifetimeValue: 2000,
        burnRate: 500000,
        runwayMonths: 3,
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        criticalIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.riskProfile).toBe("CRITICAL");
      }
    });

    it("should identify LOW risk in stable scenario", async () => {
      const lowRiskIndicators = {
        revenueTrend: 2,
        profitMargin: 30,
        cashFlow: 2000000,
        debtToEquity: 0.2,
        marketShare: 20,
        customerAcquisitionCost: 50,
        customerLifetimeValue: 20000,
        burnRate: -100000,
        runwayMonths: 500,
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        lowRiskIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.riskProfile).toBe("LOW");
      }
    });
  });

  describe("Capital Sensitivity Alignment", () => {
    it("should identify HIGH capital sensitivity for SaaS-like LTV:CAC", async () => {
      const highCapitalIndicators = {
        revenueTrend: 60,
        profitMargin: -5,
        cashFlow: -300000,
        debtToEquity: 0.15,
        marketShare: 3,
        customerAcquisitionCost: 1500,
        customerLifetimeValue: 20000,
        burnRate: 250000,
        runwayMonths: 20,
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        highCapitalIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.capitalSensitivity).toBe("HIGH");
      }
    });

    it("should identify LOW capital sensitivity for efficient businesses", async () => {
      const lowCapitalIndicators = {
        revenueTrend: 5,
        profitMargin: 35,
        cashFlow: 1500000,
        debtToEquity: 0.1,
        marketShare: 25,
        customerAcquisitionCost: 50,
        customerLifetimeValue: 50000,
        burnRate: -50000,
        runwayMonths: 600,
      };

      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        lowCapitalIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.selectedArchetype.capitalSensitivity).toBe("LOW");
      }
    });
  });

  describe("Uncertainty Exposure (MANDATORY)", () => {
    const validIndicators = {
      revenueTrend: 25,
      profitMargin: 15,
      cashFlow: 500000,
      debtToEquity: 0.5,
      marketShare: 5,
      customerAcquisitionCost: 500,
      customerLifetimeValue: 5000,
      burnRate: 100000,
      runwayMonths: 24,
    };

    it("should expose uncertainty with risk assessment", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.riskOfMisclassification).toBeDefined();
        expect(result.uncertaintyExposure.missingDataList).toBeDefined();
        expect(result.uncertaintyExposure.assumptionsList).toBeDefined();
      }
    });

    it("should include alternative archetypes in uncertainty message", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        if (result.alternativeArchetypes.length > 0) {
          expect(result.uncertaintyExposure.riskOfMisclassification).toContain(
            "Alternative archetypes"
          );
        }
      }
    });

    it("should list assumptions explicitly", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.uncertaintyExposure.assumptionsList.length).toBeGreaterThan(
          0
        );
        expect(result.uncertaintyExposure.assumptionsList[0]).toBeDefined();
      }
    });
  });

  describe("Workspace Isolation", () => {
    const validIndicators = {
      revenueTrend: 25,
      profitMargin: 15,
      cashFlow: 500000,
      debtToEquity: 0.5,
      marketShare: 5,
      customerAcquisitionCost: 500,
      customerLifetimeValue: 5000,
      burnRate: 100000,
      runwayMonths: 24,
    };

    it("should preserve workspace context", async () => {
      const result = await engine.analyzeArchetype(
        engagementId,
        workspaceId,
        validIndicators
      );

      expect(result).not.toBeNull();
      if (result) {
        expect(result.workspaceId).toBe(workspaceId);
        expect(result.engagementId).toBe(engagementId);
      }
    });
  });
});
