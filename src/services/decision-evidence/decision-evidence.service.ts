import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { calculateExecutionCertainty } from "../execution-certainty";
import { detectExecutionDrift } from "../execution-drift/execution-drift.service";
import { computeDecisionConfidence } from "../decision-confidence/decision-confidence.service";
import { generateBusinessImpact } from "../business-impact/business-impact.service";
import { normalizeFinancialImpact } from "../financial-normalization/financial-normalization.service";
import { getPrimaryDecision } from "../decision-control/decision-control.service";

export interface DecisionEvidenceAction {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate?: string;
  isOverdue?: boolean;
  isBlocked?: boolean;
}

export interface DecisionEvidenceFinding {
  id: string;
  title: string;
  severity: string;
  status: string;
  verified: boolean;
}

export interface DecisionEvidenceRecommendation {
  id: string;
  title: string;
  priority: string;
  status: string;
}

export interface ConfidenceBreakdown {
  executionCertainty: number;
  dataCompleteness: number;
  riskLevel: number;
  overallScore: number;
}

export interface ImpactBasis {
  financial: number | null;
  timelineToFailureHours: number | null;
  recoveryProbabilityPct: number;
  driftSeverityScore: number;
}

export interface DecisionEvidence {
  decisionId: string;
  engagementId: string;
  engagementCode: string;
  decisionType: "immediate" | "urgent" | "recommended";
  generatedAt: string;
  inputs: {
    actions: {
      total: number;
      overdue: number;
      blocked: number;
      critical: number;
      items: DecisionEvidenceAction[];
    };
    findings: {
      total: number;
      critical: number;
      unresolved: number;
      items: DecisionEvidenceFinding[];
    };
    recommendations: {
      total: number;
      open: number;
      highPriority: number;
      items: DecisionEvidenceRecommendation[];
    };
    metrics: {
      executionCertaintyScore: number;
      driftDetected: boolean;
      driftSeverity: string | null;
      healthStatus: string;
      decisionConfidenceScore: number;
      businessImpactLevel: string;
      revenueAtRiskPct: number | null;
    };
  };
  reasoning: {
    triggers: string[];
    rulesApplied: string[];
    priorityLogic: string;
  };
  confidenceBreakdown: ConfidenceBreakdown;
  impactBasis: ImpactBasis;
}

export async function getDecisionEvidence(engagementId: string): Promise<DecisionEvidence> {
  // Fetch all required data in parallel
  const [
    engagement,
    actions,
    findings,
    recommendations,
    condition,
    primaryDecision,
    drift,
    decisionConfidence,
    businessImpactResult,
  ] = await Promise.all([
    db.engagement.findUnique({ where: { id: engagementId } }),
    db.action.findMany({ where: { engagementId } }),
    db.finding.findMany({ where: { engagementId } }),
    db.recommendation.findMany({ where: { engagementId } }),
    db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true },
      orderBy: { createdAt: "desc" },
    }),
    getPrimaryDecision(engagementId),
    detectExecutionDrift(engagementId),
    computeDecisionConfidence({ engagementId }),
    generateBusinessImpact(engagementId, engagementId),
  ]);

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Map actions for evidence
  const now = new Date();
  const evidenceActions = actions.map((a: typeof actions[0]) => ({
    id: a.id,
    title: a.title,
    priority: a.priority,
    status: a.status,
    dueDate: a.dueDate?.toISOString(),
    isOverdue: a.dueDate ? a.dueDate < now : false,
    isBlocked: a.status === "blocked",
  }));

  // Categorize actions
  const overdueActions = evidenceActions.filter((a: typeof evidenceActions[0]) => a.isOverdue);
  const blockedActions = evidenceActions.filter((a: typeof evidenceActions[0]) => a.isBlocked);
  const criticalActions = evidenceActions.filter((a: typeof evidenceActions[0]) => a.priority === "critical");

  // Map findings for evidence
  const evidenceFindings = findings.map((f: typeof findings[0]) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    status: f.status,
    verified: f.verified ?? false,
  }));

  // Categorize findings
  const criticalFindings = evidenceFindings.filter((f: typeof evidenceFindings[0]) => f.severity === "critical");
  const unresolvedFindings = evidenceFindings.filter((f: typeof evidenceFindings[0]) => f.status !== "resolved" && f.status !== "closed");

  // Map recommendations for evidence
  const evidenceRecommendations = recommendations.map((r: typeof recommendations[0]) => ({
    id: r.id,
    title: r.title,
    priority: r.priority,
    status: r.status,
  }));

  // Categorize recommendations
  const openRecommendations = evidenceRecommendations.filter((r: typeof evidenceRecommendations[0]) => r.status !== "completed" && r.status !== "cancelled");
  const highPriorityRecs = openRecommendations.filter((r: typeof evidenceRecommendations[0]) => r.priority === "high" || r.priority === "critical");

  // Get financial impact for evidence
  const financialImpactNormalized = normalizeFinancialImpact({
    estimatedLoss: businessImpactResult?.estimatedLoss ?? null,
    revenue: condition?.estimatedMonthlyRevenue ?? null,
  });

  // Build triggers array - explains WHY this decision was made
  const triggers: string[] = [];
  if (drift.driftDetected && drift.severity === "critical") {
    triggers.push("Critical execution drift detected");
  }
  if (overdueActions.length > 0) {
    triggers.push(`${overdueActions.length} critical action(s) overdue`);
  }
  if (blockedActions.length > 0 && criticalFindings.length > 0) {
    triggers.push(`${blockedActions.length} blocked critical action(s) with unresolved findings`);
  }
  if (decisionConfidence.level === "low" && criticalFindings.length > 0) {
    triggers.push("Low decision confidence with unresolved critical findings");
  }
  if (criticalFindings.length > 0) {
    triggers.push(`${criticalFindings.length} unresolved critical finding(s)`);
  }
  if (triggers.length === 0 && openRecommendations.length > 0) {
    triggers.push("Open high-priority recommendations awaiting review");
  }
  if (triggers.length === 0) {
    triggers.push("Engagement tracking normally - no critical issues detected");
  }

  // Build rules applied array - explains HOW the decision was made
  const rulesApplied: string[] = [];
  rulesApplied.push("Rule 1: Critical drift → immediate decision");
  rulesApplied.push("Rule 2: Overdue critical actions → immediate decision");
  rulesApplied.push("Rule 3: Blocked critical + unresolved critical findings → urgent decision");
  rulesApplied.push("Rule 4: Low confidence + critical findings → urgent decision");
  rulesApplied.push("Rule 5: Unresolved critical findings → recommended decision");
  rulesApplied.push("Rule 6: Open high-priority recommendations → recommended decision");

  // Priority logic explanation
  const priorityLogic =
    "Priority Order: (1) Critical Drift > (2) Overdue Critical Actions > (3) Blocked Critical + Findings > " +
    "(4) Low Confidence + Findings > (5) Unresolved Findings > (6) Open Recommendations > (7) Normal";

  // Calculate confidence breakdown
  const executionCertaintyData = calculateExecutionCertainty(
    engagementId,
    findings.map((f: typeof findings[0]) => ({
      id: f.id,
      severity: (f.severity as "critical" | "high" | "medium" | "low") || "low",
      resolved: f.status === "resolved" || f.status === "closed",
      verified: f.verified ?? false,
    })),
    recommendations.map((r: typeof recommendations[0]) => ({
      id: r.id,
      priority: (r.priority as "critical" | "high" | "medium" | "low") || "medium",
      status: (r.status as "blocked" | "in_progress" | "completed") || "in_progress",
    })),
    actions.map((a: typeof actions[0]) => ({
      id: a.id,
      priority: (a.priority as "critical" | "high" | "medium" | "low") || "medium",
      status: (a.status as "blocked" | "pending" | "in_progress" | "completed" | "verified") || "pending",
    })),
    [],
    {
      overallStatus: (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") || "stable",
      kpiTrend: "flat" as const,
    }
  );

  // Data completeness score (0-100)
  // Measures whether we have sufficient data to make the decision
  const dataCompleteness = Math.min(
    100,
    Math.round(
      ((actions.length > 0 ? 20 : 0) +
        (findings.length > 0 ? 20 : 0) +
        (recommendations.length > 0 ? 15 : 0) +
        (condition ? 15 : 0) +
        (drift.driftDetected ? 15 : 0) +
        (decisionConfidence.score > 0 ? 15 : 0)) /
        3
    )
  );

  // Risk level (0-100): higher = more risky
  const riskLevel = Math.min(
    100,
    Math.round(
      (criticalFindings.length * 20 +
        blockedActions.length * 15 +
        overdueActions.length * 10 +
        (drift.severity === "critical" ? 25 : drift.severity === "high" ? 15 : 0) +
        Math.max(0, 50 - decisionConfidence.score)) /
        5
    )
  );

  // Overall confidence score (0-100)
  // Weighted: 40% execution certainty + 30% decision confidence + 20% data completeness - 10% risk
  const overallScore = Math.round(
    (executionCertaintyData.score * 0.4 + decisionConfidence.score * 0.3 + dataCompleteness * 0.2 - riskLevel * 0.1)
  );

  // Timeline to failure in hours (estimate)
  let timelineToFailureHours: number | null = null;
  if (businessImpactResult?.timeImpact?.timelineToFailure) {
    timelineToFailureHours = businessImpactResult.timeImpact.timelineToFailure * 24;
  } else if (drift.driftDetected && drift.severity === "critical") {
    timelineToFailureHours = 72; // 3 days for critical drift
  }

  // Drift severity score (0-100)
  const driftSeverityScore =
    drift.severity === "critical" ? 100 : drift.severity === "high" ? 75 : drift.severity === "medium" ? 50 : 25;

  // Recovery probability percentage
  const recoveryProbabilityPct =
    criticalFindings.length >= 3
      ? 20
      : blockedActions.length >= 3
        ? 30
        : criticalFindings.length > 0 || blockedActions.length > 0
          ? 50
          : 80;

  return {
    decisionId: primaryDecision.decisionId,
    engagementId: engagement.id,
    engagementCode: engagement.code,
    decisionType: primaryDecision.type,
    generatedAt: new Date().toISOString(),
    inputs: {
      actions: {
        total: actions.length,
        overdue: overdueActions.length,
        blocked: blockedActions.length,
        critical: criticalActions.length,
        items: evidenceActions,
      },
      findings: {
        total: findings.length,
        critical: criticalFindings.length,
        unresolved: unresolvedFindings.length,
        items: evidenceFindings,
      },
      recommendations: {
        total: recommendations.length,
        open: openRecommendations.length,
        highPriority: highPriorityRecs.length,
        items: evidenceRecommendations,
      },
      metrics: {
        executionCertaintyScore: executionCertaintyData.score,
        driftDetected: drift.driftDetected,
        driftSeverity: drift.driftDetected ? drift.severity : null,
        healthStatus: engagement.healthStatus,
        decisionConfidenceScore: decisionConfidence.score,
        businessImpactLevel: businessImpactResult?.impactLevel ?? "unknown",
        revenueAtRiskPct: financialImpactNormalized.revenueAtRiskPct,
      },
    },
    reasoning: {
      triggers,
      rulesApplied,
      priorityLogic,
    },
    confidenceBreakdown: {
      executionCertainty: executionCertaintyData.score,
      dataCompleteness,
      riskLevel,
      overallScore,
    },
    impactBasis: {
      financial: businessImpactResult?.estimatedLoss ?? null,
      timelineToFailureHours,
      recoveryProbabilityPct,
      driftSeverityScore,
    },
  };
}
