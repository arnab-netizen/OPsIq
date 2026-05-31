import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { requireCapabilityForService } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { calculateExecutionCertainty, type ExecutionCertaintyResult } from "./execution-certainty";
import { detectExecutionDrift, type DriftDetectionResult } from "./execution-drift/execution-drift.service";
import { computeDecisionConfidence, type DecisionConfidenceResult } from "./decision-confidence/decision-confidence.service";
import { normalizeFinancialImpact, type FinancialImpactNormalized } from "./financial-normalization/financial-normalization.service";
import { generateBusinessImpact } from "./business-impact/business-impact.service";
import { getPrimaryDecision, type PrimaryDecision } from "./decision-control/decision-control.service";

export interface DashboardAction {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate?: string;
  urgency?: "overdue" | "due-soon" | "on-track";
}

export interface DashboardRecommendation {
  id: string;
  title: string;
  priority: string;
  status: string;
}

export interface NextBestAction {
  type: "action" | "recommendation" | "finding";
  id: string;
  title: string;
  reason: string;
  priority: string;
}

export interface BusinessImpact {
  summary: string;
  keyRisks: string[];
  opportunities: string[];
}

export interface OwnerDashboardData {
  engagementId: string;
  engagementCode: string;
  engagementTitle: string;
  status: string;
  healthStatus: string;
  interventionMode: string;
  executionCertainty: ExecutionCertaintyResult;
  drift: DriftDetectionResult;
  criticalBlockers: string[];
  overdueActions: DashboardAction[];
  criticalActions: DashboardAction[];
  openRecommendations: DashboardRecommendation[];
  nextBestAction: NextBestAction | null;
  businessImpact: BusinessImpact;
  primaryDecision?: PrimaryDecision;
  decisionConfidence?: DecisionConfidenceResult;
  financialImpactNormalized?: FinancialImpactNormalized;
  generatedAt: string;
}

export async function getOwnerDashboard(
  engagementId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<OwnerDashboardData> {
  // Enforce capability check
  requireCapabilityForService(authContext, CAPABILITIES.ENGAGEMENT_VIEW);

  // Fetch engagement with workspace scoping
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Fetch all related data in parallel with workspace scoping
  const [findings, recommendations, actions, condition] = await Promise.all([
    db.finding.findMany({
      where: { engagementId, engagement: { workspaceId } },
    }),
    db.recommendation.findMany({
      where: { engagementId, engagement: { workspaceId } },
    }),
    db.action.findMany({
      where: { engagementId, engagement: { workspaceId } },
    }),
    db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true, engagement: { workspaceId } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Map findings for execution certainty
  const findingsForCertainty = findings.map((f: typeof findings[0]) => ({
    id: f.id,
    severity: (f.severity as "critical" | "high" | "medium" | "low") || "low",
    resolved: f.status === "resolved" || f.status === "closed",
    verified: f.verified ?? false,
  }));

  // Map recommendations for execution certainty
  const recommendationsForCertainty = recommendations.map((r: typeof recommendations[0]) => ({
    id: r.id,
    priority: (r.priority as "critical" | "high" | "medium" | "low") || "medium",
    status: (r.status as "blocked" | "in_progress" | "completed") || "in_progress",
  }));

  // Map actions for execution certainty
  const actionsForCertainty = actions.map((a: typeof actions[0]) => ({
    id: a.id,
    priority: (a.priority as "critical" | "high" | "medium" | "low") || "medium",
    status: (a.status as "blocked" | "pending" | "in_progress" | "completed" | "verified") || "pending",
  }));

  // Map health status
  const healthStatus = (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") || "stable";
  const kpiTrend = condition
    ? (condition.businessStatus === "deteriorating" ? "deteriorating" : "improving")
    : "flat";

  // Calculate execution certainty
  const executionCertainty = calculateExecutionCertainty(
    engagementId,
    findingsForCertainty,
    recommendationsForCertainty,
    actionsForCertainty,
    [],
    {
      overallStatus: healthStatus,
      kpiTrend: kpiTrend as "deteriorating" | "flat" | "improving",
    }
  );

  // Extract critical blockers
  const criticalBlockers = executionCertainty.blockers;

  // Get overdue actions
  const now = new Date();
  const overdueActions: DashboardAction[] = actions
    .filter((a: typeof actions[0]) => {
      if (a.status === "completed" || a.status === "cancelled") return false;
      if (!a.dueDate) return false;
      return a.dueDate < now;
    })
    .map((a: typeof actions[0]) => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      status: a.status,
      dueDate: a.dueDate?.toISOString(),
      urgency: "overdue",
    }))
    .sort((a: DashboardAction, b: DashboardAction) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 999) -
             (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 999);
    })
    .slice(0, 5);

  // Get critical actions (not necessarily overdue)
  const criticalActions: DashboardAction[] = actions
    .filter((a: typeof actions[0]) => a.priority === "critical" && a.status !== "completed")
    .map((a: typeof actions[0]) => ({
      id: a.id,
      title: a.title,
      priority: a.priority,
      status: a.status,
      dueDate: a.dueDate?.toISOString(),
      urgency: calculateActionUrgency(a.dueDate, a.status),
    }))
    .slice(0, 5);

  // Get open recommendations
  const openRecommendations: DashboardRecommendation[] = recommendations
    .filter((r: typeof recommendations[0]) => r.status !== "completed" && r.status !== "cancelled")
    .map((r: typeof recommendations[0]) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
      status: r.status,
    }))
    .sort((a: DashboardRecommendation, b: DashboardRecommendation) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 999) -
             (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 999);
    })
    .slice(0, 5);

  // Compute next best action
  let nextBestAction: NextBestAction | null = null;

  // Priority 1: Unblock critical actions
  if (overdueActions.length > 0) {
    const nextOverdue = overdueActions[0];
    nextBestAction = {
      type: "action",
      id: nextOverdue.id,
      title: nextOverdue.title,
      reason: `Critical action is overdue (priority: ${nextOverdue.priority})`,
      priority: nextOverdue.priority,
    };
  }

  // Priority 2: Resolve critical blockers
  if (!nextBestAction && criticalBlockers.length > 0) {
    const blockedCriticalActions = actions.filter(
      (a: typeof actions[0]) => a.priority === "critical" && a.status === "blocked"
    );
    if (blockedCriticalActions.length > 0) {
      const firstBlocked = blockedCriticalActions[0];
      nextBestAction = {
        type: "action",
        id: firstBlocked.id,
        title: firstBlocked.title,
        reason: "Critical action is blocked and must be unblocked",
        priority: firstBlocked.priority,
      };
    }
  }

  // Priority 3: Approve high-priority recommendations
  if (!nextBestAction && openRecommendations.length > 0) {
    const nextRec = openRecommendations[0];
    nextBestAction = {
      type: "recommendation",
      id: nextRec.id,
      title: nextRec.title,
      reason: `Review and approve recommendation (priority: ${nextRec.priority})`,
      priority: nextRec.priority,
    };
  }

  // Priority 4: Resolve critical findings
  if (!nextBestAction && findings.length > 0) {
    const unresolved = findings.filter(
      (f: typeof findings[0]) => f.severity === "critical" && f.status !== "resolved"
    );
    if (unresolved.length > 0) {
      const firstCritical = unresolved[0];
      nextBestAction = {
        type: "finding",
        id: firstCritical.id,
        title: firstCritical.title,
        reason: "Critical finding requires resolution",
        priority: "critical",
      };
    }
  }

  // Compute business impact
  const businessImpact = computeBusinessImpact(
    findings,
    actions,
    recommendations,
    executionCertainty,
    healthStatus
  );

  // Detect execution drift
  const drift = await detectExecutionDrift(engagementId, workspaceId);

  // Compute decision confidence, financial normalization, and primary decision in parallel
  const [decisionConfidence, businessImpactResult, primaryDecision] = await Promise.all([
    computeDecisionConfidence({ engagementId, workspaceId }),
    generateBusinessImpact(engagementId, engagement.id, workspaceId),
    getPrimaryDecision(engagementId, workspaceId),
  ]);

  const financialImpactNormalized = normalizeFinancialImpact({
    estimatedLoss: businessImpactResult?.estimatedLoss ?? null,
    revenue: condition?.estimatedMonthlyRevenue ?? null,
  });

  const dashboard: OwnerDashboardData = {
    engagementId: engagement.id,
    engagementCode: engagement.code,
    engagementTitle: engagement.title,
    status: engagement.status,
    healthStatus: engagement.healthStatus,
    interventionMode: engagement.interventionMode,
    executionCertainty,
    drift,
    criticalBlockers,
    overdueActions,
    criticalActions,
    openRecommendations,
    nextBestAction,
    businessImpact,
    primaryDecision,
    decisionConfidence,
    financialImpactNormalized,
    generatedAt: new Date().toISOString(),
  };

  logger.debug("Owner dashboard generated", {
    engagementId,
    executionCertaintyScore: executionCertainty.score,
    overdueActionCount: overdueActions.length,
  });

  return dashboard;
}

function calculateActionUrgency(
  dueDate: Date | null | undefined,
  status: string
): "overdue" | "due-soon" | "on-track" | undefined {
  if (!dueDate || status === "completed" || status === "cancelled") {
    return undefined;
  }

  const now = new Date();
  const daysDue = Math.ceil(
    (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDue < 0) {
    return "overdue";
  } else if (daysDue <= 7) {
    return "due-soon";
  } else {
    return "on-track";
  }
}

interface FindingData {
  severity: string;
  status?: string;
  resolved?: boolean;
}

interface ActionData {
  priority: string;
  status: string;
  dueDate?: Date;
}

interface RecommendationData {
  priority: string;
  status: string;
}

function computeBusinessImpact(
  findings: FindingData[],
  actions: ActionData[],
  recommendations: RecommendationData[],
  executionCertainty: ExecutionCertaintyResult,
  healthStatus: string
): BusinessImpact {
  const keyRisks: string[] = [];
  const opportunities: string[] = [];

  const criticalFindings = findings.filter((f) => f.severity === "critical");
  const unresolved = criticalFindings.filter((f) => !f.resolved && f.status !== "resolved");
  const overdueActions = actions.filter((a) => a.dueDate && a.dueDate < new Date());
  const blockedActions = actions.filter((a) => a.status === "blocked");
  const completedActions = actions.filter((a) => a.status === "completed");

  // Key risks
  if (unresolved.length > 0) {
    keyRisks.push(`${unresolved.length} unresolved critical finding(s) impacting business outcomes`);
  }

  if (blockedActions.length > 0) {
    keyRisks.push(`${blockedActions.length} blocked action(s) preventing progress`);
  }

  if (overdueActions.length > 0) {
    keyRisks.push(`${overdueActions.length} overdue action(s) requiring immediate attention`);
  }

  if (executionCertainty.level === "blocked") {
    keyRisks.push("Execution certainty below threshold — approvals are blocked");
  }

  if (healthStatus === "critical") {
    keyRisks.push("Engagement health critical — intervention required");
  }

  // Opportunities
  if (completedActions.length > 0) {
    opportunities.push(`${completedActions.length} action(s) completed — momentum building`);
  }

  if (executionCertainty.score >= 70) {
    opportunities.push("Execution certainty strong — ready for next phase");
  }

  if (recommendations.filter((r) => r.status === "completed").length > 0) {
    opportunities.push("Recommendations being implemented — visible progress");
  }

  if (healthStatus === "healthy") {
    opportunities.push("Engagement health stable — on track for targets");
  }

  const summary = generateImpactSummary(
    executionCertainty,
    healthStatus,
    keyRisks,
    opportunities
  );

  return {
    summary,
    keyRisks: keyRisks.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
  };
}

function generateImpactSummary(
  certainty: ExecutionCertaintyResult,
  healthStatus: string,
  risks: string[],
  opportunities: string[]
): string {
  if (certainty.level === "blocked") {
    return "Approval blocked due to critical issues. Resolve blockers to proceed.";
  }

  if (healthStatus === "critical") {
    return "Engagement at critical health. Immediate intervention required to stabilize.";
  }

  if (certainty.score >= 80 && opportunities.length > 0) {
    return "Engagement progressing well. Strong execution certainty enables next phase.";
  }

  if (certainty.score >= 60 && risks.length > 0) {
    return "Mixed progress. Address key risks to improve execution certainty.";
  }

  if (certainty.score < 40) {
    return "Low execution certainty. Focus on unblocking critical items.";
  }

  return "Engagement tracking according to plan. Continue current activities.";
}
