/**
 * Unit Tests for Unit Economics Calculator (Phase 5 Slice 2)
 *
 * Proves unit economics calculation accuracy for financial health assessment.
 * Verifies: LTV/CAC ratios, payback calculations, margin analysis, health classification.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { UnitEconomicsCalculator, UnitEconomicsHealth } from "@/services/unit-economics-calculator";

describe("Unit Economics Calculator — Phase 5 Slice 2", () => {
  const workspaceId = "ws-test";

  describe("Segment Economics Calculation", () => {
    it("should calculate unit economics for a segment with healthy metrics", () => {
      // Enterprise segment: High CAC, High LTV
      const segment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "segment-1",
        "Enterprise",
        100, // 100 customers
        1000000, // $1M total acquisition cost
        500000, // $500K monthly recurring revenue
        36, // 3-year contracts
        0.02, // 2% monthly churn
        75, // 75% gross margin
        6, // 6-month sales cycle
        1.2, // Magic number
        workspaceId
      );

      expect(segment.customerAcquisitionCost).toBe(10000); // $1M / 100
      expect(segment.monthlyRecurringRevenue).toBe(500000);
      expect(segment.customerLifetimeValue).toBeGreaterThan(50000); // $5000/month revenue, 75% margin, 2% churn
      expect(segment.paybackPeriodMonths).toBeLessThan(24); // Should pay back within 2 years
      expect(segment.roi12Month).toBeGreaterThan(0); // Positive ROI in first year
    });

    it("should calculate payback period correctly", () => {
      // Simple case: $10k CAC, $1k/month ARPU, 70% margin
      const segment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "segment-1",
        "SMB",
        50,
        500000, // $500k total / 50 = $10k per customer
        50000, // $50k monthly = $1k per customer
        12,
        0.05,
        70, // 70% margin
        3,
        0.3,
        workspaceId
      );

      // Payback = $10k / ($1k × 0.7) = 14.3 months
      expect(segment.paybackPeriodMonths).toBeCloseTo(14, 1);
    });

    it("should require workspace scoping", () => {
      expect(() => {
        UnitEconomicsCalculator.calculateSegmentEconomics(
          "segment-1",
          "Test",
          10,
          100000,
          10000,
          12,
          0.05,
          70,
          3,
          0.5,
          "" // Missing workspace
        );
      }).toThrow("workspaceId for tenant scoping");
    });

    it("should fail with zero customers", () => {
      expect(() => {
        UnitEconomicsCalculator.calculateSegmentEconomics(
          "segment-1",
          "Test",
          0, // Zero customers
          100000,
          10000,
          12,
          0.05,
          70,
          3,
          0.5,
          workspaceId
        );
      }).toThrow("zero customers");
    });

    it("should handle high churn scenarios", () => {
      const highChurnSegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "segment-1",
        "Trial",
        100,
        10000, // Low CAC
        50000, // Revenue
        1, // 1-month contracts
        0.5, // 50% monthly churn
        50,
        1,
        0.1, // Low magic number
        workspaceId
      );

      expect(highChurnSegment.customerLifetimeValue).toBeLessThan(10000); // Low LTV due to high churn
      expect(highChurnSegment.magicNumber).toBeLessThan(0.15); // Low efficiency
    });

    it("should calculate LTV/CAC ratio", () => {
      const segment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "segment-1",
        "Test",
        100,
        500000,
        100000,
        24,
        0.02, // 2% churn
        75,
        6,
        0.8,
        workspaceId
      );

      const ltvCacRatio = segment.customerLifetimeValue / segment.customerAcquisitionCost;
      expect(ltvCacRatio).toBeGreaterThan(2); // Should be healthy
    });
  });

  describe("Unit Economics Assessment", () => {
    it("should assess overall unit economics across multiple segments", () => {
      const enterprise = UnitEconomicsCalculator.calculateSegmentEconomics(
        "enterprise",
        "Enterprise",
        50,
        1000000,
        300000,
        36,
        0.01,
        80,
        6,
        1.0,
        workspaceId
      );

      const smb = UnitEconomicsCalculator.calculateSegmentEconomics(
        "smb",
        "SMB",
        200,
        200000,
        100000,
        12,
        0.05,
        70,
        3,
        0.4,
        workspaceId
      );

      const assessment = UnitEconomicsCalculator.assessUnitEconomics(
        [enterprise, smb],
        workspaceId
      );

      expect(assessment.bySegment.length).toBe(2);
      expect(assessment.blendedCustomerAcquisitionCost).toBeGreaterThan(0);
      expect(assessment.blendedLifetimeValue).toBeGreaterThan(0);
      expect(assessment.health).toBeDefined();
    });

    it("should classify health based on LTV/CAC ratio", () => {
      // High-quality unit economics
      const healthySegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "healthy",
        "Healthy",
        100,
        100000,
        100000, // High revenue relative to CAC
        24,
        0.02,
        75,
        6,
        0.8,
        workspaceId
      );

      const assessment = UnitEconomicsCalculator.assessUnitEconomics([healthySegment], workspaceId);

      expect([UnitEconomicsHealth.EXCELLENT, UnitEconomicsHealth.GOOD, UnitEconomicsHealth.HEALTHY]).toContain(
        assessment.health
      );
    });

    it("should identify strong and weak segments", () => {
      const strong = UnitEconomicsCalculator.calculateSegmentEconomics(
        "strong",
        "Strong",
        100,
        100000, // $1k CAC
        200000, // High revenue = $2k per customer
        24,
        0.01,
        80,
        3,
        1.0,
        workspaceId
      );

      // Weak: CAC > LTV
      const weak = UnitEconomicsCalculator.calculateSegmentEconomics(
        "weak",
        "Weak",
        100,
        500000, // $5k CAC (very high)
        30000, // $300 per customer revenue
        6,
        0.2, // High churn
        40, // Low margin
        9,
        0.05,
        workspaceId
      );

      const assessment = UnitEconomicsCalculator.assessUnitEconomics([strong, weak], workspaceId);

      expect(assessment.strongSegments).toContain("strong");
      expect(assessment.weakSegments).toContain("weak");
    });

    it("should assess efficiency trend", () => {
      // All segments with good economics → IMPROVING trend
      const goodSegments = [1, 2, 3].map((i) =>
        UnitEconomicsCalculator.calculateSegmentEconomics(
          `segment-${i}`,
          `Segment ${i}`,
          100,
          50000,
          100000,
          24,
          0.02,
          75,
          3,
          0.8,
          workspaceId
        )
      );

      const assessment = UnitEconomicsCalculator.assessUnitEconomics(goodSegments, workspaceId);
      expect(assessment.efficiencyTrend).toBe("IMPROVING");
    });

    it("should assess scalability risk from churn", () => {
      const highChurnSegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "high-churn",
        "High Churn",
        100,
        50000,
        50000,
        6,
        0.3, // 30% monthly churn
        60,
        2,
        0.2,
        workspaceId
      );

      const assessment = UnitEconomicsCalculator.assessUnitEconomics([highChurnSegment], workspaceId);

      expect(assessment.scalabilityRisk).toBeGreaterThan(0.5); // High risk
    });

    it("should assess margin pressure", () => {
      const lowMarginSegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "low-margin",
        "Low Margin",
        100,
        100000,
        100000,
        12,
        0.05,
        30, // Low margin
        6,
        0.3,
        workspaceId
      );

      const assessment = UnitEconomicsCalculator.assessUnitEconomics([lowMarginSegment], workspaceId);

      expect(assessment.marginPressure).toBeGreaterThan(0.5); // High pressure
    });

    it("should handle empty segment list", () => {
      const assessment = UnitEconomicsCalculator.assessUnitEconomics([], workspaceId);

      expect(assessment.bySegment).toHaveLength(0);
      expect(assessment.health).toBe(UnitEconomicsHealth.UNKNOWN);
    });

    it("should require workspace scoping", () => {
      const segment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "segment-1",
        "Test",
        100,
        100000,
        50000,
        12,
        0.05,
        70,
        3,
        0.5,
        workspaceId
      );

      expect(() => {
        UnitEconomicsCalculator.assessUnitEconomics([segment], ""); // Missing workspace
      }).toThrow("workspaceId for tenant scoping");
    });
  });

  describe("Magic Number Calculation", () => {
    it("should reflect sales efficiency through magic number", () => {
      // High growth efficiency
      const efficientSegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "efficient",
        "Efficient",
        100,
        100000,
        200000, // 2x MRR growth for same S&M spend
        12,
        0.02,
        75,
        3,
        2.0, // High magic number
        workspaceId
      );

      expect(efficientSegment.magicNumber).toBe(2.0);

      // Low growth efficiency
      const inefficientSegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "inefficient",
        "Inefficient",
        100,
        100000,
        50000,
        12,
        0.05,
        70,
        6,
        0.2, // Low magic number
        workspaceId
      );

      expect(inefficientSegment.magicNumber).toBe(0.2);
    });
  });

  describe("ROI Calculation", () => {
    it("should calculate 12-month ROI accurately", () => {
      const segment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "segment-1",
        "Test",
        100,
        100000, // $100k total = $1k per customer CAC
        120000, // $120k monthly MRR = $1.2k per customer
        24,
        0.02, // 2% churn
        80, // 80% gross margin
        3,
        0.8,
        workspaceId
      );

      // Monthly contribution margin = $1.2k * 0.8 = $960
      // 12-month LTV = $960 * 12 = $11,520
      // ROI = ($11,520 - $1,000) / $1,000 = 10.52 = 1052%
      expect(segment.roi12Month).toBeGreaterThan(10);
    });

    it("should handle negative ROI in first year", () => {
      const expensiveSegment = UnitEconomicsCalculator.calculateSegmentEconomics(
        "expensive",
        "Expensive",
        100,
        1000000, // $10k per customer CAC (very high)
        50000, // $500 per customer MRR (low)
        6,
        0.1, // High churn
        50,
        12,
        0.05,
        workspaceId
      );

      expect(expensiveSegment.roi12Month).toBeLessThan(0); // Negative ROI in first year
    });
  });

  describe("Churn Impact", () => {
    it("should demonstrate inverse relationship between churn and LTV", () => {
      const lowChurn = UnitEconomicsCalculator.calculateSegmentEconomics(
        "low-churn",
        "Low Churn",
        100,
        100000,
        50000,
        24,
        0.01, // 1% churn
        70,
        3,
        0.5,
        workspaceId
      );

      const highChurn = UnitEconomicsCalculator.calculateSegmentEconomics(
        "high-churn",
        "High Churn",
        100,
        100000,
        50000,
        24,
        0.1, // 10% churn
        70,
        3,
        0.5,
        workspaceId
      );

      expect(lowChurn.customerLifetimeValue).toBeGreaterThan(highChurn.customerLifetimeValue);
    });
  });
});
