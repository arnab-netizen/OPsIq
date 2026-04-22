import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { INTERVENTION_PHASES, type InterventionPhase } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface InitializeInterventionStateInput {
  engagementId: string;
  initialPhase?: InterventionPhase;
}

// ─── Phase Transition Validation ──────────────────────────────────────────

const PHASE_TRANSITIONS: Partial<Record<InterventionPhase, readonly InterventionPhase[]>> = {
  assessment: ["planning"],
  planning: ["execution", "assessment"],
  execution: ["review", "planning"],
  review: ["handover", "execution"],
  handover: ["closed", "execution"],
  closed: [],
};

function validatePhaseTransition(from: InterventionPhase, to: InterventionPhase): void {
  if (!INTERVENTION_PHASES.includes(from)) {
    throw new ValidationError(
      `Invalid current phase: ${from}. Must be one of: ${INTERVENTION_PHASES.join(", ")}`
    );
  }
  if (!INTERVENTION_PHASES.includes(to)) {
    throw new ValidationError(
      `Invalid target phase: ${to}. Must be one of: ${INTERVENTION_PHASES.join(", ")}`
    );
  }

  const allowed = PHASE_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ValidationError(
      `Cannot transition from "${from}" to "${to}". Allowed transitions from "${from}": ${allowed?.join(", ") || "none"}`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function initializeInterventionState(
  input: InitializeInterventionStateInput,
  actorId: string
): Promise<{ id: string; engagementId: string; currentPhase: InterventionPhase }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Check if intervention state already exists
  const existing = await db.interventionState.findUnique({
    where: { engagementId: input.engagementId },
  });
  if (existing) {
    throw new ValidationError("Intervention state already exists for this engagement");
  }

  const initialPhase = input.initialPhase ?? ("assessment" as InterventionPhase);

  // Validate initial phase
  if (!INTERVENTION_PHASES.includes(initialPhase)) {
    throw new ValidationError(
      `Invalid initial phase: ${initialPhase}. Must be one of: ${INTERVENTION_PHASES.join(", ")}`
    );
  }

  const state = await db.interventionState.create({
    data: {
      engagementId: input.engagementId,
      currentPhase: initialPhase,
      previousPhase: null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_PHASE_CHANGED,
    actorId,
    entityType: "intervention_state",
    entityId: state.id,
    payload: {
      engagementId: input.engagementId,
      previousPhase: null,
      newPhase: initialPhase,
      isInitialization: true,
    },
    visibility: "internal",
  });

  logger.info("Intervention state initialized", {
    interventionStateId: state.id,
    engagementId: input.engagementId,
    initialPhase,
  });

  return {
    id: state.id,
    engagementId: state.engagementId,
    currentPhase: state.currentPhase as InterventionPhase,
  };
}

export async function transitionPhase(
  engagementId: string,
  targetPhase: InterventionPhase,
  actorId: string
): Promise<{ id: string; previousPhase: InterventionPhase | null; currentPhase: InterventionPhase }> {
  // Get current state
  const state = await db.interventionState.findUnique({
    where: { engagementId },
  });

  if (!state) {
    throw new NotFoundError("InterventionState", engagementId);
  }

  const currentPhase = state.currentPhase as InterventionPhase;

  // Validate transition
  validatePhaseTransition(currentPhase, targetPhase);

  // Update state
  const updated = await db.interventionState.update({
    where: { engagementId },
    data: {
      previousPhase: currentPhase,
      currentPhase: targetPhase,
      updatedAt: new Date(),
    },
  });

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_PHASE_CHANGED,
    actorId,
    entityType: "intervention_state",
    entityId: updated.id,
    payload: {
      engagementId,
      previousPhase: currentPhase,
      newPhase: targetPhase,
    },
    visibility: "internal",
  });

  logger.info("Intervention phase transitioned", {
    interventionStateId: updated.id,
    engagementId,
    from: currentPhase,
    to: targetPhase,
  });

  return {
    id: updated.id,
    previousPhase: updated.previousPhase as InterventionPhase | null,
    currentPhase: updated.currentPhase as InterventionPhase,
  };
}

export async function getInterventionState(engagementId: string) {
  const state = await db.interventionState.findUnique({
    where: { engagementId },
  });

  if (!state) {
    throw new NotFoundError("InterventionState", engagementId);
  }

  return {
    id: state.id,
    engagementId: state.engagementId,
    currentPhase: state.currentPhase as InterventionPhase,
    previousPhase: state.previousPhase as InterventionPhase | null,
    version: state.version,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export function getPhaseAllowedTransitions(from: InterventionPhase): readonly InterventionPhase[] {
  return PHASE_TRANSITIONS[from] ?? [];
}
