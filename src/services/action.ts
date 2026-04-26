import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { ACTION_STATUSES, type ActionStatus } from "@/domain/constants/statuses";
import { assertEngagementAccess } from "@/lib/visibility";
import { withIdempotency } from "@/infra/idempotency";

export interface CreateActionInput {
  engagementId: string;
  recommendationId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: string;
}

export interface UpdateActionInput {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  assignedTo?: string;
  completedAt?: string;
  verifiedAt?: string;
  blockageReason?: string;
  blockerReason?: string;
  notes?: string;
  version: number;
}

// State machine: allowed transitions per status
const ACTION_TRANSITIONS: Partial<Record<ActionStatus, readonly ActionStatus[]>> = {
  draft: ["assigned", "cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "completed", "assigned"],
  blocked: ["assigned", "cancelled"],
  completed: [],
  verified: [],
  cancelled: [],
  overdue: ["assigned", "blocked", "cancelled"],
};

function validateActionStatus(status: unknown): asserts status is ActionStatus {
  if (!ACTION_STATUSES.includes(status as ActionStatus)) {
    throw new ValidationError(
      `Invalid action status: ${status}. Must be one of: ${ACTION_STATUSES.join(", ")}`
    );
  }
}

function validateActionTransition(fromStatus: ActionStatus, toStatus: ActionStatus): void {
  const allowed = ACTION_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new ValidationError(
      `Invalid action transition: ${fromStatus} → ${toStatus}. Allowed from ${fromStatus}: ${allowed?.join(", ") || "none"}`
    );
  }
}

export async function createAction(
  input: CreateActionInput,
  actorId: string,
  idempotencyKey?: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "action.create",
      async () => {
        return await db.$transaction(async (tx: any) => {
          const action = await tx.action.create({
            data: {
              engagementId: input.engagementId,
              recommendationId: input.recommendationId,
              title: input.title,
              description: input.description || null,
              assignedTo: input.assignedTo || null,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
              priority: input.priority || "medium",
            },
          });

          await emitAuditEvent({
            eventName: AUDIT_EVENTS.ACTION_CREATED,
            actorId,
            entityType: "action",
            entityId: action.id,
            payload: {
              engagementId: input.engagementId,
              priority: input.priority,
            },
            visibility: "internal",
          });

          return action;
        });
      },
      input,
      actorId
    );

    if (!result.isNew) {
      logger.info("Action creation - idempotency replay", {
        actionId: result.result.id,
        engagementId: input.engagementId,
      });
    } else {
      // Trigger re-evaluation only on first creation if critical (outside transaction)
      if (input.priority === "critical") {
        await triggerReEvaluation({
          changeType: "unresolved_critical_blocker",
          entityType: "action",
          entityId: result.result.id,
          engagementId: input.engagementId,
          severity: "critical",
          description: `Critical action created: ${input.title}`,
          triggeredBy: actorId,
        });
      }

      logger.info("Action created", {
        actionId: result.result.id,
        engagementId: input.engagementId,
      });
    }

    return result.result;
  }

  // Fallback path without idempotency: wrap with transaction
  const action = await db.$transaction(async (tx: any) => {
    const newAction = await tx.action.create({
      data: {
        engagementId: input.engagementId,
        recommendationId: input.recommendationId,
        title: input.title,
        description: input.description || null,
        assignedTo: input.assignedTo || null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        priority: input.priority || "medium",
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_CREATED,
      actorId,
      entityType: "action",
      entityId: newAction.id,
      payload: {
        engagementId: input.engagementId,
        priority: input.priority,
      },
      visibility: "internal",
    });

    return newAction;
  });

  // Trigger re-evaluation due to new action if critical (outside transaction)
  if (input.priority === "critical") {
    await triggerReEvaluation({
      changeType: "unresolved_critical_blocker",
      entityType: "action",
      entityId: action.id,
      engagementId: input.engagementId,
      severity: "critical",
      description: `Critical action created: ${input.title}`,
      triggeredBy: actorId,
    });
  }

  logger.info("Action created", {
    actionId: action.id,
    engagementId: input.engagementId,
  });

  return action;
}

export async function getActionsForEngagement(engagementId: string, userId: string) {
  // Check engagement access
  await assertEngagementAccess(userId, engagementId);

  return db.action.findMany({
    where: { engagementId },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });
}

export async function updateActionStatus(
  actionId: string,
  input: UpdateActionInput,
  actorId: string
) {
  const action = await db.action.findUnique({
    where: { id: actionId },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  // Validate version for optimistic locking
  if (action.version !== input.version) {
    throw new ConflictError(
      "Action has been modified by another process. Current version: " + action.version,
      { code: "STALE_VERSION" }
    );
  }

  const newStatus = (input.status ?? action.status) as ActionStatus;
  const previousStatus = action.status as ActionStatus;

  // Validate new status value
  if (newStatus) {
    validateActionStatus(newStatus);
    // Only validate transition if status is actually changing
    if (newStatus !== previousStatus) {
      validateActionTransition(previousStatus, newStatus);
    }
  }

  // Wrap version check + update + audit event in transaction
  const updated = await db.$transaction(async (tx: any) => {
    // Optimistic locking: update only if version matches
    const blockerReason = input.blockerReason ?? input.blockageReason ?? action.blockerReason;
    const updateResult = await tx.action.updateMany({
      where: {
        id: actionId,
        version: input.version,
      },
      data: {
        status: newStatus,
        blockerReason: blockerReason ?? null,
        version: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictError(
        "Action has been modified by another process",
        { code: "OPTIMISTIC_LOCK_FAILED" }
      );
    }

    const updatedAction = await tx.action.findUnique({
      where: { id: actionId },
    });
    if (!updatedAction) throw new NotFoundError("Action", actionId);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_UPDATED,
      actorId,
      entityType: "action",
      entityId: actionId,
      payload: {
        previousStatus,
        newStatus,
        blockageReason: input.blockageReason,
      },
      visibility: "internal",
    });

    return updatedAction;
  });

  // Trigger re-evaluation due to action status change if blocked (outside transaction)
  if (newStatus !== previousStatus && newStatus === "blocked") {
    await triggerReEvaluation({
      changeType: "unresolved_critical_blocker",
      entityType: "action",
      entityId: actionId,
      engagementId: action.engagementId,
      severity: "high",
      description: `Action blocked: ${input.title || "action"}`,
      triggeredBy: actorId,
    });
  }

  logger.info("Action status updated", {
    actionId,
    previousStatus,
    newStatus,
    updatedBy: actorId,
  });

  return updated;
}

export async function detectOverdueActions(engagementId: string, actorId: string) {
  const now = new Date();

  const overdueActions = await db.action.findMany({
    where: {
      engagementId,
      dueDate: { lt: now },
      status: { notIn: ["completed", "verified", "cancelled"] },
    },
  });

  const results = [];

  for (const action of overdueActions) {
    // Wrap update + audit event in transaction
    await db.$transaction(async (tx: any) => {
      // Emit overdue event
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.ACTION_OVERDUE,
        actorId,
        entityType: "action",
        entityId: action.id,
        payload: {
          engagementId,
          dueDate: action.dueDate,
          currentStatus: action.status,
        },
        visibility: "internal",
      });

      // Increase priority if high/critical
      if (action.priority !== "critical") {
        const newPriority = action.priority === "high" ? "critical" : "high";
        await tx.action.update({
          where: { id: action.id },
          data: {
            priority: newPriority,
            version: { increment: 1 },
          },
        });
      }
    });

    if (action.priority !== "critical") {
      const newPriority = action.priority === "high" ? "critical" : "high";
      results.push({
        actionId: action.id,
        overdue: true,
        priorityIncreased: true,
        newPriority,
      });
    } else {
      results.push({
        actionId: action.id,
        overdue: true,
        priorityIncreased: false,
      });
    }
  }

  if (overdueActions.length > 0) {
    logger.warn("Overdue actions detected", {
      engagementId,
      count: overdueActions.length,
      actions: results,
    });
  }

  return results;
}

export async function getActionById(actionId: string) {
  const action = await db.action.findUnique({
    where: { id: actionId },
  });
  if (!action) throw new NotFoundError("Action", actionId);
  return action;
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  actorId: string
) {
  const action = await db.action.findUnique({
    where: { id: actionId },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  if (action.version !== input.version) {
    throw new ConflictError("Action was modified. Please refresh and try again.");
  }

  // Wrap update + audit event in transaction
  const updated = await db.$transaction(async (tx: any) => {
    const updates: any = { version: { increment: 1 } };

    if (input.status) {
      validateActionTransition(action.status as ActionStatus, input.status as ActionStatus);
      updates.status = input.status;
    }
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.dueDate !== undefined) updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.assignedTo !== undefined) updates.owner = input.assignedTo;
    if (input.completedAt !== undefined) updates.completedAt = input.completedAt ? new Date(input.completedAt) : null;
    if (input.verifiedAt !== undefined) updates.verifiedAt = input.verifiedAt ? new Date(input.verifiedAt) : null;
    if (input.blockerReason !== undefined) updates.blockageReason = input.blockerReason;
    if (input.blockageReason !== undefined) updates.blockageReason = input.blockageReason;
    if (input.notes !== undefined) updates.notes = input.notes;

    const updatedAction = await tx.action.update({
      where: { id: actionId },
      data: updates,
    });

    if (input.status) {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.ACTION_UPDATED,
        actorId,
        entityType: "action",
        entityId: actionId,
        payload: {
          fromStatus: action.status,
          toStatus: input.status,
        },
        visibility: "internal",
      });
    }

    return updatedAction;
  });

  return updated;
}

export async function listActions(params: any) {
  const where: any = {};
  if (params.engagementId) where.engagementId = params.engagementId;
  if (params.status) where.status = params.status;
  if (params.assignedTo) where.owner = params.assignedTo;

  const total = await db.action.count({ where });
  const actions = await db.action.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: params.limit || 50,
    skip: params.offset || 0,
  });

  return {
    items: actions,
    pagination: {
      limit: params.limit || 50,
      offset: params.offset || 0,
      total,
      hasMore: (params.offset || 0) + (params.limit || 50) < total,
    },
  };
}
