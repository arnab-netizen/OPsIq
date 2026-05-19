import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OUTCOME_RECORDED,
      actorId: actorId || "system",
      entityType: "action",
      entityId: actionId,
      workspaceId: auditWorkspaceId,
      payload: {
        engagementId,
        accuracyScore,
        valueRecoveredINR,
        delta: deltaDescription,
      },
      visibility: "internal",
    }).catch((error) => {
      logger.warn("Failed to emit audit event for outcome recording", {
        actionId,
        error: error instanceof Error ? error.message : String(error),
      capability: 'mutation',
    decision: 'outcome_recorded',
    requestId: randomUUID(),
    };
    capability: 'mutation',
    decision: 'outcome_recorded',
    requestId: randomUUID(),
    };

    const result = {
      actionId,
      engagementId,
      predictedImpact: predictedImpactLevel,
      actualImpact: currentImpact?.impactLevel || "unknown",
      predictedLossINR: financialDelta.predictedLoss,
      actualLossINR,
      valueRecoveredINR,
      delta: deltaDescription,
      accuracyScore,
      timestamp,
    };

    if (idempotencyKey && actorId) {
      const { recordIdempotencyResponse } = await import("@/services/idempotency");
      await recordIdempotencyResponse(idempotencyKey, 200, result);
    }

    return result;
  } catch (error) {
    if (idempotencyKey && actorId) {
      const { recordIdempotencyError } = await import("@/services/idempotency");
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
    }
    throw error;
  }
}

export async function getEngagementOutcomes(engagementId: string, workspaceId: string = "unknown"): Promise<EngagementOutcomes> {
  // Fetch all completed actions with outcome snapshots
  const completedActions = await db.action.findMany({
    where: {
      engagementId,
      completedAt: { not: null },
      engagement: { workspaceId },
    },
    orderBy: { completedAt: "desc" },
    take: 10,
  });

  // Get engagement context for financial calculations
  const [engagement, condition] = await Promise.all([
    db.engagement.findUnique({ where: { id: engagementId, workspaceId } }),
    db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true, workspaceId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const monthlyRevenue = condition?.estimatedMonthlyRevenue ?? null;

  const outcomes: ActionOutcome[] = completedActions
    .filter((a: typeof completedActions[0]) => a.outcomeSnapshot && typeof a.outcomeSnapshot === "object")
    .map((a: typeof completedActions[0]) => {
      const snapshot = a.outcomeSnapshot as Record<string, unknown>;
      return {
        actionId: a.id,
        engagementId: a.engagementId,
        predictedImpact: (typeof snapshot.predictedImpactLevel === "string" ? snapshot.predictedImpactLevel : "unknown"),
        actualImpact: (typeof snapshot.actualImpactLevel === "string" ? snapshot.actualImpactLevel : "unknown"),
        predictedLossINR: typeof snapshot.predictedLossINR === "number" ? snapshot.predictedLossINR : null,
        actualLossINR: typeof snapshot.actualLossINR === "number" ? snapshot.actualLossINR : null,
        valueRecoveredINR: typeof snapshot.valueRecoveredINR === "number" ? snapshot.valueRecoveredINR : 0,
        delta:
          typeof snapshot.delta === "object" && snapshot.delta !== null && "impactImprovement" in snapshot.delta
            ? (snapshot.delta as Record<string, unknown>).impactImprovement || "unknown"
            : "unknown",
        accuracyScore: typeof snapshot.accuracyScore === "number" ? snapshot.accuracyScore : 0,
        timestamp: typeof snapshot.timestamp === "string" ? snapshot.timestamp : new Date().toISOString(),
      };
    capability: 'mutation',
    decision: 'outcome_recorded',
    requestId: randomUUID(),
    };

  // Calculate metrics
  const averageAccuracy = outcomes.length > 0 ? Math.round(outcomes.reduce((sum, o) => sum + o.accuracyScore, 0) / outcomes.length) : 0;

  const totalActionsCompleted = completedActions.filter((a: typeof completedActions[0]) => a.status === "completed" || a.status === "verified").length;

  const totalValueRecoveredINR = outcomes.reduce((sum, outcome) => sum + (outcome.valueRecoveredINR || 0), 0);

  // Current risk calculation (sum of all action actual losses)
  let currentRiskINR: number | null = null;
  if (monthlyRevenue && outcomes.length > 0) {
    currentRiskINR = outcomes.reduce((sum, o) => sum + (o.actualLossINR || 0), 0);
  }

  // Average recovery per action
  const avgPerActionINR = outcomes.length > 0 ? Math.round(totalValueRecoveredINR / outcomes.length) : 0;

  return {
    outcomes,
    averageAccuracy,
    totalActionsCompleted,
    totalValueRecoveredINR,
    financialMetrics: {
      totalRecoveredINR: totalValueRecoveredINR,
      currentRiskINR,
      avgPerActionINR,
    },
  };
}