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

  const criticalRisks = [
    current.cashPressureLevel === "critical" ? "critical_cash_pressure" : null,
    current.marginPressureLevel === "critical" ? "critical_margin_pressure" : null,
    current.ownerDependencyRisk === "critical" ? "owner_dependency_critical" : null,
    current.moraleFragilityLevel === "critical" ? "morale_fragility_critical" : null,
  ].filter(Boolean);

  if (criticalRisks.length > 0) {
    factors.push(...(criticalRisks as string[]));
    severityDelta = 3;
  }

  let recommendedRating = current.businessStatus as BusinessConditionRating;

  if (criticalRisks.length > 0) {
    recommendedRating = "critical";
  } else if (current.severityScore >= 8) {
    recommendedRating = "distressed";
  } else if (current.severityScore >= 6) {
    recommendedRating = "challenged";
  } else if (current.severityScore >= 4) {
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
  const state = await db.interventionState.findUnique({ where: { engagementId } });

  if (!state) {
    return {
      recommendedPhase: undefined,
      canAdvance: false,
      blockers: ["no_intervention_state"],
    };
  }

  const currentPhase = state.currentPhase as InterventionPhase;
  const blockers: string[] = [];

  let recommendedPhase = currentPhase;
  const canAdvance = blockers.length === 0;

  if (canAdvance) {
    if (currentPhase === "assessment") {
      recommendedPhase = "planning" as InterventionPhase;
    } else if (currentPhase === "planning") {
      recommendedPhase = "execution" as InterventionPhase;
    } else if (currentPhase === "execution") {
      recommendedPhase = "review" as InterventionPhase;
    } else if (currentPhase === "review") {
      recommendedPhase = "handover" as InterventionPhase;
    }
  }

  return { recommendedPhase: canAdvance ? recommendedPhase : undefined, canAdvance, blockers };
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

  const auditEventId = await emitAuditEvent({
    eventName: AUDIT_EVENTS.CONDITION_CHANGED,
    actorId: event.triggeredBy,
    entityType: event.entityType,
    entityId: event.entityId,
    correlationId: event.correlationId,
    payload: {
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
    },
    visibility: "internal",
  });

  logger.info("Re-evaluation completed", {
    changeType: event.changeType,
    entityType: event.entityType,
    entityId: event.entityId,
    engagementId: event.engagementId,
    severity: event.severity,
    targets,
    businessConditionImpact: businessConditionImpact.recommendedRating,
    interventionModeImpact: interventionModeImpact.recommendedMode,
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
}
