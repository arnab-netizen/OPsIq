import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError, ConflictError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { ACTION_STATUSES, type ActionStatus } from "@/domain/constants/statuses";
import { assertEngagementAccess } from "@/lib/visibility";

export interface CreateActionInput {
  engagementId: string;
  recommendationId?: string;
  title: string;
  description?: string;
  owner?: string;
  dueDate?: string;
  priority?: string;
}

export interface UpdateActionInput {
  status?: ActionStatus;
  blockageReason?: string;
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
  actorId: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const action = await db.action.create({
    data: {
      engagementId: input.engagementId,
      recommendationId: input.recommendationId ?? null,
      title: input.title,
      description: input.description ?? null,
      owner: input.owner ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      priority: input.priority ?? "medium",
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

  // Trigger re-evaluation due to new action
  await triggerReEvaluation({
    changeType: "action",
    entityType: "action",
    entityId: action.id,
    engagementId: input.engagementId,
    severity: (input.priority === "critical" ? "critical" : "medium") as "low" | "medium" | "high" | "critical",
    description: `Action created: ${input.title}`,
    triggeredBy: actorId,
  });

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
      "STALE_VERSION"
    );
  }

  const newStatus = input.status ?? action.status;
  const previousStatus = action.status as ActionStatus;

  // Validate new status value
  if (newStatus) {
    validateActionStatus(newStatus);
    // Only validate transition if status is actually changing
    if (newStatus !== previousStatus) {
      validateActionTransition(previousStatus, newStatus);
    }
  }

  // Optimistic locking: update only if version matches
  const updateResult = await db.action.updateMany({
    where: {
      id: actionId,
      version: input.version,
    },
    data: {
      status: newStatus,
      blockageReason: input.blockageReason ?? action.blockageReason,
      version: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    throw new ConflictError(
      "Action has been modified by another process",
      "OPTIMISTIC_LOCK_FAILED"
    );
  }

  const updated = await db.action.findUnique({
    where: { id: actionId },
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

  // Trigger re-evaluation due to action status change
  if (newStatus !== previousStatus) {
    await triggerReEvaluation({
      changeType: "action_status_change",
      entityType: "action",
      entityId: actionId,
      engagementId: action.engagementId,
      severity: newStatus === "blocked" ? "high" : "medium",
      description: `Action status changed: ${previousStatus} → ${newStatus}`,
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
