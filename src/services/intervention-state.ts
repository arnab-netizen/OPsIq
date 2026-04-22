import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import {
  INTERVENTION_PHASES,
  INTERVENTION_MODES,
  type InterventionPhase,
  type InterventionMode,
} from "@/domain/constants/statuses";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface InterventionState {
  engagementId: string;
  interventionMode: string;
  interventionPhase: string;
  version: number;
}

export interface UpdateInterventionPhaseInput {
  interventionPhase: string;
  version: number;
}

export interface UpdateInterventionModeInput {
  interventionMode: string;
  version: number;
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

function validateInterventionPhase(phase: string): void {
  if (!INTERVENTION_PHASES.includes(phase as InterventionPhase)) {
    throw new ValidationError(
      `Invalid intervention phase: ${phase}. Must be one of: ${INTERVENTION_PHASES.join(", ")}`
    );
  }
}

function validateInterventionMode(mode: string): void {
  if (!INTERVENTION_MODES.includes(mode as InterventionMode)) {
    throw new ValidationError(
      `Invalid intervention mode: ${mode}. Must be one of: ${INTERVENTION_MODES.join(", ")}`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

<<<<<<< HEAD
/**
 * Get current intervention state for an engagement.
 * Note: interventionMode and interventionPhase are stored on Engagement model.
 */
export async function getInterventionState(
  engagementId: string
): Promise<InterventionState> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      interventionMode: true,
      interventionPhase: true,
      version: true,
    },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return {
    engagementId: engagement.id,
    interventionMode: engagement.interventionMode,
    interventionPhase: engagement.interventionPhase,
    version: engagement.version,
  };
}

/**
 * Update intervention phase for an engagement.
 * Separates intervention phase (where we are in the structured approach)
 * from consulting stage (a separate lifecycle entity in future modules).
 */
export async function updateInterventionPhase(
  engagementId: string,
  input: UpdateInterventionPhaseInput,
  actorId: string
): Promise<void> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      status: true,
      interventionPhase: true,
      interventionMode: true,
      version: true,
    },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  if (engagement.status === "archived") {
    throw new ValidationError("Cannot update intervention state for an archived engagement");
  }

  // Validate the new phase value
  validateInterventionPhase(input.interventionPhase);

  // Check if phase is actually changing
  if (input.interventionPhase === engagement.interventionPhase) {
    logger.info("Intervention phase unchanged", { engagementId });
    return;
  }

  const previousPhase = engagement.interventionPhase;

  await optimisticUpdate("engagement", engagementId, input.version, () =>
    db.engagement.update({
      where: withVersionCheck({ id: engagementId }, input.version),
      data: withVersionIncrement({ interventionPhase: input.interventionPhase }),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_PHASE_CHANGED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    payload: {
      previousPhase,
      newPhase: input.interventionPhase,
      mode: engagement.interventionMode,
=======
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
>>>>>>> origin/claude/module-03-intervention-state-ZRoUk
    },
    visibility: "internal",
  });

<<<<<<< HEAD
  // Trigger re-evaluation when phase changes
  await triggerReEvaluation({
    changeType: "intervention_override",
    entityType: "engagement",
    entityId: engagementId,
    engagementId,
    severity: "medium",
    description: `Intervention phase changed from ${previousPhase} to ${input.interventionPhase}`,
    triggeredBy: actorId,
  });

  logger.info("Intervention phase updated", {
    engagementId,
    previousPhase,
    newPhase: input.interventionPhase,
  });
}

/**
 * Update intervention mode for an engagement.
 * Note: Mode changes also trigger re-evaluation and should be coordinated
 * with business condition and other factors.
 */
export async function updateInterventionMode(
  engagementId: string,
  input: UpdateInterventionModeInput,
  actorId: string
): Promise<void> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: {
      id: true,
      status: true,
      interventionMode: true,
      interventionPhase: true,
      version: true,
    },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  if (engagement.status === "archived") {
    throw new ValidationError("Cannot update intervention state for an archived engagement");
  }

  // Validate the new mode value
  validateInterventionMode(input.interventionMode);

  // Check if mode is actually changing
  if (input.interventionMode === engagement.interventionMode) {
    logger.info("Intervention mode unchanged", { engagementId });
    return;
  }

  const previousMode = engagement.interventionMode;

  await optimisticUpdate("engagement", engagementId, input.version, () =>
    db.engagement.update({
      where: withVersionCheck({ id: engagementId }, input.version),
      data: withVersionIncrement({ interventionMode: input.interventionMode }),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_MODE_CHANGED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    payload: {
      previousMode,
      newMode: input.interventionMode,
      phase: engagement.interventionPhase,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation when mode changes
  await triggerReEvaluation({
    changeType: "intervention_override",
    entityType: "engagement",
    entityId: engagementId,
    engagementId,
    severity: "high",
    description: `Intervention mode changed from ${previousMode} to ${input.interventionMode}`,
    triggeredBy: actorId,
  });

  logger.info("Intervention mode updated", {
    engagementId,
    previousMode,
    newMode: input.interventionMode,
  });
=======
  await triggerReEvaluation({
    changeType: "intervention_override",
    entityType: "intervention_state",
    entityId: updated.id,
    engagementId,
    severity: "medium",
    description: `Phase transitioned from ${currentPhase} to ${targetPhase}`,
    triggeredBy: actorId,
    correlationId: updated.id,
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
>>>>>>> origin/claude/module-03-intervention-state-ZRoUk
}
