/**
 * Phase 9 Slice 5: Retention Engine Service
 *
 * Implements customer retention analysis, churn prediction, and intervention modeling.
 * Builds on growth-engines.ts domain contracts.
 *
 * CRITICAL: Service operates on workspace-scoped data only.
 * All inputs must include workspaceId for tenant safety.
 */

import {
  RetentionMetrics,
  ChurnAnalysis,
  ChurnReason,
  validateRetentionMetrics,
} from "@/domain/growth/growth-engines";

/**
 * Retention Engine Service
 * Manages customer retention metrics, churn analysis, and intervention
 */
export class RetentionEngine {
  /**
   * Validate and record retention metrics for a cohort
   */
  static recordMetrics(
    workspaceId: string,
    data: Partial<RetentionMetrics>
  ): { metrics: RetentionMetrics | null; error: string | null } {
    // Ensure workspace scoping first
    if (!workspaceId || workspaceId.length === 0) {
      return {
        metrics: null,
        error: "Workspace ID is required for retention metrics",
      };
    }

    // Validate metrics data
    const validation = validateRetentionMetrics(data);
    if (!validation.valid) {
      return {
        metrics: null,
        error: `Retention metrics validation failed: ${validation.errors.join("; ")}`,
      };
    }

    // Create metrics with workspace scoping
    const metrics: RetentionMetrics = {
      cohortMonth: data.cohortMonth || new Date().toISOString().slice(0, 7),
      cohortSize: data.cohortSize,
      monthlyRetention: data.monthlyRetention || {},
      avgMonthlyChurn: data.avgMonthlyChurn || 0,
    };

    return { metrics, error: null };
  }

  /**
   * Calculate cohort retention curve (% retained over months)
   */
  static calculateRetentionCurve(
    workspaceId: string,
    monthlyRetention: Record<number, number>
  ): {
    curve: Array<{ month: number; retained: number }>;
    cliff: number; // Month with largest drop
  } {
    if (!workspaceId) {
      return { curve: [], cliff: 0 };
    }

    const months = Object.keys(monthlyRetention)
      .map((m) => parseInt(m))
      .sort((a, b) => a - b);

    const curve = months.map((month) => ({
      month,
      retained: Math.round(monthlyRetention[month] * 100), // percent
    }));

    // Find cliff (largest single-month drop)
    let maxDrop = 0;
    let cliffMonth = 0;

    for (let i = 1; i < months.length; i++) {
      const drop = monthlyRetention[months[i - 1]] - monthlyRetention[months[i]];
      if (drop > maxDrop) {
        maxDrop = drop;
        cliffMonth = months[i];
      }
    }

    return {
      curve,
      cliff: cliffMonth,
    };
  }

  /**
   * Estimate churn risk for a cohort
   */
  static assessChurnRisk(
    workspaceId: string,
    metrics: RetentionMetrics
  ): {
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    churnScore: number; // 0-100
    atRiskPercent: number; // 0-100
    interventionUrgency: "IMMEDIATE" | "URGENT" | "PLANNED" | "MONITOR";
  } {
    if (!workspaceId) {
      return {
        riskLevel: "LOW",
        churnScore: 0,
        atRiskPercent: 0,
        interventionUrgency: "MONITOR",
      };
    }

    const avgChurn = metrics.avgMonthlyChurn || 0;
    let churnScore = avgChurn * 100;
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    let interventionUrgency: "IMMEDIATE" | "URGENT" | "PLANNED" | "MONITOR";

    if (avgChurn >= 0.15) {
      riskLevel = "CRITICAL"; // 15%+ monthly churn
      interventionUrgency = "IMMEDIATE";
    } else if (avgChurn >= 0.1) {
      riskLevel = "HIGH"; // 10-15% monthly churn
      interventionUrgency = "URGENT";
    } else if (avgChurn >= 0.05) {
      riskLevel = "MEDIUM"; // 5-10% monthly churn
      interventionUrgency = "PLANNED";
    } else {
      riskLevel = "LOW"; // <5% monthly churn
      interventionUrgency = "MONITOR";
    }

    // At-risk percent = current churn rate
    const atRiskPercent = Math.round(avgChurn * 100);

    return {
      riskLevel,
      churnScore: Math.round(churnScore),
      atRiskPercent,
      interventionUrgency,
    };
  }

  /**
   * Analyze churn pattern and identify contributing factors
   */
  static analyzeChurnPattern(
    workspaceId: string,
    monthlyRetention: Record<number, number>,
    hypothesizedReasons: Partial<Record<ChurnReason, number>>
  ): ChurnAnalysis {
    if (!workspaceId) {
      return {
        predictedChurnRate: 0,
        topReasons: [],
        riskSegments: [],
        interventions: [],
      };
    }

    // Calculate average churn from retention data
    const retentionValues = Object.values(monthlyRetention).filter((v) => v !== null && v !== undefined);
    const avgRetention = retentionValues.length > 0 ? retentionValues.reduce((a, b) => a + b) / retentionValues.length : 1;
    const predictedChurnRate = 1 - avgRetention;

    // Rank churn reasons by weight
    const topReasons = Object.entries(hypothesizedReasons || {})
      .map(([reason, weight]) => ({
        reason: reason as ChurnReason,
        weight: Math.min(1, Math.max(0, weight || 0)),
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    // Identify at-risk segments
    const riskSegments: string[] = [];
    if (predictedChurnRate > 0.1) {
      riskSegments.push("Early cohorts (month 1-3)");
    }
    if (topReasons.some((r) => r.reason === ChurnReason.PRICE_SENSITIVITY)) {
      riskSegments.push("Price-sensitive segment");
    }
    if (topReasons.some((r) => r.reason === ChurnReason.FEATURE_LACK)) {
      riskSegments.push("Feature-dependent users");
    }

    // Recommend interventions
    const interventions: string[] = [];
    if (topReasons[0]?.reason === ChurnReason.PRODUCT_UNFIT) {
      interventions.push("Product fit assessment and onboarding improvement");
    }
    if (topReasons[0]?.reason === ChurnReason.PRICE_SENSITIVITY) {
      interventions.push("Pricing tier review and retention discount program");
    }
    if (topReasons[0]?.reason === ChurnReason.SUPPORT_ISSUE) {
      interventions.push("Support quality audit and response time improvement");
    }

    return {
      predictedChurnRate: Math.round(predictedChurnRate * 100) / 100,
      topReasons,
      riskSegments,
      interventions,
    };
  }

  /**
   * Calculate lifetime value impact of churn
   */
  static calculateLTVImpact(
    workspaceId: string,
    cohortSize: number,
    monthlyRetention: Record<number, number>,
    avgMonthlyValue: number
  ): {
    totalLTV: number; // Total revenue if no churn
    actualLTV: number; // Expected revenue with churn
    churnadjustedLTVPercent: number; // Actual as % of potential
    ltvRecoveryPotential: number; // Revenue that could be recovered
  } {
    if (!workspaceId || cohortSize <= 0 || avgMonthlyValue <= 0) {
      return {
        totalLTV: 0,
        actualLTV: 0,
        churnadjustedLTVPercent: 0,
        ltvRecoveryPotential: 0,
      };
    }

    // Calculate if retention was perfect (100%)
    const months = Object.keys(monthlyRetention).length || 12;
    const totalLTV = cohortSize * avgMonthlyValue * months;

    // Calculate actual LTV with retention rates
    let actualLTV = 0;
    const retentionMonths = Object.entries(monthlyRetention).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

    if (retentionMonths.length > 0) {
      retentionMonths.forEach(([month, rate]) => {
        const retained = cohortSize * (rate || 0);
        actualLTV += retained * avgMonthlyValue;
      });
    } else {
      actualLTV = totalLTV; // No churn data = assume perfect retention
    }

    const churnadjustedLTVPercent = totalLTV > 0 ? (actualLTV / totalLTV) * 100 : 0;
    const ltvRecoveryPotential = totalLTV - actualLTV;

    return {
      totalLTV: Math.round(totalLTV),
      actualLTV: Math.round(actualLTV),
      churnadjustedLTVPercent: Math.round(churnadjustedLTVPercent),
      ltvRecoveryPotential: Math.round(ltvRecoveryPotential),
    };
  }

  /**
   * Predict next month churn based on historical trend
   */
  static forecastChurn(
    workspaceId: string,
    monthlyRetention: Record<number, number>,
    trendDays: number = 90
  ): {
    projectedChurnRate: number; // 0-1
    confidence: number; // 0-1
    trend: "IMPROVING" | "STABLE" | "DECLINING";
  } {
    if (!workspaceId) {
      return {
        projectedChurnRate: 0,
        confidence: 0,
        trend: "STABLE",
      };
    }

    const months = Object.keys(monthlyRetention)
      .map((m) => parseInt(m))
      .sort((a, b) => a - b);

    if (months.length < 2) {
      return {
        projectedChurnRate: monthlyRetention[months[0]] ? 1 - monthlyRetention[months[0]] : 0.05,
        confidence: 0.3,
        trend: "STABLE",
      };
    }

    // Simple trend: compare recent months
    const recent = monthlyRetention[months[months.length - 1]] || 0;
    const previous = monthlyRetention[months[months.length - 2]] || 0;
    const trend: "IMPROVING" | "STABLE" | "DECLINING" = recent > previous ? "IMPROVING" : recent < previous ? "DECLINING" : "STABLE";

    // Project next month churn
    const lastChurn = 1 - recent;
    const projectedChurnRate = Math.max(0, Math.min(1, lastChurn));

    // Confidence increases with data points
    const confidence = Math.min(0.9, 0.3 + months.length * 0.1);

    return {
      projectedChurnRate,
      confidence,
      trend,
    };
  }
}
