import {
  RevenueStreamType,
  UnitEconomicsHealth,
  UNIT_ECONOMICS_BENCHMARKS,
  calculateCAC,
  calculateLTV,
  calculatePaybackPeriod,
  calculateContributionMargin,
  assessLTVtoCACHealth,
  assessUnitEconomicsHealth,
  validateUnitEconomics,
  unitEconomicsToDTO,
} from "@/domain/financial/unit-economics";

describe("Unit Economics Domain", () => {
  describe("CAC Calculation", () => {
    it("should calculate customer acquisition cost", () => {
      const cac = calculateCAC(10000, 5000, 2000, 100);
      expect(cac).toBe(170); // (10000 + 5000 + 2000) / 100
    });

    it("should handle zero customers", () => {
      const cac = calculateCAC(10000, 5000, 2000, 0);
      expect(cac).toBe(0);
    });

    it("should handle zero spend", () => {
      const cac = calculateCAC(0, 0, 0, 50);
      expect(cac).toBe(0);
    });

    it("should sum all cost components", () => {
      const marketing = 50000;
      const sales = 30000;
      const onboarding = 10000;
      const customers = 100;
      const cac = calculateCAC(marketing, sales, onboarding, customers);
      expect(cac).toBe(900);
    });
  });

  describe("LTV Calculation", () => {
    it("should calculate customer lifetime value", () => {
      const ltv = calculateLTV(5000, 70, 36); // $5000/month, 70% margin, 36 months
      expect(ltv).toBe(126000); // 5000 * 0.7 * 36
    });

    it("should handle zero margin", () => {
      const ltv = calculateLTV(5000, 0, 36);
      expect(ltv).toBe(0);
    });

    it("should handle zero lifespan", () => {
      const ltv = calculateLTV(5000, 70, 0);
      expect(ltv).toBe(0);
    });

    it("should reflect gross margin correctly", () => {
      const ltv50 = calculateLTV(5000, 50, 36);
      const ltv70 = calculateLTV(5000, 70, 36);
      expect(ltv70).toBeGreaterThan(ltv50);
      expect(ltv70 / ltv50).toBe(1.4); // 70% vs 50% margin ratio
    });
  });

  describe("Payback Period Calculation", () => {
    it("should calculate payback period in months", () => {
      const payback = calculatePaybackPeriod(3000, 1000, 70); // $3000 CAC, $1000/month MRR, 70% margin
      expect(payback).toBeCloseTo(4.29, 1); // 3000 / (1000 * 0.7)
    });

    it("should return Infinity with zero monthly contribution", () => {
      const payback = calculatePaybackPeriod(3000, 1000, 0);
      expect(payback).toBe(Infinity);
    });

    it("should return zero with zero CAC", () => {
      const payback = calculatePaybackPeriod(0, 1000, 70);
      expect(payback).toBe(0);
    });

    it("should reflect higher margin with faster payback", () => {
      const payback50 = calculatePaybackPeriod(3000, 1000, 50);
      const payback70 = calculatePaybackPeriod(3000, 1000, 70);
      expect(payback70).toBeLessThan(payback50);
    });
  });

  describe("Contribution Margin Calculation", () => {
    it("should calculate contribution margin per unit", () => {
      const { contribution, margin_percent } = calculateContributionMargin(1000, 300);
      expect(contribution).toBe(700); // 1000 - 300
      expect(margin_percent).toBeCloseTo(70, 0); // 700 / 1000 * 100
    });

    it("should handle zero revenue", () => {
      const { contribution, margin_percent } = calculateContributionMargin(0, 0);
      expect(contribution).toBe(0);
      expect(margin_percent).toBe(0); // 0 / 0 * 100 but prevents NaN
    });

    it("should handle costs exceeding revenue (negative margin)", () => {
      const { contribution, margin_percent } = calculateContributionMargin(100, 150);
      expect(contribution).toBe(-50);
      expect(margin_percent).toBeCloseTo(-50, 0); // Negative margin
    });

    it("should calculate 50% margin correctly", () => {
      const { contribution, margin_percent } = calculateContributionMargin(1000, 500);
      expect(contribution).toBe(500);
      expect(margin_percent).toBe(50);
    });
  });

  describe("LTV:CAC Ratio Health Assessment", () => {
    it("should classify excellent ratio (5:1 or better)", () => {
      const health = assessLTVtoCACHealth(50000, 10000); // 5:1 ratio
      expect(health).toBe("excellent");
    });

    it("should classify excellent ratio (10:1)", () => {
      const health = assessLTVtoCACHealth(100000, 10000);
      expect(health).toBe("excellent");
    });

    it("should classify healthy ratio (3:1)", () => {
      const health = assessLTVtoCACHealth(30000, 10000);
      expect(health).toBe("healthy");
    });

    it("should classify at-risk ratio (1.5:1)", () => {
      const health = assessLTVtoCACHealth(15000, 10000);
      expect(health).toBe("at_risk");
    });

    it("should classify critical ratio (1:1)", () => {
      const health = assessLTVtoCACHealth(10000, 10000);
      expect(health).toBe("critical");
    });

    it("should classify critical ratio (below 1:1)", () => {
      const health = assessLTVtoCACHealth(5000, 10000);
      expect(health).toBe("critical");
    });

    it("should handle zero CAC as excellent", () => {
      const health = assessLTVtoCACHealth(50000, 0);
      expect(health).toBe("excellent");
    });
  });

  describe("Unit Economics Health Assessment", () => {
    it("should classify excellent health (all metrics strong)", () => {
      const health = assessUnitEconomicsHealth(5, 12, 70);
      expect(health).toBe(UnitEconomicsHealth.HEALTHY);
    });

    it("should classify at-risk with poor LTV:CAC", () => {
      const health = assessUnitEconomicsHealth(2, 12, 70);
      expect(health).toBe(UnitEconomicsHealth.AT_RISK);
    });

    it("should classify critical with poor LTV:CAC", () => {
      const health = assessUnitEconomicsHealth(1, 12, 70);
      expect(health).toBe(UnitEconomicsHealth.CRITICAL);
    });

    it("should classify at-risk with long payback", () => {
      const health = assessUnitEconomicsHealth(3, 20, 70);
      expect(health).toBe(UnitEconomicsHealth.AT_RISK);
    });

    it("should classify critical with very long payback", () => {
      const health = assessUnitEconomicsHealth(3, 30, 70);
      expect(health).toBe(UnitEconomicsHealth.CRITICAL);
    });

    it("should classify at-risk with low margin", () => {
      const health = assessUnitEconomicsHealth(3, 12, 35);
      expect(health).toBe(UnitEconomicsHealth.AT_RISK);
    });

    it("should classify critical with very low margin", () => {
      const health = assessUnitEconomicsHealth(3, 12, 15);
      expect(health).toBe(UnitEconomicsHealth.CRITICAL);
    });

    it("should classify healthy with strong metrics", () => {
      const health = assessUnitEconomicsHealth(6, 10, 75);
      expect(health).toBe(UnitEconomicsHealth.HEALTHY);
    });
  });

  describe("Unit Economics Validation", () => {
    it("should validate correct metrics", () => {
      expect(validateUnitEconomics(50000, 10000, 12, 70)).toBe(true);
    });

    it("should reject negative LTV", () => {
      expect(validateUnitEconomics(-50000, 10000, 12, 70)).toBe(false);
    });

    it("should reject negative CAC", () => {
      expect(validateUnitEconomics(50000, -10000, 12, 70)).toBe(false);
    });

    it("should reject negative payback", () => {
      expect(validateUnitEconomics(50000, 10000, -12, 70)).toBe(false);
    });

    it("should reject Infinity payback", () => {
      expect(validateUnitEconomics(50000, 10000, Infinity, 70)).toBe(false);
    });

    it("should reject negative margin", () => {
      expect(validateUnitEconomics(50000, 10000, 12, -70)).toBe(false);
    });

    it("should reject margin > 100%", () => {
      expect(validateUnitEconomics(50000, 10000, 12, 150)).toBe(false);
    });
  });

  describe("Unit Economics DTO Conversion", () => {
    it("should convert to DTO with calculated ratio", () => {
      const dto = unitEconomicsToDTO(50000, 10000, 12, 70, RevenueStreamType.SUBSCRIPTION, "ws-test");

      expect(dto.workspaceId).toBe("ws-test");
      expect(dto.ltv).toBe(50000);
      expect(dto.cac).toBe(10000);
      expect(dto.ltv_cac_ratio).toBe(5);
      expect(dto.payback_months).toBe(12);
      expect(dto.gross_margin_percent).toBe(70);
      expect(dto.health).toBe(UnitEconomicsHealth.HEALTHY);
    });

    it("should classify health correctly in DTO", () => {
      const dto = unitEconomicsToDTO(30000, 10000, 18, 60, RevenueStreamType.SUBSCRIPTION, "ws-test");
      expect(dto.health).toBe(UnitEconomicsHealth.HEALTHY);
    });

    it("should include timestamp", () => {
      const dto = unitEconomicsToDTO(50000, 10000, 12, 70, RevenueStreamType.SUBSCRIPTION, "ws-test");
      expect(dto.assessed_at).toBeInstanceOf(Date);
    });

    it("should include revenue stream type", () => {
      const dto = unitEconomicsToDTO(
        50000,
        10000,
        12,
        70,
        RevenueStreamType.PROFESSIONAL_SERVICES,
        "ws-test"
      );
      expect(dto.stream).toBe(RevenueStreamType.PROFESSIONAL_SERVICES);
    });
  });

  describe("Benchmarks", () => {
    it("should define excellent LTV:CAC ratio", () => {
      expect(UNIT_ECONOMICS_BENCHMARKS.excellent_ltv_cac_ratio).toBe(5);
    });

    it("should define healthy LTV:CAC ratio", () => {
      expect(UNIT_ECONOMICS_BENCHMARKS.healthy_ltv_cac_ratio).toBe(3);
    });

    it("should define at-risk LTV:CAC ratio", () => {
      expect(UNIT_ECONOMICS_BENCHMARKS.at_risk_ltv_cac_ratio).toBe(1.5);
    });

    it("should define payback period benchmarks", () => {
      expect(UNIT_ECONOMICS_BENCHMARKS.efficient_payback_months).toBe(12);
      expect(UNIT_ECONOMICS_BENCHMARKS.acceptable_payback_months).toBe(18);
      expect(UNIT_ECONOMICS_BENCHMARKS.critical_payback_months).toBe(24);
    });

    it("should define gross margin benchmarks", () => {
      expect(UNIT_ECONOMICS_BENCHMARKS.healthy_gross_margin_percent).toBe(60);
      expect(UNIT_ECONOMICS_BENCHMARKS.acceptable_gross_margin_percent).toBe(40);
      expect(UNIT_ECONOMICS_BENCHMARKS.minimum_gross_margin_percent).toBe(20);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should assess healthy SaaS unit economics", () => {
      // Typical SaaS: $2000/month contract, 80% margin, 3-year lifetime
      const ltv = calculateLTV(2000, 80, 36); // $57,600
      const cac = calculateCAC(5000, 3000, 500, 20); // $425 CAC
      const payback = calculatePaybackPeriod(425, 2000, 80);
      const health = assessUnitEconomicsHealth(ltv / cac, payback, 80);

      expect(ltv).toBe(57600);
      expect(cac).toBe(425);
      expect(payback).toBeCloseTo(0.27, 1); // ~1 week payback
      expect(health).toBe(UnitEconomicsHealth.HEALTHY);
    });

    it("should assess at-risk unit economics (long payback)", () => {
      // Struggling: $500/month contract, 50% margin, high CAC
      const ltv = calculateLTV(500, 50, 36); // $9,000
      const cac = calculateCAC(20000, 10000, 2000, 50); // $640 CAC
      const payback = calculatePaybackPeriod(640, 500, 50); // 640 / (500 * 0.5) = 2.56 months
      const health = assessUnitEconomicsHealth(ltv / cac, payback, 50);

      expect(ltv).toBe(9000);
      expect(cac).toBe(640);
      expect(payback).toBeCloseTo(2.56, 1); // ~2.6 months
      expect(health).toBe(UnitEconomicsHealth.HEALTHY);
    });

    it("should assess critical unit economics (negative margin)", () => {
      // Losing money: negative contribution margin
      const { margin_percent } = calculateContributionMargin(100, 120);
      const health = assessUnitEconomicsHealth(2, 12, margin_percent);

      expect(margin_percent).toBeCloseTo(-20, 0);
      expect(health).toBe(UnitEconomicsHealth.CRITICAL);
    });
  });

  describe("Unit Economics Enum", () => {
    it("should have all health levels", () => {
      expect(UnitEconomicsHealth.EXCELLENT).toBe("EXCELLENT");
      expect(UnitEconomicsHealth.HEALTHY).toBe("HEALTHY");
      expect(UnitEconomicsHealth.AT_RISK).toBe("AT_RISK");
      expect(UnitEconomicsHealth.CRITICAL).toBe("CRITICAL");
    });
  });
});
