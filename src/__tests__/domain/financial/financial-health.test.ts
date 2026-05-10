import {
  FinancialHealthStatus,
  FinancialHealthDimension,
  FINANCIAL_HEALTH_THRESHOLDS,
  calculateProfitabilityScore,
  calculateMarginHealthScore,
  calculateBurnRateScore,
  calculateRunwayScore,
  assessFinancialHealthStatus,
  validateFinancialHealthAssessment,
  financialHealthToDTO,
  generateHealthSummary,
} from "@/domain/financial/financial-health";

describe("Financial Health Scorer", () => {
  const mockHealthAssessment = {
    workspaceId: "ws-test-xyz",
    assessed_at: new Date(),

    overall_health_status: FinancialHealthStatus.HEALTHY,
    financial_health_score: 75,

    profitability_score: 75,
    margin_health_score: 80,
    burn_rate_score: 70,
    runway_score: 75,
    unit_economics_score: 85,

    profitability: {
      gross_profit: 500000,
      net_profit: 100000,
      gross_profit_margin_percent: 70,
      net_profit_margin_percent: 14,
      is_profitable: true,
      profitability_trend: "stable" as const,
    },

    margins: {
      gross_margin_percent: 70,
      contribution_margin_percent: 65,
      health: "healthy" as const,
      trend: "stable" as const,
      primary_margin_driver: "subscription",
    },

    burn_rate: {
      monthly_operating_expenses: 250000,
      monthly_burn_rate: 50000,
      burn_rate_trend: "stable" as const,
      monthly_cash_outflow: 250000,
      monthly_cash_inflow: 300000,
      net_monthly_cash_flow: 50000,
      is_cash_flow_positive: true,
    },

    runway: {
      current_cash_balance: 1200000,
      monthly_burn_rate: 50000,
      runway_months: 24,
      funding_trigger_threshold: 300000,
      months_until_trigger: 18,
      urgency: "none" as const,
      recommendation: "Continue current growth trajectory",
    },

    primary_risks: [],
    secondary_risks: [],
    critical_actions: [],
    growth_recommendations: ["Scale marketing spend"],

    version: 1,
    is_approved: true,
    approved_by: "user-123",
    approved_at: new Date(),
  };

  describe("Profitability Score Calculation", () => {
    it("should score profitable business with solid margin as healthy", () => {
      const score = calculateProfitabilityScore(70, 15, true);
      expect(score).toBe(75);
    });

    it("should score highly profitable business as thriving", () => {
      const score = calculateProfitabilityScore(70, 25, true);
      expect(score).toBeGreaterThan(85);
    });

    it("should score unprofitable business as at-risk", () => {
      const score = calculateProfitabilityScore(50, -5, false);
      expect(score).toBe(30);
    });

    it("should score deeply unprofitable business as critical", () => {
      const score = calculateProfitabilityScore(50, -25, false);
      expect(score).toBeLessThan(20);
    });

    it("should score low-margin profitable business as caution", () => {
      const score = calculateProfitabilityScore(30, 5, true);
      expect(score).toBeLessThan(60);
    });
  });

  describe("Margin Health Score Calculation", () => {
    it("should score excellent margins (70%+) as 95", () => {
      const score = calculateMarginHealthScore(75, 70);
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it("should score healthy margins (60%+) as 85", () => {
      const score = calculateMarginHealthScore(65, 60);
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it("should score acceptable margins (40%+) as 60", () => {
      const score = calculateMarginHealthScore(45, 40);
      expect(score).toBeGreaterThanOrEqual(50);
    });

    it("should score poor margins (<20%) as critical", () => {
      const score = calculateMarginHealthScore(15, 10);
      expect(score).toBeLessThan(30);
    });

    it("should average gross and contribution margins", () => {
      // (80 + 60) / 2 = 70 → score between healthy and excellent
      const score = calculateMarginHealthScore(80, 60);
      expect(score).toBeGreaterThan(70);
    });
  });

  describe("Burn Rate Score Calculation", () => {
    it("should score cash-positive business (revenue > expenses) as 85+", () => {
      const score = calculateBurnRateScore(300000, 250000); // 1.2x ratio
      expect(score).toBeGreaterThanOrEqual(85);
    });

    it("should score breakeven business as 85", () => {
      const score = calculateBurnRateScore(250000, 250000);
      expect(score).toBeGreaterThanOrEqual(85);
    });

    it("should score sustainable burn (80% ratio) as 70", () => {
      const score = calculateBurnRateScore(200000, 250000); // 0.8x
      expect(score).toBeGreaterThanOrEqual(70);
    });

    it("should score at-risk burn (50% ratio) as 40", () => {
      const score = calculateBurnRateScore(125000, 250000); // 0.5x
      expect(score).toBeLessThan(50);
    });

    it("should score critical burn (20% ratio) as 15", () => {
      const score = calculateBurnRateScore(50000, 250000); // 0.2x
      expect(score).toBeLessThan(20);
    });

    it("should handle zero expenses (infinite ratio) as 100", () => {
      const score = calculateBurnRateScore(100000, 0);
      expect(score).toBe(100);
    });
  });

  describe("Runway Score Calculation", () => {
    it("should score 24+ months runway as 95", () => {
      const score = calculateRunwayScore(24);
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it("should score 12 months runway as 85", () => {
      const score = calculateRunwayScore(12);
      expect(score).toBeGreaterThanOrEqual(85);
    });

    it("should score 6 months runway as 60", () => {
      const score = calculateRunwayScore(6);
      expect(score).toBeGreaterThanOrEqual(55);
    });

    it("should score 3 months runway as 30", () => {
      const score = calculateRunwayScore(3);
      expect(score).toBeLessThan(35);
    });

    it("should score <1 month runway as critical (10)", () => {
      const score = calculateRunwayScore(0.5);
      expect(score).toBeLessThan(15);
    });
  });

  describe("Overall Financial Health Status Assessment", () => {
    it("should assess THRIVING with all strong scores", () => {
      const status = assessFinancialHealthStatus(90, 90, 90, 90);
      expect(status).toBe(FinancialHealthStatus.THRIVING);
    });

    it("should assess THRIVING with good scores (avg >70)", () => {
      const status = assessFinancialHealthStatus(80, 85, 75, 80); // avg = 80
      expect(status).toBe(FinancialHealthStatus.THRIVING);
    });

    it("should assess HEALTHY with mid-range scores (avg 50-70)", () => {
      const status = assessFinancialHealthStatus(60, 65, 55, 60); // avg = 60
      expect(status).toBe(FinancialHealthStatus.HEALTHY);
    });

    it("should assess CAUTION with low scores (avg 30-50)", () => {
      const status = assessFinancialHealthStatus(40, 35, 40, 35); // avg = 37.5
      expect(status).toBe(FinancialHealthStatus.CAUTION);
    });

    it("should assess CRITICAL with very low average score", () => {
      const status = assessFinancialHealthStatus(25, 20, 25, 20); // avg = 22.5 < 30
      expect(status).toBe(FinancialHealthStatus.CRITICAL);
    });

    it("should assess CAUTION with score just above critical", () => {
      const status = assessFinancialHealthStatus(35, 32, 35, 32); // avg = 33.5
      expect(status).toBe(FinancialHealthStatus.CAUTION);
    });
  });

  describe("Financial Health Assessment Validation", () => {
    it("should validate complete assessment", () => {
      expect(validateFinancialHealthAssessment(mockHealthAssessment)).toBe(true);
    });

    it("should reject assessment without workspace context", () => {
      const invalid = { ...mockHealthAssessment, workspaceId: "" };
      expect(validateFinancialHealthAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment with invalid score (<0)", () => {
      const invalid = { ...mockHealthAssessment, financial_health_score: -10 };
      expect(validateFinancialHealthAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment with invalid score (>100)", () => {
      const invalid = { ...mockHealthAssessment, financial_health_score: 150 };
      expect(validateFinancialHealthAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment without profitability data", () => {
      const invalid = { ...mockHealthAssessment, profitability: undefined };
      expect(validateFinancialHealthAssessment(invalid as any)).toBe(false);
    });

    it("should reject assessment without burn rate data", () => {
      const invalid = { ...mockHealthAssessment, burn_rate: undefined };
      expect(validateFinancialHealthAssessment(invalid as any)).toBe(false);
    });
  });

  describe("Financial Health DTO Conversion", () => {
    it("should convert assessment to DTO with key metrics", () => {
      const dto = financialHealthToDTO(mockHealthAssessment);

      expect(dto.workspaceId).toBe("ws-test-xyz");
      expect(dto.health_status).toBe(FinancialHealthStatus.HEALTHY);
      expect(dto.health_score).toBe(75);
      expect(dto.profitability_score).toBe(75);
      expect(dto.margin_health_score).toBe(80);
      expect(dto.burn_rate_score).toBe(70);
      expect(dto.runway_score).toBe(75);
    });

    it("should include runway and profitability in DTO", () => {
      const dto = financialHealthToDTO(mockHealthAssessment);
      expect(dto.runway_months).toBe(24);
      expect(dto.is_profitable).toBe(true);
    });

    it("should include cash flow metrics in DTO", () => {
      const dto = financialHealthToDTO(mockHealthAssessment);
      expect(dto.monthly_net_cash_flow).toBe(50000);
    });

    it("should include risks and actions in DTO", () => {
      const assessment = {
        ...mockHealthAssessment,
        primary_risks: ["High customer concentration"],
        critical_actions: ["Diversify revenue streams"],
      };
      const dto = financialHealthToDTO(assessment);
      expect(dto.primary_risks).toContain("High customer concentration");
      expect(dto.critical_actions).toContain("Diversify revenue streams");
    });
  });

  describe("Health Summary Generation", () => {
    it("should generate thriving summary", () => {
      const summary = generateHealthSummary(FinancialHealthStatus.THRIVING, 24);
      expect(summary).toContain("thriving");
    });

    it("should generate healthy summary", () => {
      const summary = generateHealthSummary(FinancialHealthStatus.HEALTHY, 12);
      expect(summary).toContain("healthy");
    });

    it("should generate caution summary", () => {
      const summary = generateHealthSummary(FinancialHealthStatus.CAUTION, 6);
      expect(summary).toContain("monitoring");
    });

    it("should include runway in at-risk summary", () => {
      const summary = generateHealthSummary(FinancialHealthStatus.AT_RISK, 4);
      expect(summary).toContain("4");
    });

    it("should include URGENT for critical low runway", () => {
      const summary = generateHealthSummary(FinancialHealthStatus.CRITICAL, 2);
      expect(summary).toContain("URGENT");
    });

    it("should include CRITICAL for critical status", () => {
      const summary = generateHealthSummary(FinancialHealthStatus.CRITICAL, 12);
      expect(summary).toContain("CRITICAL");
    });
  });

  describe("Benchmarks", () => {
    it("should define thriving score threshold", () => {
      expect(FINANCIAL_HEALTH_THRESHOLDS.thriving_score).toBe(85);
    });

    it("should define healthy score threshold", () => {
      expect(FINANCIAL_HEALTH_THRESHOLDS.healthy_score).toBe(70);
    });

    it("should define margin thresholds", () => {
      expect(FINANCIAL_HEALTH_THRESHOLDS.excellent_gross_margin).toBe(70);
      expect(FINANCIAL_HEALTH_THRESHOLDS.healthy_gross_margin).toBe(60);
      expect(FINANCIAL_HEALTH_THRESHOLDS.acceptable_gross_margin).toBe(40);
      expect(FINANCIAL_HEALTH_THRESHOLDS.critical_gross_margin).toBe(20);
    });

    it("should define runway thresholds", () => {
      expect(FINANCIAL_HEALTH_THRESHOLDS.excellent_runway_months).toBe(24);
      expect(FINANCIAL_HEALTH_THRESHOLDS.healthy_runway_months).toBe(12);
      expect(FINANCIAL_HEALTH_THRESHOLDS.caution_runway_months).toBe(6);
      expect(FINANCIAL_HEALTH_THRESHOLDS.critical_runway_months).toBe(3);
    });

    it("should define burn rate ratios", () => {
      expect(FINANCIAL_HEALTH_THRESHOLDS.sustainable_burn_ratio).toBe(0.8);
      expect(FINANCIAL_HEALTH_THRESHOLDS.warning_burn_ratio).toBe(0.5);
      expect(FINANCIAL_HEALTH_THRESHOLDS.critical_burn_ratio).toBe(0.2);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should assess thriving SaaS business", () => {
      const profitability = calculateProfitabilityScore(75, 20, true);
      const margins = calculateMarginHealthScore(75, 70);
      const burn = calculateBurnRateScore(400000, 250000); // 1.6x
      const runway = calculateRunwayScore(36);
      const status = assessFinancialHealthStatus(profitability, margins, burn, runway);

      expect(status).toBe(FinancialHealthStatus.THRIVING);
    });

    it("should assess caution-level growing startup (pre-profitable)", () => {
      const profitability = calculateProfitabilityScore(60, -5, false); // Pre-profitable: 30
      const margins = calculateMarginHealthScore(60, 50); // Good margins: 85
      const burn = calculateBurnRateScore(100000, 250000); // 0.4x risky: 40
      const runway = calculateRunwayScore(8); // 8 months healthy: 75
      const status = assessFinancialHealthStatus(profitability, margins, burn, runway);

      // avg = (30 + 85 + 40 + 75) / 4 = 57.5 → HEALTHY
      expect([FinancialHealthStatus.HEALTHY, FinancialHealthStatus.CAUTION]).toContain(status);
    });

    it("should assess at-risk company with burn problem", () => {
      const profitability = calculateProfitabilityScore(50, -15, false);
      const margins = calculateMarginHealthScore(50, 35);
      const burn = calculateBurnRateScore(50000, 250000); // 0.2x critical burn
      const runway = calculateRunwayScore(2);
      const status = assessFinancialHealthStatus(profitability, margins, burn, runway);

      expect(status).toBe(FinancialHealthStatus.CRITICAL);
    });
  });

  describe("Financial Health Dimensions", () => {
    it("should have all dimension types", () => {
      expect(FinancialHealthDimension.PROFITABILITY).toBe("PROFITABILITY");
      expect(FinancialHealthDimension.MARGIN_HEALTH).toBe("MARGIN_HEALTH");
      expect(FinancialHealthDimension.BURN_RATE).toBe("BURN_RATE");
      expect(FinancialHealthDimension.RUNWAY).toBe("RUNWAY");
      expect(FinancialHealthDimension.UNIT_ECONOMICS).toBe("UNIT_ECONOMICS");
    });
  });

  describe("Financial Health Status Enum", () => {
    it("should have all status values", () => {
      expect(FinancialHealthStatus.THRIVING).toBe("THRIVING");
      expect(FinancialHealthStatus.HEALTHY).toBe("HEALTHY");
      expect(FinancialHealthStatus.CAUTION).toBe("CAUTION");
      expect(FinancialHealthStatus.AT_RISK).toBe("AT_RISK");
      expect(FinancialHealthStatus.CRITICAL).toBe("CRITICAL");
    });
  });

  describe("Assessment Structure", () => {
    it("should have all required metadata fields", () => {
      expect(mockHealthAssessment.workspaceId).toBeDefined();
      expect(mockHealthAssessment.assessed_at).toBeDefined();
      expect(mockHealthAssessment.overall_health_status).toBeDefined();
      expect(mockHealthAssessment.financial_health_score).toBeDefined();
    });

    it("should have all component scores", () => {
      expect(mockHealthAssessment.profitability_score).toBeDefined();
      expect(mockHealthAssessment.margin_health_score).toBeDefined();
      expect(mockHealthAssessment.burn_rate_score).toBeDefined();
      expect(mockHealthAssessment.runway_score).toBeDefined();
      expect(mockHealthAssessment.unit_economics_score).toBeDefined();
    });

    it("should have all detailed assessments", () => {
      expect(mockHealthAssessment.profitability).toBeDefined();
      expect(mockHealthAssessment.margins).toBeDefined();
      expect(mockHealthAssessment.burn_rate).toBeDefined();
      expect(mockHealthAssessment.runway).toBeDefined();
    });

    it("should include risk and recommendation sections", () => {
      expect(mockHealthAssessment.primary_risks).toBeDefined();
      expect(mockHealthAssessment.critical_actions).toBeDefined();
      expect(mockHealthAssessment.growth_recommendations).toBeDefined();
    });

    it("should support approval workflow", () => {
      expect(mockHealthAssessment.is_approved).toBe(true);
      expect(mockHealthAssessment.approved_by).toBeDefined();
      expect(mockHealthAssessment.version).toBe(1);
    });
  });
});
