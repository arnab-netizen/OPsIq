import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { calculateExecutionCertainty } from "../execution-certainty";
import { detectExecutionDrift } from "../execution-drift/execution-drift.service";

export interface DecisionConfidenceResult {
  score: number;
  level: "low" | "medium" | "high" | "very_high";
  factors: string[];
  deductions: { reason: string; points: number }[];
}

export async function computeDecisionConfidence(input: {
  engagementId: string;
  workspaceId: string;
  asOf?: Date;
}): Promise<DecisionConfidenceResult> {
  const { engagementId, workspaceId, asOf = new Date() } = input;

  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  // Fetch engagement and related data in parallel
  const [engagement, findings, recommendations, actions, condition] =
    await Promise.all([
      db.engagement.findFirst({
        where: { id: engagementId, workspaceId },
      }),
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

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Start with base score
  let score = 100;
  const deductions: { reason: string; points: number }[] = [];

  // Map data for execution certainty calculation
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
    status: (a.status as "blocked" | "pending" | "in_progress" | "completed" | "verified") ||
      "pending",
  }));

  const healthStatus =
    (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") || "stable";

  // Calculate execution certainty
  const executionCertainty = calculateExecutionCertainty(
    engagementId,
    findingsForCertainty,
    recommendationsForCertainty,
    actionsForCertainty,
    [],
    {
      overallStatus: healthStatus,
      kpiTrend: "flat" as const,
    }
  );

  // Detect execution drift
  const drift = await detectExecutionDrift(engagementId, workspaceId);

  // Deduction 1: Execution certainty score
  if (executionCertainty.score < 50) {
    const points = 25;
    deductions.push({
      reason: `Execution certainty critically low (${executionCertainty.score}/100)`,
      points,
    });
    score -= points;
  } else if (executionCertainty.score < 70) {
    const points = 15;
    deductions.push({
      reason: `Execution certainty moderate (${executionCertainty.score}/100)`,
      points,
    });
    score -= points;
  }

  // Deduction 2: Drift severity
  if (drift.severity === "critical") {
    const points = 25;
    deductions.push({
      reason: "Execution drift at critical severity",
      points,
    });
    score -= points;
  } else if (drift.severity === "high") {
    const points = 15;
    deductions.push({
      reason: "Execution drift at high severity",
      points,
    });
    score -= points;
  }

  // Deduction 3: Overdue critical actions
  const overdueCriticalActions = actions.filter((a: typeof actions[0]) => {
    if (a.priority !== "critical") return false;
    if (a.status === "completed" || a.status === "verified" || a.status === "cancelled") return false;
    if (!a.dueDate) return false;
    return a.dueDate < asOf;
  });

  if (overdueCriticalActions.length > 0) {
    const points = 20;
    deductions.push({
      reason: `${overdueCriticalActions.length} critical action(s) overdue`,
      points,
    });
    score -= points;
  }

  // Deduction 4: Blockers present
  if (executionCertainty.blockers.length > 0) {
    const points = 15;
    deductions.push({
      reason: `${executionCertainty.blockers.length} blocker(s) identified`,
      points,
    });
    score -= points;
  }

  // Deduction 5: No recent action update
  if (actions.length > 0) {
    const sevenDaysAgo = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentlyUpdated = actions.some((a: typeof actions[0]) => a.updatedAt >= sevenDaysAgo);

    if (!recentlyUpdated) {
      const points = 10;
      deductions.push({
        reason: "No action updates in past 7 days",
        points,
      });
      score -= points;
    }
  }

  // Deduction 6: Unresolved critical findings
  const unresolvedCriticalFindings = findings.filter(
    (f: typeof findings[0]) => f.severity === "critical" && f.status !== "resolved"
  );

  if (unresolvedCriticalFindings.length > 0) {
    const points = 15;
    deductions.push({
      reason: `${unresolvedCriticalFindings.length} critical finding(s) unresolved`,
      points,
    });
    score -= points;
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: "low" | "medium" | "high" | "very_high" = "low";
  if (score >= 85) {
    level = "very_high";
  } else if (score >= 70) {
    level = "high";
  } else if (score >= 50) {
    level = "medium";
  } else {
    level = "low";
  }

  // Build factors (human-readable reasons)
  const factors: string[] = [];

  if (executionCertainty.score >= 70) {
    factors.push("Strong execution certainty");
  }

  if (drift.severity === "low") {
    factors.push("Execution drift minimal or absent");
  }

  if (overdueCriticalActions.length === 0) {
    factors.push("All critical actions on track");
  }

  if (executionCertainty.blockers.length === 0) {
    factors.push("No critical blockers identified");
  }

  if (unresolvedCriticalFindings.length === 0) {
    factors.push("Critical findings resolved or addressed");
  }

  if (actions.length > 0) {
    const sevenDaysAgo = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (actions.some((a: typeof actions[0]) => a.updatedAt >= sevenDaysAgo)) {
      factors.push("Recent activity on action items");
    }
  }

  // If no positive factors, add context
  if (factors.length === 0) {
    if (score >= 70) {
      factors.push("Overall engagement trajectory stable");
    } else if (score >= 50) {
      factors.push("Engagement has manageable risks");
    } else {
      factors.push("Engagement requires immediate attention");
    }
  }

  // Keep top 3 factors max
  const topFactors = factors.slice(0, 3);

  return {
    score,
    level,
    factors: topFactors,
    deductions,
  };
}
