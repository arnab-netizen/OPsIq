import { classifyOperatorError } from "@/lib/operator-error-governance";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { computeDecisionConfidence } from "../decision-confidence/decision-confidence.service";
import { generateBusinessImpact } from "../business-impact/business-impact.service";
import { getFinancialDelta } from "../financial/financial-mapping.service";

export interface OutcomeSnapshot {
  predictedImpactLevel: string;
  predictedConfidence: number;
  actualImpactLevel: string;
  actualConfidence: number;
  predictedLossINR: number | null;
  actualLossINR: number | null;
  valueRecoveredINR: number | null;
  delta: {
    impactImprovement: string;
    confidenceGain: number;
  };
  accuracyScore: number;
  // OUT-01: honesty labels. `accuracyScore` is derived from the model's own
  // confidence change, NOT a measured business KPI, so it must never be presented
  // to an owner as a measured result. `measured=false` marks this as a model estimate;
  // `accuracyBasis` names what the score actually reflects.
  accuracyBasis: "model_confidence_delta";
  measured: false;
  timestamp: string;
}

export interface ActionOutcome {
  actionId: string;
  engagementId: string;
  predictedImpact: string;
  actualImpact: string;
  predictedLossINR: number | null;
  actualLossINR: number | null;
  valueRecoveredINR: number | null;
  delta: string;
  accuracyScore: number;
  // OUT-01: model estimate, not measured (see OutcomeSnapshot).
  accuracyBasis: "model_confidence_delta";
  measured: false;
  // OUT-02: whether this outcome routed into governed re-evaluation.
  reassessmentTriggered: boolean;
  timestamp: string;
}

export interface EngagementOutcomes {
  outcomes: ActionOutcome[];
  averageAccuracy: number;
  totalActionsCompleted: number;
  totalValueRecoveredINR: number;
  financialMetrics: {
    totalRecoveredINR: number;
    currentRiskINR: number | null;
    avgPerActionINR: number;
  };
}

export async function recordOutcome(
  actionId: string,
  actorId?: string,
  idempotencyKey?: string,
  workspaceId: string = "unknown"
): Promise<ActionOutcome> {
  // Idempotency check
  if (idempotencyKey && actorId) {
    const { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } = await import(
      "@/services/idempotency"
    );

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "recordOutcome",
      actorId,
      payload: { actionId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body as unknown as ActionOutcome;
    }

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }
  }

  try {
    // Fetch the action
    const action = await db.action.findFirst({
      where: {
        id: actionId,
        engagement: { workspaceId },
      },
    });

    if (!action) {
      throw new NotFoundError("Action", actionId);
    }

    if (!action.completedAt) {
      throw new Error("Action must be completed before recording outcome");
    }

    const engagementId = action.engagementId;

  // Get current state (actual impact) and engagement context
  const [currentConfidence, currentImpact, engagement, condition] = await Promise.all([
    computeDecisionConfidence({ engagementId, workspaceId }),
    generateBusinessImpact(engagementId, engagementId, workspaceId),
    db.engagement.findUnique({ where: { id: engagementId, workspaceId }, select: { id: true } }),
    db.businessConditionProfile.findFirst({
      where: { engagementId, isCurrent: true, workspaceId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Get previous snapshot if exists
  let predictedImpactLevel = "unknown";
  let predictedConfidence = 50;
  let predictedLossINR: number | null = null;

  // SCHEMA fix: Action has no `outcomeSnapshot` column (only `metadata Json?`); the
  // previous code wrote/read a non-existent field and threw at runtime. Persist the
  // outcome snapshot under metadata.outcomeSnapshot instead.
  const actionMetadata: Record<string, unknown> =
    action.metadata && typeof action.metadata === "object" && !Array.isArray(action.metadata)
      ? (action.metadata as Record<string, unknown>)
      : {};
  const priorSnapshot = actionMetadata.outcomeSnapshot;
  if (priorSnapshot && typeof priorSnapshot === "object") {
    const snapshot = priorSnapshot as Record<string, unknown>;
    if (typeof snapshot.predictedImpactLevel === "string") {
      predictedImpactLevel = snapshot.predictedImpactLevel;
    }
    if (typeof snapshot.predictedConfidence === "number") {
      predictedConfidence = snapshot.predictedConfidence;
    }
    if (typeof snapshot.predictedLossINR === "number") {
      predictedLossINR = snapshot.predictedLossINR;
    }
  }

  // Calculate financial impact
  const monthlyRevenue = condition?.estimatedMonthlyRevenue ?? null;
  const financialDelta = getFinancialDelta(
    predictedImpactLevel,
    currentImpact?.impactLevel || "unknown",
    monthlyRevenue
  );

  const actualLossINR = financialDelta.actualLoss;
  const valueRecoveredINR = financialDelta.valueRecovered || 0;

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
    predictedLossINR: financialDelta.predictedLoss,
    actualLossINR,
    valueRecoveredINR,
    delta: {
      impactImprovement: deltaDescription,
      confidenceGain: confidenceImprovement,
    },
    accuracyScore,
    accuracyBasis: "model_confidence_delta",
    measured: false,
    timestamp,
  };

    // Store outcome snapshot in the action's metadata JSON (Action has no dedicated
    // outcomeSnapshot column). Preserve any existing metadata keys.
    await db.action.update({
      where: { id: actionId },
      data: {
        metadata: { ...actionMetadata, outcomeSnapshot } as object,
      },
    });

    // Emit audit event for outcome recording
    const auditWorkspaceId = workspaceId || engagement?.workspaceId || "unknown";
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
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.warn("Failed to emit audit event for outcome recording", {
        actionId,
        error: governed.operatorMessage,
      });
    });

    // OUT-02: a regressed or low-accuracy outcome is a failed implementation and MUST
    // route into governed re-evaluation (BusinessConditionProfile / InterventionMode /
    // InterventionPhase / priorities / review cadence / health). Previously recordOutcome
    // computed the regression and did nothing with it — the reassessment loop was unwired.
    const regressed = actualIndex > predictedIndex;
    const lowAccuracy = accuracyScore < 40;
    let reassessmentTriggered = false;
    if (regressed || lowAccuracy) {
      try {
        const { triggerReEvaluation } = await import("@/services/re-evaluation");
        await triggerReEvaluation({
          changeType: "failed_implementation",
          entityType: "action",
          entityId: actionId,
          engagementId,
          workspaceId: auditWorkspaceId,
          severity: regressed ? "high" : "medium",
          description: regressed
            ? `Action ${actionId} outcome ${deltaDescription}`
            : `Action ${actionId} outcome has low model accuracy (${accuracyScore})`,
          triggeredBy: actorId || "system",
          correlationId: `outcome:${actionId}`,
        });
        reassessmentTriggered = true;
      } catch (error) {
        logger.error("Failed to trigger re-evaluation after adverse outcome", {
          actionId,
          engagementId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

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
      accuracyBasis: "model_confidence_delta" as const,
      measured: false as const,
      reassessmentTriggered,
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

  const outcomeSnapshotOf = (a: typeof completedActions[0]): Record<string, unknown> | null => {
    const m = a.metadata;
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    const snap = (m as Record<string, unknown>).outcomeSnapshot;
    return snap && typeof snap === "object" ? (snap as Record<string, unknown>) : null;
  };

  const outcomes: ActionOutcome[] = completedActions
    .filter((a: typeof completedActions[0]) => outcomeSnapshotOf(a) !== null)
    .map((a: typeof completedActions[0]) => {
      const snapshot = outcomeSnapshotOf(a)!;
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
        accuracyBasis: "model_confidence_delta" as const,
        measured: false as const,
        reassessmentTriggered: snapshot.reassessmentTriggered === true,
        timestamp: typeof snapshot.timestamp === "string" ? snapshot.timestamp : new Date().toISOString(),
      };
    });

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
