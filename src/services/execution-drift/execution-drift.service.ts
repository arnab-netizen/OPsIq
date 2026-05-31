import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { calculateExecutionCertainty } from "../execution-certainty";
import { getRequiredActionWithCommitment, type RequiredActionWithCommitment } from "./next-action.service";

export interface DriftDetectionResult {
  engagementId: string;
  driftDetected: boolean;
  severity: "low" | "medium" | "high" | "critical";
  reasons: string[];
  affectedActions: string[];
  requiredAttention: boolean;
  requiredAction: RequiredActionWithCommitment | null;
  detectedAt: string;
}

export async function detectExecutionDrift(engagementId: string, workspaceId: string): Promise<DriftDetectionResult> {
  // Fetch engagement
  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Fetch all required data in parallel
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

  const reasons: string[] = [];
  const affectedActions: string[] = [];
  let severity: "low" | "medium" | "high" | "critical" = "low";
  let driftDetected = false;

  // 1. Detect overdue critical actions
  const now = new Date();
  const overdueCriticalActions = actions.filter((a: typeof actions[0]) => {
    if (a.priority !== "critical") return false;
    if (a.status === "completed" || a.status === "cancelled") return false;
    if (!a.dueDate) return false;
    return a.dueDate < now;
  });

  if (overdueCriticalActions.length > 0) {
    driftDetected = true;
    reasons.push(`${overdueCriticalActions.length} critical action(s) are overdue`);
    affectedActions.push(...overdueCriticalActions.map((a: typeof actions[0]) => a.id));
    severity = "high";
  }

  // 2. Calculate execution certainty and detect blockers
  const findingsForCertainty = findings.map((f: typeof findings[0]) => ({
    id: f.id,
    severity: (f.severity as "critical" | "high" | "medium" | "low") || "low",
    resolved: f.status === "resolved" || f.status === "closed",
    verified: f.verified ?? false,
  }));

  const recommendationsForCertainty = recommendations.map((r: typeof recommendations[0]) => ({
    id: r.id,
    priority: (r.priority as "critical" | "high" | "medium" | "low") || "medium",
    status: (r.status as "blocked" | "in_progress" | "completed") || "in_progress",
  }));

  const actionsForCertainty = actions.map((a: typeof actions[0]) => ({
    id: a.id,
    priority: (a.priority as "critical" | "high" | "medium" | "low") || "medium",
    status: (a.status as "blocked" | "pending" | "in_progress" | "completed" | "verified") || "pending",
  }));

  const healthStatus = (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") || "stable";
  const kpiTrend = condition
    ? (condition.businessStatus === "deteriorating" ? "deteriorating" : "improving")
    : "flat";

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

  // Check for blockers
  if (executionCertainty.blockers.length > 0) {
    driftDetected = true;
    reasons.push(`${executionCertainty.blockers.length} critical blocker(s) present`);
    severity = "high";
  }

  // Check for low execution certainty with critical items present
  if (executionCertainty.score < 40 && executionCertainty.level === "low") {
    driftDetected = true;
    reasons.push(`Execution certainty critically low (${executionCertainty.score}/100)`);
    severity = "high";
  } else if (executionCertainty.score < 50 && executionCertainty.level === "low") {
    driftDetected = true;
    reasons.push(`Execution certainty low (${executionCertainty.score}/100)`);
    if (severity === "low") severity = "medium";
  }

  // 3. Detect unresolved critical findings
  const unresolvedCritical = findings.filter(
    (f: typeof findings[0]) => f.severity === "critical" && f.status !== "resolved" && f.status !== "closed"
  );

  if (unresolvedCritical.length > 0) {
    driftDetected = true;
    reasons.push(`${unresolvedCritical.length} unresolved critical finding(s)`);
    if (severity === "low" && overdueCriticalActions.length > 0) severity = "high";
    else if (severity === "low") severity = "medium";
  }

  // 4. Detect inactivity (no updates in last 7 days)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastUpdate = Math.max(
    engagement.updatedAt?.getTime() || 0,
    condition?.updatedAt?.getTime?.() || 0
  );

  if (lastUpdate < sevenDaysAgo.getTime() && lastUpdate > 0) {
    driftDetected = true;
    const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate) / (24 * 60 * 60 * 1000));
    reasons.push(`No updates for ${daysSinceUpdate} days`);
  }

  // 5. Detect untouched recommendations (in_progress for too long without progress)
  const oldRecommendations = recommendations.filter((r: typeof recommendations[0]) => {
    if (r.status === "completed" || r.status === "cancelled") return false;
    if (r.status === "blocked") return true; // Blocked recs are problematic

    // Check if recommendation was created more than 14 days ago without completion
    const createdTime = r.createdAt?.getTime?.() || now.getTime();
    const fourteenDaysAgo = now.getTime() - 14 * 24 * 60 * 60 * 1000;
    return createdTime < fourteenDaysAgo;
  });

  if (oldRecommendations.length > 0) {
    driftDetected = true;
    const blockedCount = oldRecommendations.filter((r: typeof recommendations[0]) => r.status === "blocked").length;
    const staleCount = oldRecommendations.length - blockedCount;

    if (blockedCount > 0) {
      reasons.push(`${blockedCount} recommendation(s) blocked`);
      severity = "high";
    }
    if (staleCount > 0) {
      reasons.push(`${staleCount} recommendation(s) in progress for 14+ days`);
      if (severity === "low") severity = "medium";
    }
  }

  // 6. Detect engagement health deterioration
  if (engagement.healthStatus === "critical") {
    driftDetected = true;
    reasons.push("Engagement health is critical");
    severity = "critical";
  } else if (engagement.healthStatus === "at_risk") {
    driftDetected = true;
    reasons.push("Engagement health is at risk");
    if (overdueCriticalActions.length > 0 && severity !== "high") severity = "high";
    else if (severity === "low") severity = "medium";
  }

  // Determine if immediate attention is required
  const requiredAttention = severity === "critical" || (severity === "high" && driftDetected);

  // Create intermediate result to map to required action with commitment
  const intermediateResult: DriftDetectionResult = {
    engagementId,
    driftDetected,
    severity,
    reasons: reasons.slice(0, 5), // Limit to top 5 reasons
    affectedActions: affectedActions.slice(0, 10), // Limit to 10 actions
    requiredAttention,
    requiredAction: null, // Will be set below
    detectedAt: new Date().toISOString(),
  };

  // Map drift conditions to required action with commitment status
  const requiredAction = await getRequiredActionWithCommitment(intermediateResult, workspaceId);

  const result: DriftDetectionResult = {
    ...intermediateResult,
    requiredAction,
  };

  logger.debug("Execution drift detected", {
    engagementId,
    driftDetected,
    severity,
    reasonCount: reasons.length,
  });

  return result;
}

// Helper to get drift history (memory-based, no DB writes)
export function assessDriftTrend(
  currentDrift: DriftDetectionResult,
  previousDrift: DriftDetectionResult | null
): {
  trending: "improving" | "stable" | "worsening";
  explanation: string;
} {
  if (!previousDrift) {
    return {
      trending: "stable",
      explanation: "No previous drift data to compare",
    };
  }

  const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
  const currentSeverityValue = severityOrder[currentDrift.severity];
  const previousSeverityValue = severityOrder[previousDrift.severity];

  if (currentSeverityValue > previousSeverityValue) {
    return {
      trending: "worsening",
      explanation: `Drift severity increased from ${previousDrift.severity} to ${currentDrift.severity}`,
    };
  } else if (currentSeverityValue < previousSeverityValue) {
    return {
      trending: "improving",
      explanation: `Drift severity decreased from ${previousDrift.severity} to ${currentDrift.severity}`,
    };
  } else {
    return {
      trending: "stable",
      explanation: `Drift severity remains ${currentDrift.severity}`,
    };
  }
}
