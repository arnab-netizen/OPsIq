import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { ACTION_STATUSES, type ActionStatus } from "@/domain/constants/statuses";
import { assertEngagementAccess } from "@/lib/visibility";
import { withIdempotency } from "@/infra/idempotency";
import { validateStateTransition, enforceActionRules } from "@/services/action-lifecycle";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

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
  workspaceId: string,
  idempotencyKey?: string
) {
  enforceWorkspaceId(workspaceId, "createAction", "action");

  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId },
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
              workspaceId,
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
      // Trigger re-evaluation only on first creation if critical
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

  const action = await db.action.create({
    data: {
      engagementId: input.engagementId,
      recommendationId: input.recommendationId,
      title: input.title,
      description: input.description || null,
      assignedTo: input.assignedTo || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      priority: input.priority || "medium",
      workspaceId,
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

  // Trigger re-evaluation due to new action if critical
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

export async function getActionsForEngagement(engagementId: string, userId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getActionsForEngagement", "action");

  // Check engagement access
  await assertEngagementAccess(userId, engagementId);

  return db.action.findMany({
    where: { engagementId, workspaceId },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });
}

export async function updateActionStatus(
  actionId: string,
  input: UpdateActionInput,
  actorId: string,
  workspaceId: string
) {
  enforceWorkspaceId(workspaceId, "updateActionStatus", "action");

  const action = await db.action.findUnique({
    where: { id: actionId, workspaceId },
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

  // Enforce action lifecycle rules
  const updatedActionData = {
    ...action,
    status: newStatus,
    blockerReason: input.blockerReason ?? input.blockageReason ?? action.blockerReason,
  };
  const violations = await enforceActionRules(updatedActionData);
  if (violations.length > 0) {
    throw new ValidationError(
      `Action enforcement rules violated:\n${violations.join("\n")}`
    );
  }

  // Optimistic locking: update only if version matches
  const blockerReason = input.blockerReason ?? input.blockageReason ?? action.blockerReason;
  const updateResult = await db.action.updateMany({
    where: {
      id: actionId,
      workspaceId,
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

  const updated = await db.action.findUnique({
    where: { id: actionId, workspaceId },
  });
  if (!updated) throw new NotFoundError("Action", actionId);

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

  // Trigger re-evaluation due to action status change if blocked
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

export async function detectOverdueActions(engagementId: string, actorId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "detectOverdueActions", "action");

  const now = new Date();

  const overdueActions = await db.action.findMany({
    where: {
      engagementId,
      workspaceId,
      dueDate: { lt: now },
      status: { notIn: ["completed", "verified", "cancelled"] },
    },
  });

  const results = [];

  for (const action of overdueActions) {
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
      await db.action.update({
        where: { id: action.id, workspaceId },
        data: {
          priority: newPriority,
          version: { increment: 1 },
        },
      });

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

export async function getActionById(actionId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getActionById", "action");

  const action = await db.action.findUnique({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("Action", actionId);
  return action;
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  actorId: string,
  workspaceId: string
) {
  enforceWorkspaceId(workspaceId, "updateAction", "action");

  const action = await db.action.findUnique({
    where: { id: actionId, workspaceId },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  if (action.version !== input.version) {
    throw new ConflictError("Action was modified. Please refresh and try again.");
  }

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

  const updated = await db.action.update({
    where: { id: actionId, workspaceId },
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

  return updated;
}

export async function listActions(workspaceId: string, params: any) {
  enforceWorkspaceId(workspaceId, "listActions", "action");

  const where: any = { workspaceId };
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

export async function createActionsFromInterventions(
  engagementId: string,
  interventions: any[], // PrioritizedIntervention[] from consulting-engine
  actorId: string,
  workspaceId: string
) {
  enforceWorkspaceId(workspaceId, "createActionsFromInterventions", "action");

  if (!interventions || interventions.length === 0) {
    return [];
  }

  const actions = [];

  // Find or create a placeholder recommendation for consulting engine results
  const existingRec = await db.recommendation.findFirst({
    where: { engagementId, workspaceId, title: { contains: "Consulting Engine" } },
  });

  let recommendationId: string;
  if (existingRec) {
    recommendationId = existingRec.id;
  } else {
    // Create a synthetic recommendation to hold consulting engine actions
    const synthRec = await db.recommendation.create({
      data: {
        engagementId,
        title: "Consulting Engine Recommendations",
        description: "Actions generated from consulting engine analysis",
        priority: "high",
        workspaceId,
      },
    });
    recommendationId = synthRec.id;
  }

  for (const priIntervention of interventions) {
    const intervention = priIntervention.intervention;

    // Map ownerRole to assignedTo: we don't have user IDs, so we'll leave unassigned
    // In Phase 2B, this can be enhanced to map roles to actual users

    // Calculate due date based on estimated days
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + intervention.estimatedTotalDays);

    // Create one action per intervention (not per step, as steps are more granular)
    const input: CreateActionInput = {
      engagementId,
      recommendationId,
      title: intervention.title,
      description: `Objective: ${intervention.objective}\n\nSteps: ${intervention.steps.length}\n\nOwner role: ${intervention.ownerRole}`,
      dueDate: dueDate.toISOString().split("T")[0],
      priority: mapPriorityScore(priIntervention.priorityScore),
    };

    const action = await createAction(input, actorId, workspaceId);
    actions.push(action);
  }

  return actions;
}

function mapPriorityScore(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}
