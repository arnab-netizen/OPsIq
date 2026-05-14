import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
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
  triage: ["stabilization"],
  stabilization: ["recovery", "triage"],
  recovery: ["growth", "stabilization"],
  growth: [],
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

/**
 * Get current intervention state for an engagement.
 * Note: interventionMode is stored on Engagement model.
 */
export async function getInterventionState(
  engagementId: string,
  workspaceId?: string
): Promise<InterventionState> {
  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace-scoped queries");
  }

  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: {
      id: true,
      interventionMode: true,
      version: true,
    },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return {
    engagementId: engagement.id,
    interventionMode: engagement.interventionMode,
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
  authContext: CanonicalAuthContext,
  workspaceId?: string
): Promise<void> {
  const actorId = authContext.verifiedActorId;

  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace-scoped queries");
  }

  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: {
      id: true,
      status: true,
      workspaceId: true,
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
    workspaceId: engagement.workspaceId,
    payload: {
      previousPhase,
      newPhase: input.interventionPhase,
      mode: engagement.interventionMode,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation when phase changes
  await triggerReEvaluation({
    changeType: "intervention_override",
    entityType: "engagement",
    entityId: engagementId,
    engagementId,
    workspaceId: engagement.workspaceId,
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
  authContext: CanonicalAuthContext,
  workspaceId?: string
): Promise<void> {
  const actorId = authContext.verifiedActorId;

  if (!workspaceId) {
    throw new Error("workspaceId is required for workspace-scoped queries");
  }

  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: {
      id: true,
      status: true,
      workspaceId: true,
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
      where: withVersionCheck({ id: engagementId, workspaceId }, input.version),
      data: withVersionIncrement({ interventionMode: input.interventionMode }),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_MODE_CHANGED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    workspaceId: engagement.workspaceId,
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
    workspaceId: engagement.workspaceId,
    severity: "high",
    description: `Intervention mode changed from ${previousMode} to ${input.interventionMode}`,
    triggeredBy: actorId,
  });

  logger.info("Intervention mode updated", {
    engagementId,
    previousMode,
    newMode: input.interventionMode,
  });
}

export async function initializeInterventionState(
  engagementId: string,
  interventionMode: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const actorId = authContext.verifiedActorId;
  enforceWorkspaceId(workspaceId, "initializeInterventionState", "engagement");

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  if (engagement.interventionMode) {
    throw new ValidationError("Intervention state already initialized for this engagement");
  }

  const updated = await db.engagement.update({
    where: { id: engagementId, workspaceId },
    data: {
      interventionMode: interventionMode as InterventionMode,
      interventionPhase: "triage" as InterventionPhase,
      version: { increment: 1 },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_STATE_INITIALIZED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    payload: {
      interventionMode,
      interventionPhase: "triage",
    },
    visibility: "internal",
  });

  return updated;
}

export async function transitionPhase(
  engagementId: string,
  newPhase: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const actorId = authContext.verifiedActorId;

  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: {
      id: true,
      workspaceId: true,
      interventionPhase: true,
    },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const currentPhase = engagement.interventionPhase as InterventionPhase;
  validatePhaseTransition(currentPhase, newPhase as InterventionPhase);

  const updated = await db.engagement.update({
    where: { id: engagementId, workspaceId },
    data: {
      interventionPhase: newPhase as InterventionPhase,
      version: { increment: 1 },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.INTERVENTION_PHASE_CHANGED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    workspaceId: engagement.workspaceId,
    payload: {
      fromPhase: currentPhase,
      toPhase: newPhase,
    },
    visibility: "internal",
  });

  return updated;
}

export function getPhaseAllowedTransitions(phase: InterventionPhase): InterventionPhase[] {
  return (PHASE_TRANSITIONS[phase] || []) as InterventionPhase[];
}

/**
 * Block an engagement with a reason and severity tracking via audit event.
 */
export async function blockEngagement(
  engagementId: string,
  blockerReason: string,
  version: number,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  const actorId = authContext.verifiedActorId;
  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: { id: true, version: true, workspaceId: true, isBlocked: true },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  if (engagement.version !== version) {
    throw new ValidationError("Version mismatch");
  }

  if (engagement.isBlocked) {
    throw new ValidationError("Engagement is already blocked");
  }

  await db.engagement.update({
    where: { id: engagementId, workspaceId },
    data: withVersionIncrement({
      isBlocked: true,
      blockerReason,
      blockedAt: new Date(),
    }),
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ENGAGEMENT_BLOCKED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    workspaceId: engagement.workspaceId,
    payload: {
      blockerReason,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to engagement block
  await triggerReEvaluation({
    changeType: "engagement_blocked",
    entityType: "engagement",
    entityId: engagementId,
    engagementId,
    workspaceId: engagement.workspaceId,
    severity: "critical",
    description: `Engagement blocked: ${blockerReason}`,
    triggeredBy: actorId,
  });

  logger.info("Engagement blocked", {
    engagementId,
    blockerReason,
  });
}

/**
 * Unblock an engagement.
 */
export async function unblockEngagement(
  engagementId: string,
  version: number,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  const actorId = authContext.verifiedActorId;
  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, workspaceId },
    select: { id: true, version: true, workspaceId: true, isBlocked: true },
  });

  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  if (engagement.version !== version) {
    throw new ValidationError("Version mismatch");
  }

  if (!engagement.isBlocked) {
    throw new ValidationError("Engagement is not blocked");
  }

  await db.engagement.update({
    where: { id: engagementId, workspaceId },
    data: withVersionIncrement({
      isBlocked: false,
      blockerReason: null,
      blockedAt: null,
    }),
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ENGAGEMENT_UNBLOCKED,
    actorId,
    entityType: "engagement",
    entityId: engagementId,
    workspaceId: engagement.workspaceId,
    payload: {},
    visibility: "internal",
  });

  logger.info("Engagement unblocked", {
    engagementId,
  });
}
