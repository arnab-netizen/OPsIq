import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { RiskSeverity } from "@/domain/constants/statuses";

export interface CreateActionInput {
  engagementId: string;
  recommendationId?: string;
  title: string;
  description: string;
  priority: number; // 1=critical, 2=high, 3=medium, 4=low
  owner: string;
  dueDate: string; // ISO 8601
  visibilityStatus?: "internal" | "client_visible";
}

export interface UpdateActionInput {
  status?: "open" | "in_progress" | "done" | "blocked";
  title?: string;
  description?: string;
  dueDate?: string;
  version: number;
}

export interface Action {
  id: string;
  engagementId: string;
  recommendationId?: string;
  title: string;
  description: string;
  priority: number;
  status: string;
  owner: string;
  dueDate: Date;
  completedAt?: Date;
  createdAt: Date;
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "blocked"],
  in_progress: ["done", "blocked"],
  done: [],
  blocked: ["open", "in_progress"],
};

export async function createAction(
  input: CreateActionInput,
  actorId: string
): Promise<Action> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate recommendation if provided
  if (input.recommendationId) {
    const rec = await db.recommendation.findUnique({
      where: { id: input.recommendationId },
      select: { id: true, engagementId: true },
    });
    if (!rec) throw new NotFoundError("Recommendation", input.recommendationId);
    if (rec.engagementId !== input.engagementId) {
      throw new ValidationError("Recommendation must belong to the same engagement");
    }
  }

  // Validate priority
  if (input.priority < 1 || input.priority > 4) {
    throw new ValidationError("Priority must be between 1 and 4");
  }

  // Validate due date is in future
  const dueDate = new Date(input.dueDate);
  if (dueDate <= new Date()) {
    throw new ValidationError("Due date must be in the future");
  }

  const created = await db.action.create({
    data: {
      engagementId: input.engagementId,
      recommendationId: input.recommendationId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      owner: input.owner,
      dueDate,
      status: "open",
      visibilityStatus: input.visibilityStatus || "internal",
      createdBy: actorId,
    },
    select: {
      id: true,
      engagementId: true,
      recommendationId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      owner: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_CREATED,
    actorId,
    entityType: "Action",
    entityId: created.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
      priority: input.priority,
      recommendationId: input.recommendationId,
    },
  });

  return created as Action;
}

export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  actorId: string
): Promise<Action> {
  // Get current action
  const current = await db.action.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      status: true,
      version: true,
      engagementId: true,
      title: true,
      priority: true,
    },
  });
  if (!current) throw new NotFoundError("Action", actionId);

  // Check version
  if (current.version !== input.version) {
    throw new ValidationError(
      `Version mismatch. Expected ${input.version}, got ${current.version}`
    );
  }

  // Validate status transition if provided
  if (input.status && input.status !== current.status) {
    const validTransitions = VALID_STATUS_TRANSITIONS[current.status] || [];
    if (!validTransitions.includes(input.status)) {
      throw new ValidationError(
        `Invalid status transition: ${current.status} → ${input.status}`
      );
    }
  }

  // Validate due date if provided
  if (input.dueDate) {
    const dueDate = new Date(input.dueDate);
    if (dueDate <= new Date()) {
      throw new ValidationError("Due date must be in the future");
    }
  }

  // Update action
  const updated = await db.action.update({
    where: { id: actionId },
    data: {
      ...(input.status && { status: input.status }),
      ...(input.title && { title: input.title }),
      ...(input.description && { description: input.description }),
      ...(input.dueDate && { dueDate: new Date(input.dueDate) }),
      ...(input.status === "done" && { completedAt: new Date() }),
      version: { increment: 1 },
      updatedAt: new Date(),
    },
    select: {
      id: true,
      engagementId: true,
      recommendationId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      owner: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
    },
  });

  // Emit audit event for status change
  if (input.status && input.status !== current.status) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_UPDATED,
      actorId,
      entityType: "Action",
      entityId: actionId,
      payload: {
        engagementId: current.engagementId,
        title: current.title,
        previousStatus: current.status,
        newStatus: input.status,
      },
    });

    // Emit completion event if action completed
    if (input.status === "done") {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.ACTION_COMPLETED,
        actorId,
        entityType: "Action",
        entityId: actionId,
        payload: {
          engagementId: current.engagementId,
          title: current.title,
          completedAt: new Date().toISOString(),
        },
      });
    }
  }

  return updated as Action;
}

export async function listActionsForEngagement(
  engagementId: string,
  visibility?: "internal" | "all"
): Promise<Omit<Action, 'visibilityStatus'>[]> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const actions = await db.action.findMany({
    where: { engagementId },
    select: {
      id: true,
      engagementId: true,
      recommendationId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      owner: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      visibilityStatus: true,
    },
    orderBy: { priority: "asc" },
  });

  // Filter by visibility if not requesting all
  if (visibility === "internal") {
    return actions
      .filter((a) => a.visibilityStatus === "internal")
      .map(({ visibilityStatus, ...a }) => a as any);
  }

  return actions.map(({ visibilityStatus, ...a }) => a as any);
}

export async function getActionDetail(
  actionId: string,
  visibility?: "internal" | "all"
): Promise<Omit<Action, 'visibilityStatus'>> {
  const action = await db.action.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      engagementId: true,
      recommendationId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      owner: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      visibilityStatus: true,
    },
  });

  if (!action) throw new NotFoundError("Action", actionId);

  // Check visibility
  if (visibility === "internal" && action.visibilityStatus === "client_visible") {
    throw new NotFoundError("Action", actionId);
  }

  const { visibilityStatus, ...rest } = action;
  return rest as any;
}

export async function getActionsForRecommendation(
  recommendationId: string
): Promise<Action[]> {
  return (await db.action.findMany({
    where: { recommendationId },
    select: {
      id: true,
      engagementId: true,
      recommendationId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      owner: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
    },
  })) as Action[];
}

export async function getOpenActionsForEngagement(
  engagementId: string
): Promise<Action[]> {
  return (await db.action.findMany({
    where: { engagementId, status: { in: ["open", "in_progress"] } },
    select: {
      id: true,
      engagementId: true,
      recommendationId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      owner: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
    },
  })) as Action[];
}
