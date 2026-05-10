/**
 * Unit Economics Calculator Engine (Phase 5 Slice 2)
 *
 * Calculates core unit economics metrics from operational data:
 * - Customer Acquisition Cost (CAC)
 * - Lifetime Value (LTV)
 * - Magic Number (growth efficiency)
 * - Payback period
 * - Gross/Net margins
 *
 * Non-DB foundation: pure TypeScript unit economics logic.
 * Tenant-scoped: all calculations bound to workspaceId.
 */

import { RevenueModel } from "@/domain/financial/revenue-model";

export enum UnitEconomicsHealth {
  EXCELLENT = "EXCELLENT", // LTV/CAC > 3, Magic > 0.75
  GOOD = "GOOD",           // LTV/CAC > 2, Magic > 0.5
  HEALTHY = "HEALTHY",     // LTV/CAC > 1, Magic > 0.3
  WARNING = "WARNING",     // LTV/CAC > 0.8, Magic > 0.1
  CRITICAL = "CRITICAL",   // LTV/CAC < 0.8
  UNKNOWN = "UNKNOWN",     // Insufficient data
}

export interface CustomerSegmentEconomics {
  segmentId: string;
  segmentName: string;

  // Acquisition metrics
  customerAcquisitionCost: number;
  acquisitionChannelCost: number;
  salesCycleMonths: number;

  // Revenue metrics
  monthlyRecurringRevenue: number;
  averageContractValue: number;
  contractLengthMonths: number;

  // Retention metrics
  customerLifetimeValue: number;
  monthlyChurnRate: number; // 0-1, e.g., 0.05 = 5% monthly churn
  grossMarginPercent: number;

  // Efficiency metrics
  magicNumber: number; // (MRR_month_N - MRR_month_N-3) / Sales&Marketing spend
  paybackPeriodMonths: number;
  roi12Month: number; // 0-1, percentage return on investment in first 12 months
}

export interface UnitEconomicsAssessment {
  workspaceId: string;
  assessment_id: string;
  assessed_at: Date;

  // Segment-level assessments
  bySegment: CustomerSegmentEconomics[];

  // Company-level aggregates
  blendedCustomerAcquisitionCost: number;
  blendedLifetimeValue: number;
  blendedLtvCacRatio: number;
  blendedMagicNumber: number;
  blendedPaybackMonths: number;

  // Overall health
  health: UnitEconomicsHealth;

  // Key insights
  strongSegments: string[]; // Segment IDs with LTV/CAC > 2
  weakSegments: string[]; // Segment IDs with LTV/CAC < 1
  efficiencyTrend: "IMPROVING" | "STABLE" | "DECLINING";

  // Risk assessment
  scalabilityRisk: number; // 0-1: risk that unit economics degrade with scale
  marginPressure: number; // 0-1: risk of margin compression
}

/**
 * Unit Economics Calculator
 */
export class UnitEconomicsCalculator {
  /**
   * Calculate unit economics for a customer segment
   */
  static calculateSegmentEconomics(
    segmentId: string,
    segmentName: string,
    customerCount: number,
    totalAcquisitionCost: number,
    monthlyRecurringRevenue: number,
    contractLengthMonths: number,
    monthlyChurnRate: number,
    grossMarginPercent: number,
    salesCycleMonths: number,
    magicNumber: number,
    workspaceId: string
  ): CustomerSegmentEconomics {
    if (!workspaceId) {
      throw new Error("UnitEconomicsCalculator requires workspaceId for tenant scoping");
    }

    if (customerCount === 0) {
      throw new Error("Cannot calculate unit economics with zero customers");
    }

    // Calculate per-customer metrics
    const customerAcquisitionCost = totalAcquisitionCost / customerCount;
    const monthlyRevenuPerCustomer = monthlyRecurringRevenue / customerCount;

    // Lifetime value calculation
    // LTV = ARPU × Gross Margin % × (1 / Monthly Churn Rate)
    const monthlyChurnAsDecimal = Math.max(0.001, monthlyChurnRate); // Avoid division by zero
    const customerLifetimeValue =
      monthlyRevenuPerCustomer * (grossMarginPercent / 100) * (1 / monthlyChurnAsDecimal);

    // Payback period: how long to recover CAC from contribution margin
    // Payback = CAC / (ARPU × Gross Margin %)
    const monthlyContributionMargin = monthlyRevenuPerCustomer * (grossMarginPercent / 100);
    const paybackPeriodMonths =
      monthlyContributionMargin > 0
        ? Math.round(customerAcquisitionCost / monthlyContributionMargin)
        : Infinity;

    // 12-month ROI
    // ROI = (LTV at 12 months - CAC) / CAC
    const monthsToConsider = Math.min(12, contractLengthMonths);
    const ltvAt12Months = monthlyRevenuPerCustomer * (grossMarginPercent / 100) * monthsToConsider;
    const roi12Month = Math.max(-1, (ltvAt12Months - customerAcquisitionCost) / customerAcquisitionCost);

    return {
      segmentId,
      segmentName,
      customerAcquisitionCost,
      acquisitionChannelCost: totalAcquisitionCost, // Total, not per-customer
      salesCycleMonths,
      monthlyRecurringRevenue,
      averageContractValue: monthlyRevenuPerCustomer * contractLengthMonths,
      contractLengthMonths,
      customerLifetimeValue,
      monthlyChurnRate,
      grossMarginPercent,
      magicNumber,
      paybackPeriodMonths,
      roi12Month,
    };
  }

  /**
   * Assess overall unit economics across segments
   */
  static assessUnitEconomics(
    segments: CustomerSegmentEconomics[],
    workspaceId: string
  ): UnitEconomicsAssessment {
    if (!workspaceId) {
      throw new Error("UnitEconomicsCalculator requires workspaceId for tenant scoping");
    }

    if (segments.length === 0) {
      return {
        workspaceId,
        assessment_id: `ue-assessment-${workspaceId}-${Date.now()}`,
        assessed_at: new Date(),
        bySegment: [],
        blendedCustomerAcquisitionCost: 0,
        blendedLifetimeValue: 0,
        blendedLtvCacRatio: 0,
        blendedMagicNumber: 0,
        blendedPaybackMonths: Infinity,
        health: UnitEconomicsHealth.UNKNOWN,
        strongSegments: [],
        weakSegments: [],
        efficiencyTrend: "STABLE",
        scalabilityRisk: 0.5,
        marginPressure: 0.5,
      };
    }

    // Calculate blended metrics (weighted by revenue)
    const totalRevenue = segments.reduce((sum, s) => sum + s.monthlyRecurringRevenue, 0);
    const totalCost = segments.reduce((sum, s) => sum + s.customerAcquisitionCost * (s.monthlyRecurringRevenue / s.monthlyRecurringRevenue), 0);

    const blendedCustomerAcquisitionCost = totalRevenue > 0 ? totalCost / segments.length : 0;
    const blendedLifetimeValue =
      segments.reduce((sum, s) => sum + s.customerLifetimeValue, 0) / segments.length;
    const blendedLtvCacRatio = blendedCustomerAcquisitionCost > 0 ? blendedLifetimeValue / blendedCustomerAcquisitionCost : 0;
    const blendedMagicNumber = segments.reduce((sum, s) => sum + s.magicNumber, 0) / segments.length;
    const blendedPaybackMonths = segments.reduce((sum, s) => sum + s.paybackPeriodMonths, 0) / segments.length;

    // Classify health based on LTV/CAC ratio
    let health = UnitEconomicsHealth.UNKNOWN;
    if (blendedLtvCacRatio > 3) {
      health = UnitEconomicsHealth.EXCELLENT;
    } else if (blendedLtvCacRatio > 2) {
      health = UnitEconomicsHealth.GOOD;
    } else if (blendedLtvCacRatio > 1) {
      health = UnitEconomicsHealth.HEALTHY;
    } else if (blendedLtvCacRatio > 0.8) {
      health = UnitEconomicsHealth.WARNING;
    } else if (blendedLtvCacRatio > 0) {
      health = UnitEconomicsHealth.CRITICAL;
    }

    // Identify strong and weak segments
    const strongSegments = segments
      .filter((s) => s.customerLifetimeValue / s.customerAcquisitionCost > 2)
      .map((s) => s.segmentId);

    const weakSegments = segments
      .filter((s) => s.customerLifetimeValue / s.customerAcquisitionCost < 1)
      .map((s) => s.segmentId);

    // Assess efficiency trend (simplified: assume stable unless strong/weak disparity)
    let efficiencyTrend: "IMPROVING" | "STABLE" | "DECLINING" = "STABLE";
    if (strongSegments.length > segments.length * 0.5) {
      efficiencyTrend = "IMPROVING";
    } else if (weakSegments.length > segments.length * 0.5) {
      efficiencyTrend = "DECLINING";
    }

    // Assess scalability risk (higher when churn increases with scale)
    const avgChurn = segments.reduce((sum, s) => sum + s.monthlyChurnRate, 0) / segments.length;
    const scalabilityRisk = Math.min(1, avgChurn * 5); // Assume 20%+ monthly churn = high risk

    // Assess margin pressure (lower margins = higher pressure)
    const avgMargin = segments.reduce((sum, s) => sum + s.grossMarginPercent, 0) / segments.length;
    const marginPressure = Math.max(0, 1 - avgMargin / 100);

    return {
      workspaceId,
      assessment_id: `ue-assessment-${workspaceId}-${Date.now()}`,
      assessed_at: new Date(),
      bySegment: segments,
      blendedCustomerAcquisitionCost,
      blendedLifetimeValue,
      blendedLtvCacRatio,
      blendedMagicNumber,
      blendedPaybackMonths,
      health,
      strongSegments,
      weakSegments,
      efficiencyTrend,
      scalabilityRisk,
      marginPressure,
    };
  }
}
