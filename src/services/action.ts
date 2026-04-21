import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type { ActionStatus } from "@/domain/constants/statuses";
import { ACTION_STATUSES } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateActionInput {
  engagementId: string;
  recommendationId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: "low" | "medium" | "high" | "critical";
  assignedTo?: string;
}

export interface UpdateActionInput {
  title?: string;
  description?: string;
  dueDate?: string;
  priority?: "low" | "medium" | "high" | "critical";
  status?: ActionStatus;
  assignedTo?: string;
  completedAt?: string;
  verifiedAt?: string;
  blockerReason?: string;
  notes?: string;
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createAction(
  input: CreateActionInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate recommendation exists and is approved
  const recommendation = await db.recommendation.findUnique({
    where: { id: input.recommendationId },
    include: { finding: true },
  });
  if (!recommendation) {
    throw new NotFoundError("Recommendation", input.recommendationId);
  }
  if (recommendation.status !== "approved") {
    throw new ValidationError(
      `Cannot create action from recommendation with status: ${recommendation.status}. Must be approved.`
    );
  }

  // Validate priority
  const validPriorities = ["low", "medium", "high", "critical"];
  if (!validPriorities.includes(input.priority)) {
    throw new ValidationError(
      `Invalid priority: ${input.priority}. Must be one of: ${validPriorities.join(", ")}`
    );
  }

  // Validate assignee if provided
  if (input.assignedTo) {
    const assignee = await db.user.findUnique({
      where: { id: input.assignedTo },
    });
    if (!assignee) throw new NotFoundError("User", input.assignedTo);
  }

  const idempotencyKey = `action-create:${input.recommendationId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "action.create",
    async () => {
      const action = await db.action.create({
        data: {
          engagementId: input.engagementId,
          recommendationId: input.recommendationId,
          title: input.title,
          description: input.description ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          priority: input.priority,
          assignedTo: input.assignedTo ?? null,
          status: "draft",
        },
      });
      return { id: action.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_CREATED,
    actorId,
    entityType: "action",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      recommendationId: input.recommendationId,
      title: input.title,
      priority: input.priority,
    },
    visibility: "internal",
  });

  logger.info("Action created", {
    actionId: result.result.id,
    engagementId: input.engagementId,
    recommendationId: input.recommendationId,
  });

  return { id: result.result.id };
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  actorId: string
): Promise<void> {
  const action = await db.action.findUnique({
    where: { id: actionId },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  // Cannot update completed or verified actions
  if (action.status === "completed" || action.status === "verified") {
    throw new ValidationError(
      `Cannot update action with status: ${action.status}`
    );
  }

  // Validate assignee if provided
  if (input.assignedTo) {
    const assignee = await db.user.findUnique({
      where: { id: input.assignedTo },
    });
    if (!assignee) throw new NotFoundError("User", input.assignedTo);
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (k === "dueDate" || k === "completedAt" || k === "verifiedAt") {
      data[k] = v ? new Date(v as string) : null;
    } else {
      data[k] = v;
    }
  }

  const statusChanged = input.status && input.status !== action.status;

  await optimisticUpdate("action", actionId, version, () =>
    db.action.update({
      where: withVersionCheck({ id: actionId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_UPDATED,
    actorId,
    entityType: "action",
    entityId: actionId,
    payload: data,
    visibility: "internal",
  });

  if (statusChanged && input.status === "completed") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_COMPLETED,
      actorId,
      entityType: "action",
      entityId: actionId,
      payload: { previousStatus: action.status },
      visibility: "internal",
    });

    // Trigger re-evaluation when action is completed
    await triggerReEvaluation({
      changeType: "action_completed",
      entityType: "action",
      entityId: actionId,
      engagementId: action.engagementId,
      severity: "medium",
      description: `Action completed: ${action.title}`,
      triggeredBy: actorId,
    });
  }

  logger.info("Action updated", { actionId });
}

export async function getActionById(actionId: string) {
  const action = await db.action.findUnique({
    where: { id: actionId },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
      recommendation: { select: { id: true, title: true } },
      assignee: { select: { id: true, name: true, email: true } },
      completer: { select: { id: true, name: true, email: true } },
      verifier: { select: { id: true, name: true, email: true } },
    },
  });

  if (!action) throw new NotFoundError("Action", actionId);
  return action;
}

export async function listActions(params: {
  engagementId?: string;
  recommendationId?: string;
  status?: string;
  assignedTo?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { engagementId, recommendationId, status, assignedTo, limit = 25, offset = 0 } = params;

  const where = {
    ...(engagementId && { engagementId }),
    ...(recommendationId && { recommendationId }),
    ...(status && { status }),
    ...(assignedTo && { assignedTo }),
  };

  const [actions, total] = await Promise.all([
    db.action.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        engagement: { select: { id: true, code: true } },
        recommendation: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.action.count({ where }),
  ]);

  return { actions, total, limit, offset };
}
