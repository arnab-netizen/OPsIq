import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { ACTION_STATUSES, type ActionStatus } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateActionInput {
  engagementId: string;
  recommendationId: string;
  title: string;
  description?: string;
  status?: ActionStatus;
}

export interface UpdateActionStatusInput {
  status: ActionStatus;
  version: number;
}

// ─── Status Transitions ────────────────────────────────────────────────────

const ALLOWED_STATUS_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  "open": ["in_progress", "completed"],
  "in_progress": ["open", "completed"],
  "completed": [],
};

function validateStatusTransition(currentStatus: ActionStatus, newStatus: ActionStatus): void {
  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  if (!allowedTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from "${currentStatus}" to "${newStatus}"`
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createAction(
  input: CreateActionInput,
  actorId: string
): Promise<{ id: string; engagementId: string; recommendationId: string; status: ActionStatus }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: input.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot create actions when intervention is in closed phase"
    );
  }

  // Validate recommendation exists and belongs to same engagement
  const recommendation = await db.recommendation.findUnique({
    where: { id: input.recommendationId },
  });

  if (!recommendation) {
    throw new NotFoundError("Recommendation", input.recommendationId);
  }

  if (recommendation.engagementId !== input.engagementId) {
    throw new ValidationError(
      "Recommendation does not belong to the specified engagement"
    );
  }

  // Validate status if provided
  const status = input.status || "open";
  if (!ACTION_STATUSES.includes(status)) {
    throw new ValidationError(
      `Invalid status: ${status}. Must be one of: ${ACTION_STATUSES.join(", ")}`
    );
  }

  const action = await db.action.create({
    data: {
      engagementId: input.engagementId,
      recommendationId: input.recommendationId,
      title: input.title,
      description: input.description ?? null,
      status: status,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_CREATED,
    actorId,
    entityType: "action",
    entityId: action.id,
    payload: {
      actionId: action.id,
      engagementId: input.engagementId,
      recommendationId: input.recommendationId,
      status: status,
    },
    visibility: "internal",
  });

  logger.info("Action created", {
    actionId: action.id,
    engagementId: input.engagementId,
    recommendationId: input.recommendationId,
  });

  return {
    id: action.id,
    engagementId: action.engagementId,
    recommendationId: action.recommendationId,
    status: action.status as ActionStatus,
  };
}

export async function listActions(
  engagementId: string,
  params: {
    limit?: number;
    offset?: number;
    status?: string;
    recommendationId?: string;
  } = {}
) {
  const { limit = 25, offset = 0, status, recommendationId } = params;

  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const where = {
    engagementId,
    ...(status && { status }),
    ...(recommendationId && { recommendationId }),
  };

  const [actions, total] = await Promise.all([
    db.action.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        recommendationId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.action.count({ where }),
  ]);

  return { actions, total, limit, offset };
}

export async function getActionById(actionId: string, engagementId?: string) {
  const action = await db.action.findUnique({
    where: { id: actionId },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  // Validate ownership if engagementId provided
  if (engagementId && action.engagementId !== engagementId) {
    throw new ValidationError(
      "Action does not belong to the specified engagement"
    );
  }

  return {
    id: action.id,
    engagementId: action.engagementId,
    recommendationId: action.recommendationId,
    title: action.title,
    description: action.description,
    status: action.status as ActionStatus,
    version: action.version,
    createdBy: action.createdBy,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
  };
}

export async function updateActionStatus(
  actionId: string,
  input: UpdateActionStatusInput,
  actorId: string,
  engagementId?: string
) {
  // Validate status
  if (!ACTION_STATUSES.includes(input.status)) {
    throw new ValidationError(
      `Invalid status: ${input.status}. Must be one of: ${ACTION_STATUSES.join(", ")}`
    );
  }

  const action = await db.action.findUnique({
    where: { id: actionId },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  // Validate ownership if engagementId provided
  if (engagementId && action.engagementId !== engagementId) {
    throw new ValidationError(
      "Action does not belong to the specified engagement"
    );
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: action.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot update actions when intervention is in closed phase"
    );
  }

  // Verify version matches for concurrency control
  if (action.version !== input.version) {
    throw new ValidationError(
      "Action version mismatch. Please refresh and try again"
    );
  }

  // Validate status transition
  validateStatusTransition(action.status as ActionStatus, input.status);

  const updatedAction = await db.action.update({
    where: { id: actionId },
    data: {
      status: input.status,
      version: { increment: 1 },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_STATUS_UPDATED,
    actorId,
    entityType: "action",
    entityId: action.id,
    payload: {
      actionId: action.id,
      engagementId: action.engagementId,
      recommendationId: action.recommendationId,
      previousStatus: action.status,
      newStatus: input.status,
    },
    visibility: "internal",
  });

  logger.info("Action status updated", {
    actionId: action.id,
    previousStatus: action.status,
    newStatus: input.status,
  });
}

export async function assignOwner(
  actionId: string,
  ownerId: string,
  actorId: string,
  engagementId?: string
) {
  const action = await db.action.findUnique({
    where: { id: actionId },
  });

  if (!action) {
    throw new NotFoundError("Action", actionId);
  }

  if (engagementId && action.engagementId !== engagementId) {
    throw new ValidationError(
      "Action does not belong to the specified engagement"
    );
  }

  // Verify user exists
  const user = await db.user.findUnique({
    where: { id: ownerId },
  });

  if (!user) {
    throw new NotFoundError("User", ownerId);
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: action.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot assign actions when intervention is in closed phase"
    );
  }

  const updatedAction = await db.action.update({
    where: { id: actionId },
    data: {
      ownerId,
      assignedAt: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_ASSIGNED,
    actorId,
    entityType: "action",
    entityId: action.id,
    payload: {
      actionId: action.id,
      engagementId: action.engagementId,
      ownerId,
      previousOwnerId: action.ownerId,
    },
    visibility: "internal",
  });

  logger.info("Action owner assigned", {
    actionId: action.id,
    ownerId,
    previousOwnerId: action.ownerId,
  });
}
