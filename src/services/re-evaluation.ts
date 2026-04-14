import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";

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
      return {
        ...all,
        interventionPhase: false,
      };

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
      return {
        businessConditionProfile: true,
        interventionMode: true,
        interventionPhase: true,
        recommendationPriority: true,
        actionPriority: true,
        reviewCadence: true,
        healthStatus: true,
      };

    default: {
      const _exhaustive: never = changeType;
      return _exhaustive;
    }
  }
}

export async function triggerReEvaluation(
  event: SignificantChangeEvent
): Promise<{ targets: ReEvaluationTarget; auditEventId: string }> {
  const targets = determineReEvaluationTargets(event.changeType);

  logger.info("Re-evaluation triggered", {
    changeType: event.changeType,
    entityType: event.entityType,
    entityId: event.entityId,
    engagementId: event.engagementId,
    severity: event.severity,
    targets,
  });

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
    },
  });

  // Domain modules will subscribe to this event and execute their
  // re-evaluation logic (e.g., recalculate business condition score,
  // check if intervention mode should shift, reprioritize actions).
  // This is the extensibility point — not a stub, but the dispatch
  // mechanism that downstream modules hook into.

  return { targets, auditEventId };
}
