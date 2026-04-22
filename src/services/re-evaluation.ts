import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import {
  INTERVENTION_MODES,
  INTERVENTION_PHASES,
  BUSINESS_CONDITION_RATINGS,
  type InterventionMode,
  type InterventionPhase,
  type BusinessConditionRating,
} from "@/domain/constants/statuses";

// Safety guards for re-evaluation
const requestDebounceMap = new Map<string, Set<string>>();
const reEvaluationInProgress = new Set<string>();
const processedCorrelationIds = new Set<string>();

export const SIGNIFICANT_CHANGE_TYPES = [
  "new_critical_evidence",
  "kpi_deterioration",
  "unresolved_critical_blocker",
  "failed_implementation",
  "shock_event",
  "scope_change",
  "owner_non_compliance",
  "major_client_loss",
  "key_employee_loss",
  "risk_escalation",
  "stage_blocked",
  "intervention_override",
] as const;

export type SignificantChangeType = (typeof SIGNIFICANT_CHANGE_TYPES)[number];

export interface SignificantChangeEvent {
  changeType: SignificantChangeType;
  entityType: string;
  entityId: string;
  engagementId?: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  triggeredBy: string;
  correlationId?: string;
}

export interface ReEvaluationTarget {
  businessConditionProfile: boolean;
  interventionMode: boolean;
  interventionPhase: boolean;
  recommendationPriority: boolean;
  actionPriority: boolean;
  reviewCadence: boolean;
  healthStatus: boolean;
}

export interface ReEvaluationResult {
  targets: ReEvaluationTarget;
  businessConditionImpact: {
    recommendedRating: BusinessConditionRating;
    reasoningFactors: string[];
    severityScoreDelta: number;
  };
  interventionModeImpact: {
    recommendedMode: InterventionMode;
    reasoningFactors: string[];
  };
  interventionPhaseImpact: {
    recommendedPhase?: InterventionPhase;
    canAdvance: boolean;
    blockers: string[];
  };
  priorityImpact: {
    actionPriorityShift: "escalate" | "maintain" | "deescalate";
    recommendationPriorityShift: "escalate" | "maintain" | "deescalate";
  };
  reviewCadenceImpact: {
    recommendedDaysUntilReview: number;
    riskLevel: "low" | "medium" | "high" | "critical";
  };
  healthStatusImpact: {
    recommendedStatus: "healthy" | "at_risk" | "critical" | "unknown";
    healthScore: number;
  };
  auditEventId: string;
}

function determineReEvaluationTargets(
  changeType: SignificantChangeType
): ReEvaluationTarget {
  const all: ReEvaluationTarget = {
    businessConditionProfile: true,
    interventionMode: true,
    interventionPhase: true,
    recommendationPriority: true,
    actionPriority: true,
    reviewCadence: true,
    healthStatus: true,
  };

  switch (changeType) {
    case "shock_event":
    case "major_client_loss":
    case "key_employee_loss":
      return all;

    case "kpi_deterioration":
    case "failed_implementation":
      return { ...all, interventionPhase: false };

    case "new_critical_evidence":
      return {
        businessConditionProfile: true,
        interventionMode: false,
        interventionPhase: false,
        recommendationPriority: true,
        actionPriority: true,
        reviewCadence: false,
        healthStatus: true,
      };

    case "scope_change":
      return {
        businessConditionProfile: false,
        interventionMode: true,
        interventionPhase: true,
        recommendationPriority: true,
        actionPriority: true,
        reviewCadence: true,
        healthStatus: false,
      };

    case "unresolved_critical_blocker":
    case "stage_blocked":
      return {
        businessConditionProfile: false,
        interventionMode: false,
        interventionPhase: false,
        recommendationPriority: true,
        actionPriority: true,
        reviewCadence: true,
        healthStatus: true,
      };

    case "owner_non_compliance":
      return {
        businessConditionProfile: false,
        interventionMode: false,
        interventionPhase: false,
        recommendationPriority: true,
        actionPriority: true,
        reviewCadence: true,
        healthStatus: true,
      };

    case "risk_escalation":
    case "intervention_override":
      return all;

    default: {
      const _exhaustive: never = changeType;
      return _exhaustive;
    }
  }
}

async function evaluateBusinessConditionImpact(engagementId: string) {
  const current = await db.businessConditionProfile.findFirst({
    where: { engagementId, isCurrent: true },
  });

  if (!current) {
    return {
      recommendedRating: "challenged" as BusinessConditionRating,
      reasoningFactors: ["no_assessment_available"],
      severityScoreDelta: 0,
    };
  }

  const factors: string[] = [];
  let severityDelta = 0;

  // Evaluate critical risks
  const criticalRisks = [
    current.cashPressureLevel === "critical" ? "critical_cash_pressure" : null,
    current.marginPressureLevel === "critical" ? "critical_margin_pressure" : null,
    current.ownerDependencyRisk === "critical" ? "owner_dependency_critical" : null,
    current.moraleFragilityLevel === "critical" ? "morale_fragility_critical" : null,
  ].filter(Boolean);

  // Evaluate KPI trends (improved or deteriorated)
  const kpis = await db.kPI.findMany({
    where: { engagementId },
    select: { baseline: true, currentValue: true, direction: true },
  });

  if (kpis.length > 0) {
    const deterior = kpis.filter((k) => {
      if (k.direction === "increase" && k.currentValue !== null && k.baseline !== null) {
        return k.currentValue < k.baseline;
      } else if (k.direction === "decrease" && k.currentValue !== null && k.baseline !== null) {
        return k.currentValue > k.baseline;
      }
      return false;
    });

    if (deterior.length > kpis.length / 2) {
      factors.push("kpi_deterioration");
      severityDelta += 1;
    } else if (deterior.length === 0) {
      factors.push("kpi_improving");
      severityDelta -= 1;
    }
  }

  // Evaluate recent shocks (weighted by severity)
  const recentShocks = await db.shockEvent.findMany({
    where: {
      engagementId,
      happenedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    select: { severity: true },
  });

  const shockWeight = recentShocks.reduce((sum, s) => {
    const weight =
      s.severity === "critical"
        ? 3
        : s.severity === "high"
          ? 2
          : s.severity === "medium"
            ? 1
            : 0;
    return sum + weight;
  }, 0);

  if (shockWeight >= 3) {
    factors.push("critical_shocks");
    severityDelta += 2;
  } else if (shockWeight > 0) {
    factors.push("recent_shocks");
    severityDelta += 1;
  }

  if (criticalRisks.length > 0) {
    factors.push(...(criticalRisks as string[]));
    severityDelta = Math.max(severityDelta, 3);
  }

  let recommendedRating = current.businessStatus as BusinessConditionRating;

  if (criticalRisks.length > 0) {
    recommendedRating = "critical";
  } else if (current.severityScore + severityDelta >= 8) {
    recommendedRating = "distressed";
  } else if (current.severityScore + severityDelta >= 6) {
    recommendedRating = "challenged";
  } else if (current.severityScore + severityDelta >= 4) {
    recommendedRating = "stable";
  } else {
    recommendedRating = "improving";
  }

  return {
    recommendedRating,
    reasoningFactors: factors.length > 0 ? factors : ["assessment_stable"],
    severityScoreDelta: severityDelta,
  };
}

async function evaluateInterventionModeImpact(engagementId: string) {
  const engagement = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!engagement) {
    return {
      recommendedMode: "recovery" as InterventionMode,
      reasoningFactors: ["engagement_not_found"],
    };
  }

  const factors: string[] = [];
  const condition = await db.businessConditionProfile.findFirst({
    where: { engagementId, isCurrent: true },
  });

  if (!condition) {
    return {
      recommendedMode: engagement.interventionMode as InterventionMode,
      reasoningFactors: ["no_condition_assessment"],
    };
  }

  if (condition.businessStatus === "critical" || condition.businessStatus === "distressed") {
    factors.push("distressed_condition");
    if (condition.cashPressureLevel === "critical" || condition.marginPressureLevel === "critical") {
      factors.push("critical_financial_pressure");
      return {
        recommendedMode: "recovery" as InterventionMode,
        reasoningFactors: factors,
      };
    }
    return {
      recommendedMode: "stabilization" as InterventionMode,
      reasoningFactors: factors,
    };
  }

  if (condition.businessStatus === "improving" || condition.businessStatus === "strong") {
    factors.push("improving_trajectory");
    return {
      recommendedMode: "growth" as InterventionMode,
      reasoningFactors: factors,
    };
  }

  factors.push("maintaining_current_mode");
  return {
    recommendedMode: engagement.interventionMode as InterventionMode,
    reasoningFactors: factors,
  };
}

async function evaluateInterventionPhaseImpact(engagementId: string) {
  // Determine phase based on findings and actions (deterministic lifecycle rules)
  const findings = await db.finding.findMany({
    where: { engagementId },
    select: { id: true, status: true },
  });

  const actions = await db.action.findMany({
    where: { engagementId },
    select: { id: true, status: true },
  });

  const blockers: string[] = [];
  let recommendedPhase: InterventionPhase | undefined;

  // Phase suggestion logic based on findings and actions
  if (findings.length === 0) {
    recommendedPhase = "assessment";
  } else if (actions.length === 0) {
    recommendedPhase = "planning";
  } else {
    const completedCount = actions.filter((a) => a.status === "completed").length;
    const activeCount = actions.filter((a) => a.status !== "completed" && a.status !== "cancelled")
      .length;

    if (activeCount > 0) {
      recommendedPhase = "execution";
    } else if (completedCount === actions.length) {
      recommendedPhase = "review";
    } else {
      recommendedPhase = "execution";
    }
  }

  const canAdvance = blockers.length === 0;

  return { recommendedPhase, canAdvance, blockers };
}

function evaluatePriorityImpact(
  conditionImpact: Awaited<ReturnType<typeof evaluateBusinessConditionImpact>>,
  modeImpact: Awaited<ReturnType<typeof evaluateInterventionModeImpact>>
) {
  let actionPriorityShift: "escalate" | "maintain" | "deescalate" = "maintain";
  let recommendationPriorityShift: "escalate" | "maintain" | "deescalate" = "maintain";

  if (
    conditionImpact.recommendedRating === "critical" ||
    conditionImpact.recommendedRating === "distressed"
  ) {
    actionPriorityShift = "escalate";
    recommendationPriorityShift = "escalate";
  } else if (conditionImpact.severityScoreDelta < -1) {
    actionPriorityShift = "deescalate";
    recommendationPriorityShift = "deescalate";
  }

  return { actionPriorityShift, recommendationPriorityShift };
}

function evaluateReviewCadenceImpact(
  conditionImpact: Awaited<ReturnType<typeof evaluateBusinessConditionImpact>>,
  modeImpact: Awaited<ReturnType<typeof evaluateInterventionModeImpact>>
) {
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let daysUntilReview = 30;

  if (conditionImpact.recommendedRating === "critical") {
    riskLevel = "critical";
    daysUntilReview = 3;
  } else if (conditionImpact.recommendedRating === "distressed") {
    riskLevel = "high";
    daysUntilReview = 7;
  } else if (conditionImpact.recommendedRating === "challenged" || modeImpact.recommendedMode === "recovery") {
    riskLevel = "medium";
    daysUntilReview = 14;
  } else if (modeImpact.recommendedMode === "growth") {
    riskLevel = "low";
    daysUntilReview = 30;
  }

  return { riskLevel, recommendedDaysUntilReview: daysUntilReview };
}

async function evaluateHealthStatusImpact(
  conditionImpact: Awaited<ReturnType<typeof evaluateBusinessConditionImpact>>,
  engagementId: string
) {
  let healthScore = 100;
  let recommendedStatus: "healthy" | "at_risk" | "critical" | "unknown" = "healthy";

  const condition = await db.businessConditionProfile.findFirst({
    where: { engagementId, isCurrent: true },
  });

  if (!condition) {
    return { healthScore: 50, recommendedStatus: "unknown" as const };
  }

  if (
    conditionImpact.recommendedRating === "critical" ||
    conditionImpact.recommendedRating === "distressed"
  ) {
    healthScore = Math.max(0, 30 - conditionImpact.severityScoreDelta * 5);
    recommendedStatus = "critical";
  } else if (conditionImpact.recommendedRating === "challenged") {
    healthScore = Math.max(40, 65 - conditionImpact.severityScoreDelta * 5);
    recommendedStatus = "at_risk";
  } else {
    healthScore = Math.min(100, 85 - conditionImpact.severityScoreDelta * 5);
    recommendedStatus = "healthy";
  }

  if (condition.moraleFragilityLevel === "critical") {
    healthScore = Math.max(healthScore - 20, 0);
  }

  if (healthScore <= 40) {
    recommendedStatus = "critical";
  } else if (healthScore <= 70) {
    recommendedStatus = "at_risk";
  }

  return { healthScore, recommendedStatus };
}

export async function triggerReEvaluation(event: SignificantChangeEvent): Promise<ReEvaluationResult> {
  if (!event.engagementId) {
    throw new Error("engagementId required for re-evaluation");
  }

  // Safety Guard 1: Debounce - prevent duplicate within same request
  const requestKey = `${Date.now()}`;
  if (!requestDebounceMap.has(requestKey)) {
    requestDebounceMap.set(requestKey, new Set());
  }
  const debounceKey = `${event.engagementId}:${event.changeType}`;
  const debouncedKeys = requestDebounceMap.get(requestKey)!;
  if (debouncedKeys.has(debounceKey)) {
    logger.info("Re-evaluation debounced (duplicate in request)", {
      engagementId: event.engagementId,
      changeType: event.changeType,
      entityId: event.entityId,
    });
    throw new Error(`Re-evaluation already triggered for ${debounceKey} in this request`);
  }
  debouncedKeys.add(debounceKey);

  // Safety Guard 2: Idempotency - check correlationId
  if (event.correlationId && processedCorrelationIds.has(event.correlationId)) {
    logger.info("Re-evaluation skipped (idempotent duplicate)", {
      engagementId: event.engagementId,
      changeType: event.changeType,
      correlationId: event.correlationId,
    });
    throw new Error(`Re-evaluation already processed for correlationId: ${event.correlationId}`);
  }
  if (event.correlationId) {
    processedCorrelationIds.add(event.correlationId);
  }

  // Safety Guard 3: Recursion guard - prevent re-eval triggering itself
  if (reEvaluationInProgress.has(event.engagementId)) {
    logger.warn("Re-evaluation recursion detected", {
      engagementId: event.engagementId,
      changeType: event.changeType,
      entityId: event.entityId,
    });
    throw new Error(`Re-evaluation already in progress for engagement ${event.engagementId}`);
  }
  reEvaluationInProgress.add(event.engagementId);

  try {
    // Structured logging with context
    logger.info("Re-evaluation triggered", {
      engagementId: event.engagementId,
      triggerType: event.changeType,
      entityType: event.entityType,
      entityId: event.entityId,
      severity: event.severity,
      description: event.description,
    });

    const targets = determineReEvaluationTargets(event.changeType);

  const businessConditionImpact = targets.businessConditionProfile
    ? await evaluateBusinessConditionImpact(event.engagementId)
    : {
        recommendedRating: "stable" as BusinessConditionRating,
        reasoningFactors: ["target_not_evaluated"],
        severityScoreDelta: 0,
      };

  const interventionModeImpact = targets.interventionMode
    ? await evaluateInterventionModeImpact(event.engagementId)
    : {
        recommendedMode: "recovery" as InterventionMode,
        reasoningFactors: ["target_not_evaluated"],
      };

  const interventionPhaseImpact = targets.interventionPhase
    ? await evaluateInterventionPhaseImpact(event.engagementId)
    : {
        recommendedPhase: undefined,
        canAdvance: false,
        blockers: ["target_not_evaluated"],
      };

  const priorityImpact = targets.recommendationPriority || targets.actionPriority
    ? evaluatePriorityImpact(businessConditionImpact, interventionModeImpact)
    : {
        actionPriorityShift: "maintain" as const,
        recommendationPriorityShift: "maintain" as const,
      };

  const reviewCadenceImpact = targets.reviewCadence
    ? evaluateReviewCadenceImpact(businessConditionImpact, interventionModeImpact)
    : {
        riskLevel: "low" as const,
        recommendedDaysUntilReview: 30,
      };

  const healthStatusImpact = targets.healthStatus
    ? await evaluateHealthStatusImpact(businessConditionImpact, event.engagementId)
    : {
        healthScore: 50,
        recommendedStatus: "unknown" as const,
      };

  // Persist results in a transaction
  const auditEventId = await db.$transaction(async (tx) => {
    const auditPayload: Record<string, unknown> = {
      changeType: event.changeType,
      severity: event.severity,
      description: event.description,
      engagementId: event.engagementId,
      reEvaluationTargets: targets,
      businessConditionImpact,
      interventionModeImpact,
      interventionPhaseImpact,
      priorityImpact,
      reviewCadenceImpact,
      healthStatusImpact,
    };

    // Fetch current values
    const engagement = await tx.engagement.findUnique({
      where: { id: event.engagementId },
      select: { id: true, healthStatus: true },
    });

    const condition = await tx.businessConditionProfile.findFirst({
      where: { engagementId: event.engagementId, isCurrent: true },
      select: { id: true, businessStatus: true },
    });

    // 1. Update engagement health status if changed
    if (targets.healthStatus && engagement && engagement.healthStatus !== healthStatusImpact.recommendedStatus) {
      auditPayload.healthStatusChange = {
        oldValue: engagement.healthStatus,
        newValue: healthStatusImpact.recommendedStatus,
      };

      await tx.engagement.update({
        where: { id: event.engagementId },
        data: { healthStatus: healthStatusImpact.recommendedStatus },
      });
    }

    // 2. Update business condition profile if changed
    if (targets.businessConditionProfile && condition && condition.businessStatus !== businessConditionImpact.recommendedRating) {
      auditPayload.businessConditionChange = {
        oldValue: condition.businessStatus,
        newValue: businessConditionImpact.recommendedRating,
      };

      await tx.businessConditionProfile.update({
        where: { id: condition.id },
        data: { businessStatus: businessConditionImpact.recommendedRating },
      });
    }

    // 3. Update intervention phase if changed and allowed
    if (targets.interventionPhase && interventionPhaseImpact.recommendedPhase) {
      const state = await tx.interventionState.findUnique({
        where: { engagementId: event.engagementId },
        select: { id: true, currentPhase: true },
      });

      if (state && state.currentPhase !== interventionPhaseImpact.recommendedPhase) {
        auditPayload.interventionPhaseChange = {
          oldValue: state.currentPhase,
          newValue: interventionPhaseImpact.recommendedPhase,
          canAdvance: interventionPhaseImpact.canAdvance,
        };

        await tx.interventionState.update({
          where: { id: state.id },
          data: { currentPhase: interventionPhaseImpact.recommendedPhase },
        });
      }
    }

    // 4. Update recommendation priorities if shift detected
    if (targets.recommendationPriority && priorityImpact.recommendationPriorityShift !== "maintain") {
      const recs = await tx.recommendation.findMany({
        where: { engagementId: event.engagementId },
        select: { id: true, priority: true },
      });

      const priorityMap: Record<string, string> = {
        low: "medium",
        medium: "high",
        high: "critical",
        critical: "critical",
      };
      const deprioritizeMap: Record<string, string> = {
        critical: "high",
        high: "medium",
        medium: "low",
        low: "low",
      };

      const shiftMap =
        priorityImpact.recommendationPriorityShift === "escalate" ? priorityMap : deprioritizeMap;

      const updated = await Promise.all(
        recs.map((r) =>
          tx.recommendation.update({
            where: { id: r.id },
            data: { priority: shiftMap[r.priority] || r.priority },
          })
        )
      );

      if (updated.length > 0) {
        auditPayload.recommendationPriorityShift = priorityImpact.recommendationPriorityShift;
        auditPayload.recommendationsAffected = updated.length;
      }
    }

    // Emit comprehensive audit event
    const eventId = await emitAuditEvent({
      eventName: AUDIT_EVENTS.CONDITION_CHANGED,
      actorId: event.triggeredBy,
      entityType: event.entityType,
      entityId: event.entityId,
      correlationId: event.correlationId,
      payload: auditPayload,
      visibility: "internal",
    });

    return eventId;
  });

    logger.info("Re-evaluation completed and persisted", {
      changeType: event.changeType,
      triggerType: event.changeType,
      engagementId: event.engagementId,
      entityType: event.entityType,
      entityId: event.entityId,
      severity: event.severity,
      businessConditionImpact: businessConditionImpact.recommendedRating,
      interventionModeImpact: interventionModeImpact.recommendedMode,
      healthStatus: healthStatusImpact.recommendedStatus,
    });

    return {
      targets,
      businessConditionImpact,
      interventionModeImpact,
      interventionPhaseImpact,
      priorityImpact,
      reviewCadenceImpact,
      healthStatusImpact,
      auditEventId,
    };
  } catch (error) {
    // Safety Guard 4: Failure handling - propagate error to fail transaction
    logger.error("Re-evaluation failed", {
      engagementId: event.engagementId,
      triggerType: event.changeType,
      entityId: event.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    // Safety Guard 3 cleanup: Remove recursion guard
    reEvaluationInProgress.delete(event.engagementId);
  }
}
