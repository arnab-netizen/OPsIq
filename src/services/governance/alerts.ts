/**
 * Governance Alert Rules Engine
 * Generates warnings based on real metrics and lifecycle data
 * Deterministic: same input = same output, no side effects
 */

import { GovernanceMetrics } from "@/services/governance/metrics";
import { ObservabilitySummary } from "@/services/observability/statistics";
import {
  GOVERNANCE_ALERT_THRESHOLDS,
  GovernanceAlertThresholds,
} from "./alert-config";

export type AlertSeverity = "info" | "warning" | "critical";

export interface GovernanceAlert {
  id: string; // Unique alert identifier
  severity: AlertSeverity;
  rule: string; // Name of the rule that triggered
  title: string; // Human-readable alert title
  message: string; // Detailed message
  metric: string; // Which metric this is about
  current: number; // Current value
  threshold: number; // Threshold value
  timestamp: Date; // When alert was generated
}

export interface GovernanceAlerts {
  workspace: {
    workspaceId: string;
  };
  period: {
    timeRange: "last24h" | "last7d";
    alerts: GovernanceAlert[];
    hasAlerts: boolean;
    alertCount: number;
    criticalCount: number;
    warningCount: number;
  };
}

/**
 * Evaluate governance metrics against alert thresholds
 * Returns warnings only; does not modify any state
 */
export function evaluateGovernanceAlerts(
  workspaceId: string,
  metrics: GovernanceMetrics,
  summary: ObservabilitySummary,
  thresholds: GovernanceAlertThresholds = GOVERNANCE_ALERT_THRESHOLDS,
  period: "last24h" | "last7d" = "last24h"
): GovernanceAlerts {
  const alerts: GovernanceAlert[] = [];
  const summaryPeriod = summary.period[period];
  // Calculate total events for error rate
  const totalEvents = summaryPeriod.lifecycleCounts.reduce((sum, c) => sum + c.count, 0);
  const errorRate =
    totalEvents > 0 ? (summaryPeriod.errorCount / totalEvents) * 100 : 0;

  // Calculate slow run rate
  let slowRunCount = 0;
  const stageDurationsWithCount = summaryPeriod.stageDurations.filter(
    (s) => s.avgDurationMs > thresholds.slowRunDurationMs
  );
  stageDurationsWithCount.forEach((stage) => {
    slowRunCount += stage.count || 0;
  });
  const slowRunRate =
    totalEvents > 0 ? (slowRunCount / totalEvents) * 100 : 0;

  // Rule 1: Overall block rate threshold
  if (metrics.blockRates.overallBlockRate > thresholds.overallBlockRateThreshold) {
    alerts.push({
      id: "alert_overall_block_rate",
      severity: "warning",
      rule: "OVERALL_BLOCK_RATE",
      title: "High Decision Block Rate",
      message: `Overall block rate is ${metrics.blockRates.overallBlockRate}%, exceeding threshold of ${thresholds.overallBlockRateThreshold}%. This indicates many decisions are being blocked.`,
      metric: "overallBlockRate",
      current: metrics.blockRates.overallBlockRate,
      threshold: thresholds.overallBlockRateThreshold,
      timestamp: new Date(),
    });
  }

  // Rule 2: Guardrail block rate threshold
  if (metrics.blockRates.guardrailBlockRate > thresholds.guardrailBlockRateThreshold) {
    alerts.push({
      id: "alert_guardrail_block_rate",
      severity: "warning",
      rule: "GUARDRAIL_BLOCK_RATE",
      title: "High Guardrail Block Rate",
      message: `Guardrail block rate is ${metrics.blockRates.guardrailBlockRate}%, exceeding threshold of ${thresholds.guardrailBlockRateThreshold}%. Most blocks are coming from guardrail violations.`,
      metric: "guardrailBlockRate",
      current: metrics.blockRates.guardrailBlockRate,
      threshold: thresholds.guardrailBlockRateThreshold,
      timestamp: new Date(),
    });
  }

  // Rule 3: Low confidence in blocked decisions (inverse threshold)
  if (
    metrics.confidence.avgConfidenceBlocked !== null &&
    metrics.confidence.avgConfidenceBlocked < thresholds.minAvgConfidenceBlocked
  ) {
    alerts.push({
      id: "alert_low_blocked_confidence",
      severity: "critical",
      rule: "LOW_BLOCKED_CONFIDENCE",
      title: "Low Confidence in Blocked Decisions",
      message: `Average confidence in blocked decisions is ${metrics.confidence.avgConfidenceBlocked}, below minimum threshold of ${thresholds.minAvgConfidenceBlocked}. This suggests unclear or inconsistent blocking criteria.`,
      metric: "avgConfidenceBlocked",
      current: metrics.confidence.avgConfidenceBlocked,
      threshold: thresholds.minAvgConfidenceBlocked,
      timestamp: new Date(),
    });
  }

  // Rule 4: Error rate threshold
  if (errorRate > thresholds.errorRateThreshold) {
    alerts.push({
      id: "alert_error_rate",
      severity: "critical",
      rule: "ERROR_RATE",
      title: "High Error Rate",
      message: `Error rate is ${errorRate.toFixed(2)}%, exceeding threshold of ${thresholds.errorRateThreshold}%. Many decision runs are encountering errors.`,
      metric: "errorRate",
      current: errorRate,
      threshold: thresholds.errorRateThreshold,
      timestamp: new Date(),
    });
  }

  // Rule 5: Slow run rate threshold
  if (slowRunRate > thresholds.slowRunRateThreshold) {
    alerts.push({
      id: "alert_slow_run_rate",
      severity: "info",
      rule: "SLOW_RUN_RATE",
      title: "High Slow Run Rate",
      message: `${slowRunRate.toFixed(2)}% of runs exceed the slow threshold of ${thresholds.slowRunDurationMs}ms, exceeding threshold of ${thresholds.slowRunRateThreshold}%. Consider optimizing decision processing.`,
      metric: "slowRunRate",
      current: slowRunRate,
      threshold: thresholds.slowRunRateThreshold,
      timestamp: new Date(),
    });
  }

  // Count severity levels
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;

  return {
    workspace: {
      workspaceId,
    },
    period: {
      timeRange: period,
      alerts,
      hasAlerts: alerts.length > 0,
      alertCount: alerts.length,
      criticalCount,
      warningCount,
    },
  };
}
