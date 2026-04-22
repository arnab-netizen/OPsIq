import { InvalidStateTransitionError } from "@/infra/errors";
import {
  GOVERNED_STAGE_STATES,
  type GovernedStageState,
  ACTION_STATUSES,
  type ActionStatus,
  EVIDENCE_STATUSES,
  type EvidenceStatus,
  APPROVAL_STATUSES,
  type ApprovalStatus,
  RISK_STATUSES,
  type RiskStatus,
  ENGAGEMENT_STATUSES,
  type EngagementStatus,
  DELIVERABLE_STATUSES,
  type DeliverableStatus,
  INTERVENTION_PHASES,
  type InterventionPhase,
} from "@/domain/constants/statuses";

type TransitionMap<T extends string> = Partial<Record<T, readonly T[]>>;

const STAGE_TRANSITIONS: TransitionMap<GovernedStageState> = {
  draft: ["not_started", "cancelled"],
  not_started: ["active", "deferred", "cancelled"],
  active: [
    "pending_input",
    "awaiting_client",
    "awaiting_consultant",
    "awaiting_validation",
    "awaiting_approval",
    "blocked",
    "deferred",
    "partially_completed",
    "completed",
    "cancelled",
    "provisional_output_only",
    "dormant",
  ],
  pending_input: ["active", "blocked", "deferred", "cancelled"],
  awaiting_client: ["active", "blocked", "deferred", "cancelled"],
  awaiting_consultant: ["active", "blocked", "deferred", "cancelled"],
  awaiting_validation: ["active", "blocked", "cancelled", "disputed"],
  awaiting_approval: ["active", "completed", "cancelled", "disputed"],
  blocked: ["active", "deferred", "cancelled", "forced_closure_review"],
  deferred: ["not_started", "active", "cancelled", "dormant"],
  partially_completed: ["active", "completed", "blocked", "cancelled"],
  completed: ["reopened"],
  cancelled: ["reopened"],
  reopened: ["active", "blocked", "cancelled"],
  disputed: ["active", "awaiting_approval", "cancelled", "forced_closure_review"],
  provisional_output_only: ["active", "awaiting_validation", "cancelled"],
  forced_closure_review: ["completed", "cancelled", "active"],
  dormant: ["active", "deferred", "cancelled"],
};

const ACTION_TRANSITIONS: TransitionMap<ActionStatus> = {
  draft: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled", "overdue"],
  blocked: ["in_progress", "cancelled"],
  completed: ["verified"],
  overdue: ["in_progress", "blocked", "cancelled"],
  verified: [],
  cancelled: [],
};

const EVIDENCE_TRANSITIONS: TransitionMap<EvidenceStatus> = {
  submitted: ["under_review", "rejected"],
  under_review: ["validated", "rejected"],
  validated: ["superseded"],
  rejected: ["submitted"],
  superseded: [],
};

const APPROVAL_TRANSITIONS: TransitionMap<ApprovalStatus> = {
  pending: ["approved", "denied", "withdrawn"],
  approved: [],
  denied: [],
  withdrawn: [],
};

const RISK_TRANSITIONS: TransitionMap<RiskStatus> = {
  identified: ["assessed"],
  assessed: ["mitigating", "accepted", "escalated"],
  mitigating: ["mitigated", "escalated"],
  mitigated: ["closed"],
  accepted: ["closed", "escalated"],
  escalated: ["mitigating", "accepted", "closed"],
  closed: [],
};

const ENGAGEMENT_TRANSITIONS: TransitionMap<EngagementStatus> = {
  draft: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  completed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};

const DELIVERABLE_TRANSITIONS: TransitionMap<DeliverableStatus> = {
  draft: ["in_progress", "cancelled"],
  in_progress: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["approved", "rejected"],
  approved: ["superseded"],
  rejected: ["in_progress"],
  superseded: [],
  cancelled: [],
};

const INTERVENTION_PHASE_TRANSITIONS: TransitionMap<InterventionPhase> = {
  assessment: ["planning"],
  planning: ["execution"],
  execution: ["review"],
  review: ["handover", "execution"],
  handover: ["closed"],
  closed: [],
};

function validateTransitionGeneric<T extends string>(
  entityType: string,
  transitions: TransitionMap<T>,
  validStates: readonly T[],
  from: T,
  to: T
): void {
  if (!validStates.includes(from)) {
    throw new InvalidStateTransitionError(entityType, from, to);
  }
  if (!validStates.includes(to)) {
    throw new InvalidStateTransitionError(entityType, from, to);
  }
  const allowed = transitions[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidStateTransitionError(entityType, from, to);
  }
}

export function validateStageTransition(from: GovernedStageState, to: GovernedStageState): void {
  validateTransitionGeneric("Stage", STAGE_TRANSITIONS, GOVERNED_STAGE_STATES, from, to);
}

export function validateActionTransition(from: ActionStatus, to: ActionStatus): void {
  validateTransitionGeneric("Action", ACTION_TRANSITIONS, ACTION_STATUSES, from, to);
}

export function validateEvidenceTransition(from: EvidenceStatus, to: EvidenceStatus): void {
  validateTransitionGeneric("Evidence", EVIDENCE_TRANSITIONS, EVIDENCE_STATUSES, from, to);
}

export function validateApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  validateTransitionGeneric("Approval", APPROVAL_TRANSITIONS, APPROVAL_STATUSES, from, to);
}

export function validateRiskTransition(from: RiskStatus, to: RiskStatus): void {
  validateTransitionGeneric("Risk", RISK_TRANSITIONS, RISK_STATUSES, from, to);
}

export function validateEngagementTransition(from: EngagementStatus, to: EngagementStatus): void {
  validateTransitionGeneric("Engagement", ENGAGEMENT_TRANSITIONS, ENGAGEMENT_STATUSES, from, to);
}

export function validateDeliverableTransition(from: DeliverableStatus, to: DeliverableStatus): void {
  validateTransitionGeneric("Deliverable", DELIVERABLE_TRANSITIONS, DELIVERABLE_STATUSES, from, to);
}

export function getAllowedTransitions<T extends string>(
  transitions: TransitionMap<T>,
  from: T
): readonly T[] {
  return transitions[from] ?? [];
}

export function getStageAllowedTransitions(from: GovernedStageState): readonly GovernedStageState[] {
  return getAllowedTransitions(STAGE_TRANSITIONS, from);
}

export function validateInterventionPhaseTransition(from: InterventionPhase, to: InterventionPhase): void {
  validateTransitionGeneric("InterventionPhase", INTERVENTION_PHASE_TRANSITIONS, INTERVENTION_PHASES, from, to);
}

export function getInterventionPhaseAllowedTransitions(from: InterventionPhase): readonly InterventionPhase[] {
  return getAllowedTransitions(INTERVENTION_PHASE_TRANSITIONS, from);
}
