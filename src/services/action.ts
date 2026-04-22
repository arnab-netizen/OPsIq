import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

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
  status?: string;
  blockageReason?: string;
  version: number;
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

  logger.info("Action created", {
    actionId: action.id,
    engagementId: input.engagementId,
  });

  return action;
}

export async function getActionsForEngagement(engagementId: string) {
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

  const updated = await db.action.update({
    where: { id: actionId },
    data: {
      status: input.status ?? action.status,
      blockageReason: input.blockageReason ?? action.blockageReason,
      version: input.version + 1,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_UPDATED,
    actorId,
    entityType: "action",
    entityId: actionId,
    payload: {
      status: input.status,
    },
    visibility: "internal",
  });

  return updated;
}
