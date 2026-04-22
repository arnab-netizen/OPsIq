import { db } from "@/lib/db";
import { emitAuditEvent, type Visibility } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateActionInput {
  engagementId: string;
  title: string;
  description?: string;
  priority: string; // "low" | "medium" | "high" | "critical"
  dueDate?: string;
  owner?: string;
  recommendationId?: string;
  visibility?: Visibility;
}

export async function createAction(
  input: CreateActionInput,
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (input.recommendationId) {
    const recommendation = await db.recommendation.findUnique({
      where: { id: input.recommendationId },
    });
    if (!recommendation) throw new NotFoundError("Recommendation", input.recommendationId);
    if (recommendation.engagementId !== input.engagementId) {
      throw new ValidationError("Recommendation does not belong to this engagement");
    }
  }

  const validPriorities = ["low", "medium", "high", "critical"];
  if (!validPriorities.includes(input.priority)) {
    throw new ValidationError(`Invalid priority: ${input.priority}`);
  }

  const action = await db.action.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      owner: input.owner ?? null,
      recommendationId: input.recommendationId ?? null,
      visibility: input.visibility ?? "internal",
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.ACTION_CREATED,
    actorId,
    entityType: "action",
    entityId: action.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
      priority: input.priority,
    },
    visibility: input.visibility ?? "internal",
  });

  logger.info("Action created", {
    actionId: action.id,
    engagementId: input.engagementId,
    priority: input.priority,
  });

  return { id: action.id };
}

export async function getActionsByEngagement(
  engagementId: string,
  filters?: { status?: string; priority?: string }
) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.action.findMany({
    where: {
      engagementId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.priority && { priority: filters.priority }),
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
  });
}

export async function getActionStatusSummary(engagementId: string) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const statuses = await db.action.groupBy({
    by: ["status"],
    where: { engagementId },
    _count: {
      status: true,
    },
  });

  const summary: Record<string, number> = {
    open: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
    cancelled: 0,
  };

  for (const s of statuses) {
    if (s.status in summary) {
      summary[s.status as keyof typeof summary] = s._count.status;
    }
  }

  return summary;
}
