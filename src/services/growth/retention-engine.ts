/**
 * Growth: Retention Engine Service
 *
 * Workspace-scoped customer retention analysis, churn prediction, and LTV modeling.
 * Cohort data is persisted to `retention_cohorts` (DB-backed, replacing prior in-memory Maps).
 * All writes are workspace-scoped and audit-tracked.
 *
 * Pure-function methods (calculateRetentionCurve, assessChurnRisk, analyzeChurnPattern,
 * calculateLTVImpact, forecastChurn) have no side effects and operate on caller-supplied data.
 * Only recordMetrics touches the DB.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  RetentionMetrics,
  ChurnAnalysis,
  ChurnReason,
  validateRetentionMetrics,
} from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

export class RetentionEngine {
  /**
   * Persist retention metrics for one cohort (workspace-scoped, DB-backed).
   * Throws ValidationError on invalid data or missing workspaceId.
   * Emits RETENTION_COHORT_RECORDED audit event.
   */
  static async recordMetrics(
    workspaceId: string,
    actorId: string,
    data: Partial<RetentionMetrics>
  ): Promise<RetentionMetrics> {
    if (!workspaceId) {
      throw new ValidationError("Workspace ID is required for retention metrics");
    }

    const validation = validateRetentionMetrics(data);
    if (!validation.valid) {
      throw new ValidationError(
        `Retention metrics validation failed: ${validation.errors.join("; ")}`
      );
    }

    const metrics: RetentionMetrics = {
      workspaceId,
      cohortMonth: data.cohortMonth!,
      cohortSize: data.cohortSize,
      monthlyRetention: data.monthlyRetention ?? {},
      avgMonthlyChurn: data.avgMonthlyChurn ?? 0,
    };

    const id = randomUUID();
    await db.retentionCohort.create({
      data: {
        id,
        workspaceId,
        cohortMonth: metrics.cohortMonth,
        cohortSize: metrics.cohortSize ?? null,
        monthlyRetention: metrics.monthlyRetention as object,
        avgMonthlyChurn: metrics.avgMonthlyChurn,
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RETENTION_COHORT_RECORDED,
      actorId,
      entityType: "retention_cohort",
      entityId: id,
      workspaceId,
      payload: {
        cohortMonth: metrics.cohortMonth,
        cohortSize: metrics.cohortSize ?? null,
        avgMonthlyChurn: metrics.avgMonthlyChurn,
      },
      visibility: "internal",
    });

    return metrics;
  }

  /**
   * List persisted retention cohorts for a workspace (workspace-scoped read).
   */
  static async listCohorts(workspaceId: string): Promise<RetentionMetrics[]> {
    if (!workspaceId) return [];

    const rows = await db.retentionCohort.findMany({
      where: { workspaceId },
      orderBy: { cohortMonth: "desc" },
    });

    return rows.map((r: typeof rows[number]) => ({
      workspaceId: r.workspaceId,
      cohortMonth: r.cohortMonth,
      cohortSize: r.cohortSize ?? undefined,
      monthlyRetention: r.monthlyRetention as Record<number, number>,
      avgMonthlyChurn: r.avgMonthlyChurn,
    }));
  }

  /**
   * Calculate cohort retention curve (% retained over months).
   * Pure function — no DB access.
   */
  static calculateRetentionCurve(
    workspaceId: string,
    monthlyRetention: Record<number, number>
  ): {
    curve: Array<{ month: number; retained: number }>;
    cliff: number;
  } {
    if (!workspaceId) {
      return { curve: [], cliff: 0 };
    }

    const months = Object.keys(monthlyRetention)
      .map((m) => parseInt(m))
      .sort((a, b) => a - b);

    const curve = months.map((month) => ({
      month,
      retained: Math.round(monthlyRetention[month] * 100),
    }));

    let maxDrop = 0;
    let cliffMonth = 0;

    for (let i = 1; i < months.length; i++) {
      const drop = monthlyRetention[months[i - 1]] - monthlyRetention[months[i]];
      if (drop > maxDrop) {
        maxDrop = drop;
        cliffMonth = months[i];
      }
    }

    return { curve, cliff: cliffMonth };
  }

  /**
   * Assess churn risk level for a cohort.
   * Pure function — no DB access.
   */
  static assessChurnRisk(
    workspaceId: string,
    metrics: RetentionMetrics
  ): {
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    churnScore: number;
    atRiskPercent: number;
    interventionUrgency: "IMMEDIATE" | "URGENT" | "PLANNED" | "MONITOR";
  } {
    if (!workspaceId) {
      return { riskLevel: "LOW", churnScore: 0, atRiskPercent: 0, interventionUrgency: "MONITOR" };
    }

    if (metrics.workspaceId && metrics.workspaceId !== workspaceId) {
      return { riskLevel: "LOW", churnScore: 0, atRiskPercent: 0, interventionUrgency: "MONITOR" };
    }

    const avgChurn = metrics.avgMonthlyChurn || 0;
    const churnScore = avgChurn * 100;
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    let interventionUrgency: "IMMEDIATE" | "URGENT" | "PLANNED" | "MONITOR";

    if (avgChurn >= 0.15) {
      riskLevel = "CRITICAL";
      interventionUrgency = "IMMEDIATE";
    } else if (avgChurn >= 0.1) {
      riskLevel = "HIGH";
      interventionUrgency = "URGENT";
    } else if (avgChurn > 0.05) {
      riskLevel = "MEDIUM";
      interventionUrgency = "PLANNED";
    } else {
      riskLevel = "LOW";
      interventionUrgency = "MONITOR";
    }

    return {
      riskLevel,
      churnScore: Math.round(churnScore),
      atRiskPercent: Math.round(avgChurn * 100),
      interventionUrgency,
    };
  }

  /**
   * Analyze churn pattern and identify contributing factors.
   * Pure function — no DB access.
   */
  static analyzeChurnPattern(
    workspaceId: string,
    monthlyRetention: Record<number, number>,
    hypothesizedReasons: Partial<Record<ChurnReason, number>>
  ): ChurnAnalysis {
    if (!workspaceId) {
      return { predictedChurnRate: 0, topReasons: [], riskSegments: [], interventions: [] };
    }

    const retentionValues = Object.values(monthlyRetention).filter((v) => v != null);
    const avgRetention =
      retentionValues.length > 0
        ? retentionValues.reduce((a, b) => a + b) / retentionValues.length
        : 1;
    const predictedChurnRate = 1 - avgRetention;

    const topReasons = Object.entries(hypothesizedReasons || {})
      .map(([reason, weight]) => ({ reason: reason as ChurnReason, weight: Math.min(1, Math.max(0, weight || 0)) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    const riskSegments: string[] = [];
    if (predictedChurnRate > 0.1) riskSegments.push("Early cohorts (month 1-3)");
    if (topReasons.some((r) => r.reason === ChurnReason.PRICE_SENSITIVITY))
      riskSegments.push("Price-sensitive segment");
    if (topReasons.some((r) => r.reason === ChurnReason.FEATURE_LACK))
      riskSegments.push("Feature-dependent users");

    const interventions: string[] = [];
    if (topReasons[0]?.reason === ChurnReason.PRODUCT_UNFIT)
      interventions.push("Product fit assessment and onboarding improvement");
    if (topReasons[0]?.reason === ChurnReason.PRICE_SENSITIVITY)
      interventions.push("Pricing tier review and retention discount program");
    if (topReasons[0]?.reason === ChurnReason.SUPPORT_ISSUE)
      interventions.push("Support quality audit and response time improvement");

    return {
      predictedChurnRate: Math.round(predictedChurnRate * 100) / 100,
      topReasons,
      riskSegments,
      interventions,
    };
  }

  /**
   * Calculate lifetime value impact of churn.
   * Pure function — no DB access.
   */
  static calculateLTVImpact(
    workspaceId: string,
    cohortSize: number,
    monthlyRetention: Record<number, number>,
    avgMonthlyValue: number
  ): {
    totalLTV: number;
    actualLTV: number;
    churnadjustedLTVPercent: number;
    ltvRecoveryPotential: number;
  } {
    if (!workspaceId || cohortSize <= 0 || avgMonthlyValue <= 0) {
      return { totalLTV: 0, actualLTV: 0, churnadjustedLTVPercent: 0, ltvRecoveryPotential: 0 };
    }

    const months = Object.keys(monthlyRetention).length || 12;
    const totalLTV = cohortSize * avgMonthlyValue * months;

    let actualLTV = 0;
    const retentionMonths = Object.entries(monthlyRetention).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

    if (retentionMonths.length > 0) {
      retentionMonths.forEach(([, rate]) => {
        actualLTV += cohortSize * (rate || 0) * avgMonthlyValue;
      });
    } else {
      actualLTV = totalLTV;
    }

    const churnadjustedLTVPercent = totalLTV > 0 ? (actualLTV / totalLTV) * 100 : 0;

    return {
      totalLTV: Math.round(totalLTV),
      actualLTV: Math.round(actualLTV),
      churnadjustedLTVPercent: Math.round(churnadjustedLTVPercent),
      ltvRecoveryPotential: Math.round(totalLTV - actualLTV),
    };
  }

  /**
   * Predict next-month churn based on historical trend.
   * Pure function — no DB access.
   */
  static forecastChurn(
    workspaceId: string,
    monthlyRetention: Record<number, number>,
    _trendDays: number = 90
  ): {
    projectedChurnRate: number;
    confidence: number;
    trend: "IMPROVING" | "STABLE" | "DECLINING";
  } {
    if (!workspaceId) {
      return { projectedChurnRate: 0, confidence: 0, trend: "STABLE" };
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

    const recent = monthlyRetention[months[months.length - 1]] || 0;
    const previous = monthlyRetention[months[months.length - 2]] || 0;
    const trend: "IMPROVING" | "STABLE" | "DECLINING" =
      recent > previous ? "IMPROVING" : recent < previous ? "DECLINING" : "STABLE";

    return {
      projectedChurnRate: Math.max(0, Math.min(1, 1 - recent)),
      confidence: Math.min(0.9, 0.3 + months.length * 0.1),
      trend,
    };
  }
}
