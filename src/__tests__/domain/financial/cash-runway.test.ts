import {
  RunwayScenario,
  CASH_RUNWAY_THRESHOLDS,
  projectCashRunway,
  calculateMonthsUntilDepletion,
  getScenarioParameters,
  determineFundingTrigger,
  calculateBlendedRunway,
  validateRunwayProjection,
  cashRunwayToDTO,
} from "@/domain/financial/cash-runway";

describe("Cash Runway Modeler", () => {
  const baselineProjection = {
    workspaceId: "ws-test-xyz",
    scenario: RunwayScenario.BASE_CASE,
    current_cash_balance: 600000,
    monthly_revenue: 100000,
    monthly_expenses: 80000,
    monthly_net_cash_flow: 20000,
    projections: [] as any[],
    months_to_depletion: null,
    funding_trigger_amount: 240000, // 3 months expenses
    months_until_trigger: 99,
    recommended_funding_amount: 600000,
    funding_urgency: "none" as const,
    projection_horizon_months: 36,
    created_at: new Date(),
  };

  describe("Scenario Parameters", () => {
    it("should return best case parameters", () => {
      const params = getScenarioParameters(RunwayScenario.BEST_CASE);
      expect(params.scenario).toBe(RunwayScenario.BEST_CASE);
      expect(params.revenue_growth_monthly_percent).toBeGreaterThan(0);
      expect(params.expense_growth_monthly_percent).toBeGreaterThan(0);
      expect(params.revenue_growth_monthly_percent).toBeGreaterThan(
        params.expense_growth_monthly_percent
      );
    });

    it("should return base case parameters", () => {
      const params = getScenarioParameters(RunwayScenario.BASE_CASE);
      expect(params.scenario).toBe(RunwayScenario.BASE_CASE);
      expect(params.revenue_growth_monthly_percent).toBe(0.05);
      expect(params.expense_growth_monthly_percent).toBe(0.03);
    });

    it("should return worst case parameters", () => {
      const params = getScenarioParameters(RunwayScenario.WORST_CASE);
      expect(params.scenario).toBe(RunwayScenario.WORST_CASE);
      expect(params.revenue_growth_monthly_percent).toBeLessThan(0);
      expect(params.expense_growth_monthly_percent).toBeGreaterThan(0);
    });

    it("should return custom (zero growth) parameters", () => {
      const params = getScenarioParameters(RunwayScenario.CUSTOM);
      expect(params.revenue_growth_monthly_percent).toBe(0);
      expect(params.expense_growth_monthly_percent).toBe(0);
    });
  });

  describe("Cash Runway Projection", () => {
    it("should project positive cash flow (cash growing)", () => {
      const projections = projectCashRunway(
        100000, // Starting cash
        50000, // Revenue
        30000, // Expenses
        0.05, // 5% revenue growth
        0.02, // 2% expense growth
        12
      );

      expect(projections).toHaveLength(12);
      expect(projections[0].net_cash_flow).toBe(20000);
      expect(projections[0].cash_balance).toBe(120000);
      expect(projections[11].cash_balance).toBeGreaterThan(projections[0].cash_balance);
    });

    it("should project negative cash flow (cash declining)", () => {
      const projections = projectCashRunway(
        100000,
        20000, // Low revenue
        50000, // High expenses
        0,
        0,
        12
      );

      expect(projections[0].net_cash_flow).toBe(-30000);
      expect(projections[0].cash_balance).toBe(70000); // After month 1: 100k - 30k
      expect(projections[1].cash_balance).toBe(40000); // After month 2: 70k - 30k
      // funding_needed when cash < 3 * 50000 = 150000, so 70000 < 150000 means true
      expect(projections[0].funding_needed).toBe(true);
    });

    it("should detect when cash depletes", () => {
      const projections = projectCashRunway(
        100000,
        10000, // Low revenue
        30000, // High expenses
        0,
        0,
        12
      );

      // Should show depletion
      const depleted = projections.filter((p) => p.cash_balance <= 0);
      expect(depleted.length).toBeGreaterThan(0);
      expect(projections.length).toBeLessThan(12); // Should stop early
    });

    it("should apply growth rates to revenue and expenses", () => {
      const projections = projectCashRunway(
        1000000,
        100000,
        50000,
        0.1, // 10% revenue growth
        0.05, // 5% expense growth
        6
      );

      // Month 1: 100k revenue
      expect(projections[0].revenue).toBeCloseTo(100000, 0);
      // Month 2: 110k revenue (100k * 1.1)
      expect(projections[1].revenue).toBeCloseTo(110000, 0);
      // Month 3: 121k revenue
      expect(projections[2].revenue).toBeCloseTo(121000, 0);
    });

    it("should calculate runway remaining for each month", () => {
      const projections = projectCashRunway(600000, 100000, 80000, 0, 0, 12);

      expect(projections[0].runway_remaining_months).toBeCloseTo(7.5, 0); // 600k / 80k
      expect(projections[1].runway_remaining_months).toBeCloseTo(7.75, 0); // 620k / 80k
    });

    it("should flag funding needed when cash < 3 months burn", () => {
      const projections = projectCashRunway(
        200000,
        30000,
        70000, // 70k expenses
        0,
        0,
        12
      );

      // Will need funding when cash < 210000 (3 * 70000)
      const needsFunding = projections.filter((p) => p.funding_needed);
      expect(needsFunding.length).toBeGreaterThan(0);
    });
  });

  describe("Months Until Depletion", () => {
    it("should calculate months until zero cash (simple case)", () => {
      const months = calculateMonthsUntilDepletion(
        100000,
        10000, // Revenue
        30000, // Expenses: -20k/month
        0,
        0
      );

      expect(months).toBeCloseTo(5, 0); // 100k / 20k burn
    });

    it("should return null for sustainable businesses", () => {
      const months = calculateMonthsUntilDepletion(
        500000,
        100000, // Revenue
        80000, // Expenses: +20k/month
        0,
        0
      );

      expect(months).toBeNull();
    });

    it("should return null for growing businesses (revenue grows faster than expenses)", () => {
      const months = calculateMonthsUntilDepletion(
        100000,
        50000,
        40000,
        0.1, // 10% revenue growth
        0.02 // 2% expense growth
      );

      expect(months).toBeNull();
    });

    it("should handle worst case with declining revenue", () => {
      const months = calculateMonthsUntilDepletion(
        200000,
        30000,
        40000,
        -0.1, // -10% revenue decline
        0.05 // 5% expense growth
      );

      expect(months).toBeLessThan(12); // Should deplete within a year
    });

    it("should handle edge case: zero expenses", () => {
      const months = calculateMonthsUntilDepletion(100000, 50000, 0, 0, 0);
      expect(months).toBeNull(); // Never depletes
    });
  });

  describe("Funding Trigger Determination", () => {
    it("should identify CRITICAL trigger when <1 month runway", () => {
      const trigger = determineFundingTrigger(50000, 80000);

      expect(trigger).toBeDefined();
      expect(trigger?.trigger_name).toBe("CRITICAL");
      expect(trigger?.urgency_level).toBe("critical");
    });

    it("should identify WARNING trigger when 1-3 months runway", () => {
      const trigger = determineFundingTrigger(200000, 80000); // 2.5 months

      expect(trigger).toBeDefined();
      expect(trigger?.trigger_name).toBe("WARNING");
      expect(trigger?.urgency_level).toBe("high");
    });

    it("should identify CAUTION trigger when 3-6 months runway", () => {
      const trigger = determineFundingTrigger(400000, 80000); // 5 months

      expect(trigger).toBeDefined();
      expect(trigger?.trigger_name).toBe("CAUTION");
      expect(trigger?.urgency_level).toBe("medium");
    });

    it("should return null for healthy runway (>6 months)", () => {
      const trigger = determineFundingTrigger(600000, 80000); // 7.5 months

      expect(trigger).toBeNull();
    });

    it("should recommend appropriate funding amounts", () => {
      const trigger = determineFundingTrigger(100000, 80000);

      expect(trigger?.target_funding_amount).toBe(480000); // 6 months * 80000
    });
  });

  describe("Blended Runway Assessment", () => {
    it("should calculate median runway across scenarios", () => {
      const blended = calculateBlendedRunway(24, 12, 6);

      expect(blended.best_case_months).toBe(24);
      expect(blended.base_case_months).toBe(12);
      expect(blended.worst_case_months).toBe(6);
      expect(blended.median_runway_months).toBe(12);
    });

    it("should assess high confidence with strong runway in all scenarios", () => {
      const blended = calculateBlendedRunway(36, 30, 24);

      expect(blended.confidence).toBe("high");
      expect(blended.primary_risk).toContain("strong runway");
    });

    it("should assess low confidence with short worst-case runway", () => {
      const blended = calculateBlendedRunway(24, 12, 4);

      expect(blended.confidence).toBe("low");
      expect(blended.primary_risk).toContain("critical");
    });

    it("should assess low confidence when worst case is critical", () => {
      const blended = calculateBlendedRunway(36, 9, 2); // worst < 3 months

      expect(blended.confidence).toBe("low");
      expect(blended.primary_risk).toContain("critical");
    });

    it("should handle null scenarios (infinite runway)", () => {
      const blended = calculateBlendedRunway(null, 12, 6);

      expect(blended.median_runway_months).toBeGreaterThan(6);
      expect(blended.confidence).toBe("medium");
    });

    it("should generate appropriate recommendations", () => {
      const critical = calculateBlendedRunway(12, 6, 2);
      expect(critical.recommendation).toContain("Urgent");

      const healthy = calculateBlendedRunway(36, 30, 24);
      expect(healthy.recommendation).toContain("growth");
    });
  });

  describe("Runway Projection Validation", () => {
    it("should validate complete projection", () => {
      const validProjection = {
        ...baselineProjection,
        projections: [
          {
            month: 1,
            month_date: new Date(),
            revenue: 100000,
            operating_expenses: 80000,
            net_cash_flow: 20000,
            cumulative_cash_flow: 20000,
            cash_balance: 620000,
            burn_rate: 0,
            runway_remaining_months: 7.75,
            funding_needed: false,
          },
        ],
      };
      expect(validateRunwayProjection(validProjection)).toBe(true);
    });

    it("should reject projection without workspace", () => {
      const invalid = { ...baselineProjection, workspaceId: "" };
      expect(validateRunwayProjection(invalid as any)).toBe(false);
    });

    it("should reject projection with negative cash", () => {
      const invalid = { ...baselineProjection, current_cash_balance: -100000 };
      expect(validateRunwayProjection(invalid as any)).toBe(false);
    });

    it("should reject projection with negative revenue", () => {
      const invalid = { ...baselineProjection, monthly_revenue: -50000 };
      expect(validateRunwayProjection(invalid as any)).toBe(false);
    });

    it("should reject projection with no projections array", () => {
      const invalid = { ...baselineProjection, projections: [] };
      expect(validateRunwayProjection(invalid as any)).toBe(false);
    });
  });

  describe("Cash Runway DTO", () => {
    it("should convert projection to DTO", () => {
      const projectionWithMonths = {
        ...baselineProjection,
        months_to_depletion: 24,
        depletion_date: new Date(Date.now() + 24 * 30 * 24 * 60 * 60 * 1000),
      };

      const dto = cashRunwayToDTO(projectionWithMonths);

      expect(dto.workspaceId).toBe("ws-test-xyz");
      expect(dto.scenario).toBe(RunwayScenario.BASE_CASE);
      expect(dto.months_to_depletion).toBe(24);
      expect(dto.funding_urgency).toBe("none");
    });

    it("should include depletion date in DTO", () => {
      const depletionDate = new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000);
      const projectionWithDepletion = {
        ...baselineProjection,
        months_to_depletion: 12,
        depletion_date: depletionDate,
      };

      const dto = cashRunwayToDTO(projectionWithDepletion);
      expect(dto.depletion_date).toEqual(depletionDate);
    });

    it("should generate appropriate summary text", () => {
      const projection1 = { ...baselineProjection, months_to_depletion: null };
      const projection2 = { ...baselineProjection, months_to_depletion: 12 };

      const dto1 = cashRunwayToDTO(projection1);
      const dto2 = cashRunwayToDTO(projection2);

      expect(dto1.projection_summary).toContain("Cash positive");
      expect(dto2.projection_summary).toContain("12");
    });

    it("should include funding recommendations in DTO", () => {
      const dto = cashRunwayToDTO(baselineProjection);

      expect(dto.recommended_funding).toBe(600000);
      expect(dto.funding_trigger_months).toBe(99);
    });
  });

  describe("Thresholds", () => {
    it("should define runway thresholds", () => {
      expect(CASH_RUNWAY_THRESHOLDS.excellent_runway_months).toBe(24);
      expect(CASH_RUNWAY_THRESHOLDS.healthy_runway_months).toBe(12);
      expect(CASH_RUNWAY_THRESHOLDS.caution_runway_months).toBe(6);
      expect(CASH_RUNWAY_THRESHOLDS.warning_runway_months).toBe(3);
      expect(CASH_RUNWAY_THRESHOLDS.critical_runway_months).toBe(1);
    });

    it("should define funding trigger thresholds", () => {
      expect(CASH_RUNWAY_THRESHOLDS.trigger_6_months_burn).toBe(6);
      expect(CASH_RUNWAY_THRESHOLDS.trigger_3_months_burn).toBe(3);
      expect(CASH_RUNWAY_THRESHOLDS.trigger_critical).toBe(1);
    });

    it("should define scenario growth rates", () => {
      expect(CASH_RUNWAY_THRESHOLDS.best_case_revenue_growth).toBe(0.15);
      expect(CASH_RUNWAY_THRESHOLDS.base_case_revenue_growth).toBe(0.05);
      expect(CASH_RUNWAY_THRESHOLDS.worst_case_revenue_growth).toBe(-0.1);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should project strong growth startup (best case)", () => {
      const projections = projectCashRunway(
        500000, // Starting cash
        50000, // Initial revenue
        40000, // Expenses
        0.15, // 15% revenue growth
        0.02, // 2% expense growth
        24
      );

      expect(projections).toHaveLength(24);
      expect(projections[23].revenue).toBeGreaterThan(projections[0].revenue);
      expect(projections[23].cash_balance).toBeGreaterThan(projections[0].cash_balance);
    });

    it("should project struggling startup (worst case)", () => {
      const projections = projectCashRunway(
        300000,
        40000,
        60000,
        -0.1, // -10% revenue decline
        0.05, // 5% expense growth
        24
      );

      const depleted = projections.filter((p) => p.cash_balance <= 0);
      expect(depleted.length).toBeGreaterThan(0);
      expect(calculateMonthsUntilDepletion(300000, 40000, 60000, -0.1, 0.05)).toBeLessThan(12);
    });

    it("should project sustainable profitability", () => {
      const months = calculateMonthsUntilDepletion(
        600000,
        150000, // Strong revenue
        100000, // Controlled expenses
        0.05,
        0.03
      );

      expect(months).toBeNull(); // Never depletes
    });

    it("should identify funding trigger for growing startup", () => {
      // Startup with 100k cash, small runway
      const trigger = determineFundingTrigger(100000, 50000); // 2 months = WARNING

      expect(trigger).toBeDefined();
      expect(trigger!.urgency_level).toBe("high");
      expect(trigger!.recommended_action).toContain("Begin fundraising");
    });
  });

  describe("Scenario Enum", () => {
    it("should have all scenario types", () => {
      expect(RunwayScenario.BEST_CASE).toBe("BEST_CASE");
      expect(RunwayScenario.BASE_CASE).toBe("BASE_CASE");
      expect(RunwayScenario.WORST_CASE).toBe("WORST_CASE");
      expect(RunwayScenario.CUSTOM).toBe("CUSTOM");
    });
  });
});
