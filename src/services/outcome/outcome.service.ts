import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { computeDecisionConfidence } from "../decision-confidence/decision-confidence.service";
import { generateBusinessImpact } from "../business-impact/business-impact.service";

export interface OutcomeSnapshot {
  predictedImpactLevel: string;
  predictedConfidence: number;
  actualImpactLevel: string;
  actualConfidence: number;
  delta: {
    impactImprovement: string;
    confidenceGain: number;
  };
  accuracyScore: number;
  timestamp: string;
}

export interface ActionOutcome {
  actionId: string;
  engagementId: string;
  predictedImpact: string;
  actualImpact: string;
  delta: string;
  accuracyScore: number;
  timestamp: string;
}

export async function recordOutcome(actionId: string): Promise<ActionOutcome> {
  // Fetch the action
  const action = await db.action.findUnique({
    where: { id: actionId },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  if (!action.completedAt) {
    throw new Error("Action must be completed before recording outcome");
  }

  const engagementId = action.engagementId;

  // Get current state (actual impact)
  const [currentConfidence, currentImpact] = await Promise.all([
    computeDecisionConfidence({ engagementId }),
    generateBusinessImpact(engagementId, engagementId),
  ]);

  // Get previous snapshot if exists
  let predictedImpactLevel = "unknown";
  let predictedConfidence = 50;

  if (action.outcomeSnapshot && typeof action.outcomeSnapshot === "object") {
    const snapshot = action.outcomeSnapshot as Record<string, unknown>;
    if (typeof snapshot.predictedImpactLevel === "string") {
      predictedImpactLevel = snapshot.predictedImpactLevel;
    }
    if (typeof snapshot.predictedConfidence === "number") {
      predictedConfidence = snapshot.predictedConfidence;
    }
  }

  // Calculate accuracy score
  const actualConfidence = currentConfidence.score;
  const confidenceImprovement = Math.max(0, actualConfidence - predictedConfidence);
  const accuracyScore = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(confidenceImprovement - 10))));

  // Determine delta (impact improvement)
  const severityOrder = ["low", "medium", "high", "critical", "existential"];
  const predictedIndex = severityOrder.indexOf(predictedImpactLevel.toLowerCase());
  const actualIndex = severityOrder.indexOf((currentImpact?.impactLevel || "unknown").toLowerCase());

  let deltaDescription = "no change";
  if (actualIndex < predictedIndex) {
    deltaDescription = `improved from ${predictedImpactLevel} to ${currentImpact?.impactLevel}`;
  } else if (actualIndex > predictedIndex) {
    deltaDescription = `regressed from ${predictedImpactLevel} to ${currentImpact?.impactLevel}`;
  }

  const timestamp = new Date().toISOString();

  // Create outcome snapshot
  const outcomeSnapshot: OutcomeSnapshot = {
    predictedImpactLevel,
    predictedConfidence,
    actualImpactLevel: currentImpact?.impactLevel || "unknown",
    actualConfidence,
    delta: {
      impactImprovement: deltaDescription,
      confidenceGain: confidenceImprovement,
    },
    accuracyScore,
    timestamp,
  };

  // Store outcome snapshot in action record
  await db.action.update({
    where: { id: actionId },
    data: {
      outcomeSnapshot,
    },
  });

  return {
    actionId,
    engagementId,
    predictedImpact: predictedImpactLevel,
    actualImpact: currentImpact?.impactLevel || "unknown",
    delta: deltaDescription,
    accuracyScore,
    timestamp,
  };
}

export async function getEngagementOutcomes(engagementId: string): Promise<{
  outcomes: ActionOutcome[];
  averageAccuracy: number;
  totalActionsCompleted: number;
  totalValueRecovered: number;
}> {
  // Fetch all completed actions with outcome snapshots
  const completedActions = await db.action.findMany({
    where: {
      engagementId,
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
  });

  const outcomes: ActionOutcome[] = completedActions
    .filter((a: typeof completedActions[0]) => a.outcomeSnapshot && typeof a.outcomeSnapshot === "object")
    .map((a: typeof completedActions[0]) => {
      const snapshot = a.outcomeSnapshot as Record<string, unknown>;
      return {
        actionId: a.id,
        engagementId: a.engagementId,
        predictedImpact: (typeof snapshot.predictedImpactLevel === "string" ? snapshot.predictedImpactLevel : "unknown"),
        actualImpact: (typeof snapshot.actualImpactLevel === "string" ? snapshot.actualImpactLevel : "unknown"),
        delta:
          typeof snapshot.delta === "object" && snapshot.delta !== null && "impactImprovement" in snapshot.delta
            ? (snapshot.delta as Record<string, unknown>).impactImprovement || "unknown"
            : "unknown",
        accuracyScore: typeof snapshot.accuracyScore === "number" ? snapshot.accuracyScore : 0,
        timestamp: typeof snapshot.timestamp === "string" ? snapshot.timestamp : new Date().toISOString(),
      };
    });

  // Calculate metrics
  const averageAccuracy = outcomes.length > 0 ? Math.round(outcomes.reduce((sum, o) => sum + o.accuracyScore, 0) / outcomes.length) : 0;

  const totalActionsCompleted = completedActions.filter((a: typeof completedActions[0]) => a.status === "completed" || a.status === "verified").length;

  // Calculate total value recovered (improved impacts)
  const severityScores = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 100,
    existential: 200,
    unknown: 0,
  };

  const totalValueRecovered = outcomes.reduce((sum, outcome) => {
    const predictedScore = severityScores[(outcome.predictedImpact.toLowerCase() as keyof typeof severityScores)] || 0;
    const actualScore = severityScores[(outcome.actualImpact.toLowerCase() as keyof typeof severityScores)] || 0;
    return sum + Math.max(0, predictedScore - actualScore);
  }, 0);

  return {
    outcomes,
    averageAccuracy,
    totalActionsCompleted,
    totalValueRecovered,
  };
}
