/**
 * ADDENDUM F: Owner Briefing Engine
 *
 * Aggregates business intelligence, recommendations, and action items for owner briefing.
 * Calculates summary metrics across decisions, actions, and outcomes.
 *
 * Non-DB: Contains only aggregation logic and mock data (no persistence).
 * Ready for: Integration with briefing API once database available.
 */

import { z } from "zod";

// ============================================================================
// BRIEFING CONTRACTS
// ============================================================================

/** Key metric summary */
export const KeyMetricSchema = z.object({
  metricName: z.string(),
  currentValue: z.number(),
  previousValue: z.number().optional(),
  targetValue: z.number().optional(),
  unit: z.string(),
  trend: z.enum(["up", "down", "stable", "unknown"]),
  performanceVsTarget: z.number().optional(), // percentage vs target
});

export type KeyMetric = z.infer<typeof KeyMetricSchema>;

/** Priority-ranked action item */
export const BriefingActionItemSchema = z.object({
  actionId: z.string(),
  title: z.string(),
  description: z.string(),
  dueDate: z.date(),
  owner: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["not_started", "in_progress", "at_risk", "on_track", "completed"]),
  impactScore: z.number().min(0).max(100),
  completionPercentage: z.number().min(0).max(100),
  risks: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export type BriefingActionItem = z.infer<typeof BriefingActionItemSchema>;

/** Decision summary for briefing */
export const BriefingDecisionSchema = z.object({
  decisionId: z.string(),
  title: z.string(),
  context: z.string(),
  recommendedAction: z.string(),
  expectedROI: z.number(),
  riskLevel: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["pending", "approved", "rejected", "executing", "completed"]),
  deadline: z.date().optional(),
  stakeholders: z.array(z.string()),
  supportingData: z.record(z.string(), z.any()),
});

export type BriefingDecision = z.infer<typeof BriefingDecisionSchema>;

/** Owner briefing summary */
export const OwnerBriefingSchema = z.object({
  briefingId: z.string(),
  workspaceId: z.string(),
  generatedAt: z.date(),
  executiveSummary: z.string(),
  timeHorizon: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]),
  keyMetrics: z.array(KeyMetricSchema),
  criticalIssues: z.array(
    z.object({
      issue: z.string(),
      impact: z.enum(["revenue", "customer", "operation", "compliance"]),
      severity: z.enum(["critical", "high", "medium"]),
      recommendedAction: z.string(),
    }),
  ),
  topPriorities: z.array(BriefingActionItemSchema),
  criticalDecisions: z.array(BriefingDecisionSchema),
  opportunities: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      potentialValue: z.number(),
      timeframe: z.string(),
      resourcesRequired: z.string(),
    }),
  ),
  riskSummary: z.object({
    criticalRiskCount: z.number(),
    highRiskCount: z.number(),
    averageRiskScore: z.number().min(0).max(1),
    topRisks: z.array(
      z.object({
        risk: z.string(),
        likelihood: z.enum(["very_low", "low", "medium", "high", "very_high"]),
        impact: z.number().min(0).max(100),
        mitigation: z.string(),
      }),
    ),
  }),
  performanceVsTargets: z.object({
    metricsOnTrack: z.number(),
    metricsAtRisk: z.number(),
    metricsBelowTarget: z.number(),
  }),
  recommendations: z.array(
    z.object({
      recommendation: z.string(),
      rationale: z.string(),
      expectedOutcome: z.string(),
      timeframeMonths: z.number(),
    }),
  ),
  nextReviewDate: z.date(),
});

export type OwnerBriefing = z.infer<typeof OwnerBriefingSchema>;

/** Briefing comparison (current vs previous period) */
export const BriefingComparisonSchema = z.object({
  briefingId: z.string(),
  currentBriefing: OwnerBriefingSchema,
  previousBriefing: OwnerBriefingSchema.optional(),
  metricTrends: z.array(
    z.object({
      metricName: z.string(),
      currentValue: z.number(),
      previousValue: z.number(),
      change: z.number(),
      changePercent: z.number(),
      trend: z.enum(["improving", "declining", "stable"]),
    }),
  ),
  statusChanges: z.object({
    decisionsApproved: z.number(),
    decisionsRejected: z.number(),
    actionsCompleted: z.number(),
    newCriticalIssues: z.number(),
    resolvedCriticalIssues: z.number(),
  }),
});

export type BriefingComparison = z.infer<typeof BriefingComparisonSchema>;

// ============================================================================
// AGGREGATION ALGORITHMS
// ============================================================================

/**
 * Aggregate key metrics from raw data
 */
export function aggregateKeyMetrics(data: Array<{ name: string; current: number; previous?: number; target?: number; unit: string }>): KeyMetric[] {
  return data.map((d) => {
    const trend = d.previous === undefined ? "unknown" : d.current > d.previous ? "up" : d.current < d.previous ? "down" : "stable";

    const performanceVsTarget = d.target ? ((d.current - d.target) / d.target) * 100 : undefined;

    return {
      metricName: d.name,
      currentValue: d.current,
      previousValue: d.previous,
      targetValue: d.target,
      unit: d.unit,
      trend,
      performanceVsTarget,
    };
  });
}

/**
 * Identify critical issues from data
 */
export function identifyCriticalIssues(
  records: Array<{
    type: string;
    status: string;
    riskLevel?: string;
    metric?: string;
    value?: number;
    target?: number;
  }>,
): Array<{
  issue: string;
  impact: "revenue" | "customer" | "operation" | "compliance";
  severity: "critical" | "high" | "medium";
  recommendedAction: string;
}> {
  const issues: Array<{
    issue: string;
    impact: "revenue" | "customer" | "operation" | "compliance";
    severity: "critical" | "high" | "medium";
    recommendedAction: string;
  }> = [];

  // Check for high-risk/critical status items
  const criticalRecords = records.filter((r) => r.riskLevel === "critical" || r.status === "failed" || r.status === "blocked");

  for (const record of criticalRecords) {
    let impactType = "operation";
    const severity = "critical";
    let recommendation = "Review immediately";

    if (record.type === "financial" || record.metric?.includes("revenue")) {
      impactType = "revenue";
      recommendation = "Escalate to finance team";
    } else if (record.type === "customer" || record.metric?.includes("satisfaction")) {
      impactType = "customer";
      recommendation = "Engage customer success team";
    } else if (record.type === "compliance") {
      impactType = "compliance";
      recommendation = "Engage legal/compliance";
    }

    issues.push({
      issue: `${record.type}: ${record.status || record.riskLevel}`,
      impact: impactType as "revenue" | "customer" | "operation" | "compliance",
      severity: severity as "critical" | "high" | "medium",
      recommendedAction: recommendation,
    });
  }

  // Check for metrics below targets
  const belowTarget = records.filter((r) => r.value && r.target && r.value < r.target * 0.9);
  for (const record of belowTarget) {
    issues.push({
      issue: `${record.metric} is ${Math.round(((record.target! - record.value!) / record.target!) * 100)}% below target`,
      impact: "operation",
      severity: "high",
      recommendedAction: "Investigate root cause and develop remediation plan",
    });
  }

  return issues;
}

/**
 * Prioritize action items
 */
export function prioritizeActions(
  actions: Array<Omit<BriefingActionItem, "impactScore"> & { estimatedImpact: number }>,
): BriefingActionItem[] {
  // Score each action: priority weight + impact + urgency
  const scored = actions.map((action) => {
    const priorityWeight = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25,
    };

    const daysUntilDue = Math.max(0, (action.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const urgencyScore = Math.max(0, 100 - daysUntilDue); // 100 for today, 0 for >100 days away

    const impactScore = Math.round((action.estimatedImpact / 100) * 40 + (priorityWeight[action.priority] / 100) * 35 + (urgencyScore / 100) * 25);

    return {
      ...action,
      impactScore: Math.min(100, impactScore),
    };
  });

  // Sort by impact score descending
  return scored.sort((a, b) => b.impactScore - a.impactScore);
}

/**
 * Summarize risk profile
 */
export function summarizeRisks(
  records: Array<{
    id: string;
    riskLevel: string;
    risks?: string[];
    likelihood?: string;
    impact?: number;
  }>,
): OwnerBriefing["riskSummary"] {
  const criticalRisks = records.filter((r) => r.riskLevel === "critical");
  const highRisks = records.filter((r) => r.riskLevel === "high");

  const allRisks = records.flatMap((r) => r.risks || []);
  const avgRiskScore = records.length > 0 ? records.filter((r) => r.impact).reduce((sum, r) => sum + (r.impact || 0), 0) / records.length / 100 : 0;

  // Extract top risks
  const topRisks = records
    .filter((r) => r.risks && r.risks.length > 0)
    .slice(0, 5)
    .flatMap((r) =>
      (r.risks || []).map((risk) => ({
        risk,
        likelihood: (r.likelihood as "very_low" | "low" | "medium" | "high" | "very_high") || "medium",
        impact: r.impact || 50,
        mitigation: "TBD - engage team lead",
      })),
    );

  return {
    criticalRiskCount: criticalRisks.length,
    highRiskCount: highRisks.length,
    averageRiskScore: Math.round(avgRiskScore * 100) / 100,
    topRisks,
  };
}

/**
 * Generate comprehensive owner briefing
 */
export function generateOwnerBriefing(params: {
  workspaceId: string;
  timeHorizon: "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  keyMetricsData: Array<{ name: string; current: number; previous?: number; target?: number; unit: string }>;
  issues: Array<{
    type: string;
    status: string;
    riskLevel?: string;
    metric?: string;
    value?: number;
    target?: number;
  }>;
  actionItems: Array<Omit<BriefingActionItem, "impactScore"> & { estimatedImpact: number }>;
  decisions: BriefingDecision[];
  opportunities: Array<{ title: string; description: string; potentialValue: number; timeframe: string; resourcesRequired: string }>;
  risks: Array<{
    id: string;
    riskLevel: string;
    risks?: string[];
    likelihood?: string;
    impact?: number;
  }>;
}): OwnerBriefing {
  const keyMetrics = aggregateKeyMetrics(params.keyMetricsData);
  const criticalIssues = identifyCriticalIssues(params.issues).slice(0, 5);
  const topPriorities = prioritizeActions(params.actionItems).slice(0, 7);
  const riskSummary = summarizeRisks(params.risks);

  // Calculate performance vs targets
  const metricsOnTrack = keyMetrics.filter((m) => !m.performanceVsTarget || m.performanceVsTarget >= -10).length;
  const metricsAtRisk = keyMetrics.filter((m) => m.performanceVsTarget && m.performanceVsTarget < -10 && m.performanceVsTarget >= -30).length;
  const metricsBelowTarget = keyMetrics.filter((m) => m.performanceVsTarget && m.performanceVsTarget < -30).length;

  // Generate executive summary
  const criticalCount = criticalIssues.filter((i) => i.severity === "critical").length;
  const executiveSummary =
    criticalCount > 0
      ? `${criticalCount} critical issues require immediate attention. ${topPriorities.length} high-priority actions identified.`
      : `Operations running smoothly. ${topPriorities.length} improvement opportunities identified.`;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + (params.timeHorizon === "daily" ? 1 : params.timeHorizon === "weekly" ? 7 : 30));

  return {
    briefingId: `briefing_${Date.now()}`,
    workspaceId: params.workspaceId,
    generatedAt: new Date(),
    executiveSummary,
    timeHorizon: params.timeHorizon,
    keyMetrics,
    criticalIssues,
    topPriorities,
    criticalDecisions: params.decisions.slice(0, 5),
    opportunities: params.opportunities.slice(0, 5),
    riskSummary,
    performanceVsTargets: {
      metricsOnTrack,
      metricsAtRisk,
      metricsBelowTarget,
    },
    recommendations: topPriorities
      .slice(0, 3)
      .map((action) => ({
        recommendation: action.title,
        rationale: action.description,
        expectedOutcome: `Complete ${action.title} to improve overall performance`,
        timeframeMonths: Math.ceil((action.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)),
      })),
    nextReviewDate,
  };
}

/**
 * Compare two briefings to identify trends
 */
export function compareBriefings(current: OwnerBriefing, previous?: OwnerBriefing): BriefingComparison {
  const metricTrends: Array<{
    metricName: string;
    currentValue: number;
    previousValue: number;
    change: number;
    changePercent: number;
    trend: "improving" | "declining" | "stable";
  }> =
    previous && previous.keyMetrics
      ? current.keyMetrics.map((metric) => {
          const prevMetric = previous.keyMetrics.find((m) => m.metricName === metric.metricName);
          const previousValue = prevMetric?.currentValue ?? metric.currentValue;
          const change = metric.currentValue - previousValue;
          const changePercent = previousValue > 0 ? (change / previousValue) * 100 : 0;

          return {
            metricName: metric.metricName,
            currentValue: metric.currentValue,
            previousValue,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            trend: change > 0 ? "improving" : change < 0 ? "declining" : "stable",
          };
        })
      : [];

  const statusChanges = {
    decisionsApproved: current.criticalDecisions.filter((d) => d.status === "approved").length,
    decisionsRejected: current.criticalDecisions.filter((d) => d.status === "rejected").length,
    actionsCompleted: current.topPriorities.filter((a) => a.status === "completed").length,
    newCriticalIssues: current.criticalIssues.filter((i) => i.severity === "critical").length,
    resolvedCriticalIssues: previous?.criticalIssues.length ? previous.criticalIssues.filter((i) => i.severity === "critical").length - current.criticalIssues.filter((i) => i.severity === "critical").length : 0,
  };

  return {
    briefingId: current.briefingId,
    currentBriefing: current,
    previousBriefing: previous,
    metricTrends,
    statusChanges,
  };
}

/**
 * Generate mock owner briefing for testing
 */
export function generateMockOwnerBriefing(): OwnerBriefing {
  const now = new Date();

  return generateOwnerBriefing({
    workspaceId: "ws_test",
    timeHorizon: "weekly",
    keyMetricsData: [
      { name: "Revenue Run Rate", current: 250000, previous: 240000, target: 300000, unit: "USD" },
      { name: "Customer Satisfaction", current: 87, previous: 85, target: 90, unit: "%" },
      { name: "On-Time Delivery Rate", current: 94, previous: 92, target: 98, unit: "%" },
      { name: "Critical Defects", current: 2, previous: 5, target: 0, unit: "count" },
    ],
    issues: [
      { type: "financial", status: "at_risk", riskLevel: "high", metric: "gross_margin", value: 45, target: 50 },
      { type: "customer", status: "pending", metric: "churn_rate", value: 3.2, target: 2.0 },
    ],
    actionItems: [
      {
        actionId: "act_1",
        title: "Q2 Revenue Target Recovery",
        description: "Implement 3 new features to address customer requests",
        dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        owner: "Sarah Chen",
        priority: "critical",
        status: "in_progress",
        completionPercentage: 60,
        estimatedImpact: 85,
        risks: ["Engineering capacity constraint"],
        nextSteps: ["Complete backend API", "QA testing", "Deploy to production"],
      },
      {
        actionId: "act_2",
        title: "Customer Retention Program",
        description: "Launch personalized outreach to high-value accounts",
        dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        owner: "James Wilson",
        priority: "high",
        status: "on_track",
        completionPercentage: 25,
        estimatedImpact: 70,
        risks: [],
        nextSteps: ["Segment high-value accounts", "Develop messaging", "Launch campaign"],
      },
    ],
    decisions: [
      {
        decisionId: "dec_1",
        title: "Expand to European Market",
        context: "Current growth rate limiting revenue potential",
        recommendedAction: "Open regional office in Berlin",
        expectedROI: 450000,
        riskLevel: "high",
        status: "pending",
        deadline: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
        stakeholders: ["CEO", "CFO", "VP Sales"],
        supportingData: { market_size: 12000000, competition: "moderate" },
      },
    ],
    opportunities: [
      {
        title: "AI-Powered Customer Insights",
        description: "Implement ML model for predictive analytics",
        potentialValue: 500000,
        timeframe: "Q3 2026",
        resourcesRequired: "1 ML engineer, 3 months",
      },
    ],
    risks: [
      {
        id: "risk_1",
        riskLevel: "high",
        risks: ["Key person dependency on VP Engineering"],
        likelihood: "high",
        impact: 80,
      },
      {
        id: "risk_2",
        riskLevel: "medium",
        risks: ["Supply chain disruption affecting product availability"],
        likelihood: "medium",
        impact: 40,
      },
    ],
  });
}
