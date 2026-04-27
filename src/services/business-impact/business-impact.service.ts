import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { calculateExecutionCertainty } from "@/services/execution-certainty";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { logger } from "@/infra/logger";

export interface BusinessImpactResult {
  engagementId: string;
  generatedAt: string;
  impactLevel: "low" | "medium" | "high" | "critical" | "existential";
  estimatedLoss: number | null;
  timeImpact: {
    timelineToFailure: number | null; // days until critical failure
    urgencyWindow: "immediate" | "days" | "weeks" | "months" | "unknown";
  };
  recoveryImpact: {
    recoveryProbability: "low" | "medium" | "high"; // deterministic based on blockers
    recoveryTimeline: number | null; // estimated days to recover
  };
  ownerDecision: {
    required: boolean;
    reason?: string;
    decision?: string; // owner's documented decision
    decidedAt?: string;
  };
  topImpactDrivers: string[];
}

export async function generateBusinessImpact(
  engagementId: string,
  _actorId: string
): Promise<BusinessImpactResult> {
  // Fetch engagement and related data
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Fetch all required data in parallel
  const [findings, recommendations, actions, condition, businessImpactRecord] =
    await Promise.all([
      db.finding.findMany({
        where: { engagementId },
      }),
      db.recommendation.findMany({
        where: { engagementId },
      }),
      db.action.findMany({
        where: { engagementId },
      }),
      db.businessConditionProfile.findFirst({
        where: { engagementId, isCurrent: true },
        orderBy: { createdAt: "desc" },
      }),
      db.businessImpact.findFirst({
        where: { engagementId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  // Calculate execution certainty
  const findingsForCertainty = findings.map((f: typeof findings[0]) => ({
    id: f.id,
    severity: (f.severity as "critical" | "high" | "medium" | "low") || "low",
    resolved: f.status === "resolved" || f.status === "closed",
    verified: f.verified ?? false,
  }));

  const recommendationsForCertainty = recommendations.map((r: typeof recommendations[0]) => ({
    id: r.id,
    priority: (r.priority as "critical" | "high" | "medium" | "low") ||
      "medium",
    status: (r.status as "blocked" | "in_progress" | "completed") ||
      "in_progress",
  }));

  const actionsForCertainty = actions.map((a: typeof actions[0]) => ({
    id: a.id,
    priority: (a.priority as "critical" | "high" | "medium" | "low") ||
      "medium",
    status: (a.status as
      | "blocked"
      | "pending"
      | "in_progress"
      | "completed"
      | "verified") || "pending",
  }));

  const healthStatus =
    (engagement.healthStatus as
      | "critical"
      | "at_risk"
      | "stable"
      | "healthy") || "stable";
  const kpiTrend = condition
    ? condition.businessStatus === "deteriorating"
      ? "deteriorating"
      : "improving"
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

  // Detect execution drift
  const drift = await detectExecutionDrift(engagementId);

  // Calculate timeline to failure based on business condition
  const now = new Date();
  const engagementStartDate = engagement.startDate || new Date();
  const timelineDays =
    condition && condition.severityScore > 7
      ? Math.max(
          1,
          Math.floor(
            30 -
              (condition.severityScore - 7) * 3 -
              (drift.driftDetected ? 5 : 0)
          )
        )
      : null;

  // Determine urgency window
  let urgencyWindow: "immediate" | "days" | "weeks" | "months" | "unknown" =
    "unknown";
  if (timelineDays !== null) {
    if (timelineDays <= 2) urgencyWindow = "immediate";
    else if (timelineDays <= 14) urgencyWindow = "days";
    else if (timelineDays <= 60) urgencyWindow = "weeks";
    else urgencyWindow = "months";
  }

  // Calculate recovery probability based on blockers and execution certainty
  const blockerCount = executionCertainty.blockers.length;
  const criticalFindingCount = findings.filter(
    (f: typeof findings[0]) => f.severity === "critical" && f.status !== "resolved"
  ).length;

  let recoveryProbability: "low" | "medium" | "high" = "high";
  if (blockerCount >= 3 || criticalFindingCount >= 3) {
    recoveryProbability = "low";
  } else if (blockerCount >= 1 || criticalFindingCount >= 1) {
    recoveryProbability = "medium";
  }

  // Determine impact level
  let impactLevel: "low" | "medium" | "high" | "critical" | "existential" =
    "low";
  const drivers: string[] = [];

  // Existential: timeline <= 30 days OR execution certainty score < 40 with high drift
  if (
    timelineDays !== null &&
    timelineDays <= 30 &&
    drift.driftDetected &&
    drift.severity === "critical"
  ) {
    impactLevel = "existential";
    drivers.push(`Timeline to failure: ${timelineDays} days`);
  } else if (
    executionCertainty.score < 40 &&
    drift.driftDetected &&
    drift.severity === "critical"
  ) {
    impactLevel = "existential";
    drivers.push(
      `Critical execution failure risk (certainty: ${executionCertainty.score}/100)`
    );
  }
  // Critical: execution score < 40 OR critical blockers OR multiple critical findings
  else if (executionCertainty.score < 40) {
    impactLevel = "critical";
    drivers.push(
      `Low execution certainty (${executionCertainty.score}/100) with drift`
    );
  } else if (blockerCount >= 2 || criticalFindingCount >= 2) {
    impactLevel = "critical";
    drivers.push(
      `${blockerCount} blocker(s) + ${criticalFindingCount} critical finding(s)`
    );
  }
  // High: execution score < 60 OR single critical blocker OR high severity drift
  else if (executionCertainty.score < 60) {
    impactLevel = "high";
    drivers.push(
      `Moderate execution risk (certainty: ${executionCertainty.score}/100)`
    );
  } else if (blockerCount >= 1 || criticalFindingCount >= 1) {
    impactLevel = "high";
    drivers.push(
      `${blockerCount} blocker(s) and ${criticalFindingCount} critical finding(s)`
    );
  } else if (drift.driftDetected && drift.severity === "high") {
    impactLevel = "high";
    drivers.push(`Execution drift detected (${drift.severity} severity)`);
  }
  // Medium: at_risk health OR drift detected
  else if (engagement.healthStatus === "at_risk") {
    impactLevel = "medium";
    drivers.push("Engagement health at risk");
  } else if (drift.driftDetected) {
    impactLevel = "medium";
    drivers.push(`Execution drift detected (${drift.severity} severity)`);
  }

  // Calculate estimated loss (null if no revenue data)
  // Only estimate if we have financial context; otherwise null
  let estimatedLoss: number | null = null;
  if (
    condition &&
    condition.estimatedMonthlyRevenue !== null &&
    impactLevel !== "low"
  ) {
    // Only estimate loss for medium+ impact levels
    const monthlyRevenue = condition.estimatedMonthlyRevenue;
    const dailyLoss = monthlyRevenue / 30;

    if (impactLevel === "existential" && timelineDays) {
      estimatedLoss = Math.round(dailyLoss * Math.min(timelineDays, 90));
    } else if (impactLevel === "critical") {
      estimatedLoss = Math.round(dailyLoss * 30); // 30 days impact
    } else if (impactLevel === "high") {
      estimatedLoss = Math.round(dailyLoss * 14); // 14 days impact
    } else if (impactLevel === "medium") {
      estimatedLoss = Math.round(dailyLoss * 7); // 7 days impact
    }
  }

  // Recovery timeline: based on execution certainty and blockers
  let recoveryTimeline: number | null = null;
  if (impactLevel !== "low") {
    // Only estimate recovery if there's impact
    const baseTimeline =
      impactLevel === "existential"
        ? 60
        : impactLevel === "critical"
          ? 45
          : impactLevel === "high"
            ? 30
            : 14;

    // Add days per blocker
    const blockerDays = blockerCount * 5;
    // Add days per critical finding
    const findingDays = criticalFindingCount * 3;

    recoveryTimeline = baseTimeline + blockerDays + findingDays;
  }

  // Determine if owner decision is required
  const decisionRequired =
    impactLevel === "high" ||
    impactLevel === "critical" ||
    impactLevel === "existential";
  const decisionReason =
    impactLevel === "existential"
      ? "Existential risk requires executive decision"
      : impactLevel === "critical"
        ? "Critical impact requires executive decision"
        : "High impact requires owner decision";

  const result: BusinessImpactResult = {
    engagementId,
    generatedAt: new Date().toISOString(),
    impactLevel,
    estimatedLoss,
    timeImpact: {
      timelineToFailure: timelineDays,
      urgencyWindow,
    },
    recoveryImpact: {
      recoveryProbability,
      recoveryTimeline,
    },
    ownerDecision: {
      required: decisionRequired,
      reason: decisionRequired ? decisionReason : undefined,
      decision: businessImpactRecord?.ownerDecision || undefined,
      decidedAt: businessImpactRecord?.decidedAt?.toISOString() || undefined,
    },
    topImpactDrivers: drivers.slice(0, 5),
  };

  logger.info("Business impact generated", {
    engagementId,
    impactLevel,
    timelineToFailure: timelineDays,
  });

  return result;
}
