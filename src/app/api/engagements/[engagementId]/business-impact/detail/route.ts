import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { generateBusinessImpact } from "@/services/business-impact/business-impact.service";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { calculateExecutionCertainty } from "@/services/execution-certainty";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

interface ActionAffectingImpact {
  actionId: string;
  title: string;
  status: string;
  priority: string;
  impactContribution: string;
}

interface DetailResponse {
  success: true;
  data: {
    impactLevel: string;
    reasoning: string[];
    financialExplanation: string[];
    timeExplanation: string[];
    recoveryExplanation: string[];
    drivers: string[];
    actionsAffectingImpact: ActionAffectingImpact[];
  };
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  // Fetch all required data
  const [engagement, businessImpact, drift, findings, recommendations, actions] =
    await Promise.all([
      db.engagement.findUnique({ where: { id: engagementId } }),
      generateBusinessImpact(engagementId, session.user.id),
      detectExecutionDrift(engagementId),
      db.finding.findMany({ where: { engagementId } }),
      db.recommendation.findMany({ where: { engagementId } }),
      db.action.findMany({ where: { engagementId } }),
    ]);

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Calculate execution certainty for blocker context
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

  const executionCertainty = calculateExecutionCertainty(
    engagementId,
    findingsForCertainty,
    recommendationsForCertainty,
    actionsForCertainty,
    [],
    {
      overallStatus: (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") ||
        "stable",
      kpiTrend: "flat" as const,
    }
  );

  // Build reasoning array
  const reasoning: string[] = [];

  if (businessImpact.impactLevel === "existential") {
    reasoning.push("Existential risk: system or business viability at stake");
    if (businessImpact.timeImpact.timelineToFailure && businessImpact.timeImpact.timelineToFailure <= 30) {
      reasoning.push(
        `Timeline to failure: ${businessImpact.timeImpact.timelineToFailure} days`
      );
    }
    if (drift.driftDetected && drift.severity === "critical") {
      reasoning.push("Critical execution drift detected");
    }
  } else if (businessImpact.impactLevel === "critical") {
    if (executionCertainty.score < 40) {
      reasoning.push(
        `Low execution certainty (${executionCertainty.score}/100) indicates capability gap`
      );
    }
    if (executionCertainty.blockers.length >= 2) {
      reasoning.push(
        `${executionCertainty.blockers.length} critical blocker(s) blocking progress`
      );
    }
    const criticalFindings = findings.filter((f: typeof findings[0]) => f.severity === "critical");
    if (criticalFindings.length >= 2) {
      reasoning.push(`${criticalFindings.length} unresolved critical findings`);
    }
  } else if (businessImpact.impactLevel === "high") {
    if (executionCertainty.score < 60) {
      reasoning.push(
        `Moderate execution risk (certainty: ${executionCertainty.score}/100)`
      );
    }
    if (executionCertainty.blockers.length >= 1) {
      reasoning.push(`${executionCertainty.blockers.length} blocker(s) in critical path`);
    }
    const criticalFindings = findings.filter((f: typeof findings[0]) => f.severity === "critical");
    if (criticalFindings.length >= 1) {
      reasoning.push(`${criticalFindings.length} critical finding(s) require resolution`);
    }
    if (drift.driftDetected && drift.severity === "high") {
      reasoning.push(`Execution drift detected (${drift.severity} severity)`);
    }
  } else if (businessImpact.impactLevel === "medium") {
    if (engagement.healthStatus === "at_risk") {
      reasoning.push("Engagement health status is at risk");
    }
    if (drift.driftDetected) {
      reasoning.push(`Execution drift detected (${drift.severity} severity)`);
    }
  }

  // Build financial explanation
  const financialExplanation: string[] = [];
  if (businessImpact.estimatedLoss !== null) {
    financialExplanation.push(
      `Estimated loss: $${businessImpact.estimatedLoss.toLocaleString()} based on current trajectory`
    );
    if (businessImpact.impactLevel === "existential") {
      financialExplanation.push(
        `Loss spans up to ${businessImpact.timeImpact.timelineToFailure || 90} days if corrective actions not taken`
      );
    }
  } else {
    financialExplanation.push("No revenue data available for financial impact estimation");
  }

  // Build time explanation
  const timeExplanation: string[] = [];
  if (businessImpact.timeImpact.timelineToFailure !== null) {
    timeExplanation.push(
      `Days to potential failure: ${businessImpact.timeImpact.timelineToFailure}`
    );
  }
  timeExplanation.push(`Urgency window: ${businessImpact.timeImpact.urgencyWindow}`);

  if (drift.driftDetected && drift.reasons.length > 0) {
    timeExplanation.push(`Drift factors: ${drift.reasons.join(", ")}`);
  }

  // Build recovery explanation
  const recoveryExplanation: string[] = [];
  recoveryExplanation.push(
    `Recovery probability: ${businessImpact.recoveryImpact.recoveryProbability}`
  );

  if (businessImpact.recoveryImpact.recoveryTimeline !== null) {
    recoveryExplanation.push(
      `Estimated recovery timeline: ${businessImpact.recoveryImpact.recoveryTimeline} days`
    );
  }

  const blockerCount = executionCertainty.blockers.length;
  if (blockerCount > 0) {
    recoveryExplanation.push(
      `Recovery hampered by ${blockerCount} blocker(s): ${executionCertainty.blockers.slice(0, 2).join("; ")}`
    );
  }

  // Build actions affecting impact
  const actionsAffectingImpact: ActionAffectingImpact[] = [];

  // Add critical overdue actions
  const overdueActions = actions.filter((a: typeof actions[0]) => {
    if (!a.dueDate) return false;
    const now = new Date();
    return a.dueDate < now && a.status !== "completed" && a.status !== "verified";
  });

  overdueActions.slice(0, 3).forEach((action: typeof actions[0]) => {
    actionsAffectingImpact.push({
      actionId: action.id,
      title: action.title,
      status: action.status,
      priority: action.priority,
      impactContribution: `Overdue: affects timeline and recovery probability`,
    });
  });

  // Add critical priority actions
  const criticalActions = actions.filter(
    (a: typeof actions[0]) => a.priority === "critical" && a.status !== "completed" && a.status !== "verified"
  );

  criticalActions.slice(0, 3 - actionsAffectingImpact.length).forEach((action: typeof actions[0]) => {
    actionsAffectingImpact.push({
      actionId: action.id,
      title: action.title,
      status: action.status,
      priority: action.priority,
      impactContribution: `Critical priority: required for recovery plan execution`,
    });
  });

  const response: DetailResponse = {
    success: true,
    data: {
      impactLevel: businessImpact.impactLevel,
      reasoning,
      financialExplanation,
      timeExplanation,
      recoveryExplanation,
      drivers: businessImpact.topImpactDrivers,
      actionsAffectingImpact,
    },
  };

  return Response.json(response);
});
