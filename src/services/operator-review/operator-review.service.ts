import { db } from "@/lib/db";
import { detectExecutionDrift } from "../execution-drift/execution-drift.service";
import { calculateExecutionCertainty } from "../execution-certainty";
import { generateBusinessImpact } from "../business-impact/business-impact.service";
import { computeDecisionConfidence } from "../decision-confidence/decision-confidence.service";
import { getFinancialDelta } from "../financial/financial-mapping.service";

export interface OperatorReviewItem {
  engagementId: string;
  clientName: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
  requiredAction: string | null;
  executionCertainty: number;
  businessImpactLevel: string;
  valueAtRiskINR: number | null;
  lastUpdatedAt: string;
}

export interface OperatorReviewQueue {
  items: OperatorReviewItem[];
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

export async function getOperatorReviewQueue(): Promise<OperatorReviewQueue> {
  // Fetch all active engagements
  const engagements = await db.engagement.findMany({
    where: { status: "active" },
    include: {
      client: { select: { name: true } },
      businessConditionProfile: {
        where: { isCurrent: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const reviewItems: OperatorReviewItem[] = [];

  for (const engagement of engagements) {
    // Fetch drift detection
    const drift = await detectExecutionDrift(engagement.id);

    // Fetch execution certainty
    const findings = await db.finding.findMany({
      where: { engagementId: engagement.id },
      select: { id: true, severity: true, verified: true },
    });

    const recommendations = await db.recommendation.findMany({
      where: { engagementId: engagement.id },
      select: { id: true, priority: true, status: true },
    });

    const actions = await db.action.findMany({
      where: { engagementId: engagement.id },
      select: { id: true, priority: true, status: true },
    });

    const findingsForCertainty = findings.map((f: typeof findings[0]) => ({
      id: f.id,
      severity: (f.severity as "low" | "medium" | "high" | "critical") || "medium",
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

    const executionCertainty = calculateExecutionCertainty(
      engagement.id,
      findingsForCertainty,
      recommendationsForCertainty,
      actionsForCertainty
    );

    // Fetch business impact
    const businessImpact = await generateBusinessImpact(engagement.id, "system");

    // Fetch decision confidence
    const decisionConfidence = await computeDecisionConfidence({
      engagementId: engagement.id,
    });

    // Get financial impact
    const condition = engagement.businessConditionProfile[0];
    const monthlyRevenue = condition?.estimatedMonthlyRevenue ?? null;
    const financialDelta = getFinancialDelta(
      "medium",
      businessImpact.impactLevel,
      monthlyRevenue
    );

    // Determine priority based on rules
    let priority: "critical" | "high" | "medium" | "low" = "low";
    let reason = "No immediate issues";

    if (
      drift.severity === "critical" ||
      businessImpact.impactLevel === "existential" ||
      executionCertainty.level === "blocked"
    ) {
      priority = "critical";
      if (drift.severity === "critical") reason = "Critical execution drift detected";
      else if (businessImpact.impactLevel === "existential")
        reason = "Existential business impact";
      else reason = "Execution blocked";
    } else if (
      businessImpact.impactLevel === "critical" ||
      businessImpact.ownerDecision.required
    ) {
      priority = "high";
      reason = businessImpact.ownerDecision.required
        ? "Owner decision required"
        : "Critical business impact";
    } else if (drift.severity === "high" || decisionConfidence.level === "low") {
      priority = "medium";
      reason = drift.severity === "high" ? "High execution drift" : "Low decision confidence";
    }

    // Get required next action
    const requiredAction = businessImpact.ownerDecision.required
      ? businessImpact.ownerDecision.reason ?? null
      : null;

    reviewItems.push({
      engagementId: engagement.id,
      clientName: engagement.client.name,
      priority,
      reason,
      requiredAction,
      executionCertainty: executionCertainty.score,
      businessImpactLevel: businessImpact.impactLevel,
      valueAtRiskINR: financialDelta.actualLoss,
      lastUpdatedAt: engagement.updatedAt.toISOString(),
    });
  }

  // Sort by priority (critical first) then by value at risk
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  reviewItems.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Within same priority, sort by value at risk (highest first)
    const aValue = a.valueAtRiskINR ?? 0;
    const bValue = b.valueAtRiskINR ?? 0;
    return bValue - aValue;
  });

  // Calculate counts
  const counts = {
    critical: reviewItems.filter((i) => i.priority === "critical").length,
    high: reviewItems.filter((i) => i.priority === "high").length,
    medium: reviewItems.filter((i) => i.priority === "medium").length,
    low: reviewItems.filter((i) => i.priority === "low").length,
    total: reviewItems.length,
  };

  return {
    items: reviewItems,
    counts,
  };
}
