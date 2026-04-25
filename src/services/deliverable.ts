import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateDeliverableInput {
  engagementId: string;
  stageId: string;
  title: string;
  description?: string;
}

export interface UpdateDeliverableInput {
  reviewStatus?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  version: number;
}

export async function createDeliverable(
  input: CreateDeliverableInput,
  actorId: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const deliverable = await db.deliverable.create({
    data: {
      engagementId: input.engagementId,
      stageId: input.stageId,
      title: input.title,
      description: input.description || null,
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DELIVERABLE_CREATED,
    actorId,
    entityType: "deliverable",
    entityId: deliverable.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
    },
    visibility: "internal",
  });

  logger.info("Deliverable created", {
    deliverableId: deliverable.id,
    engagementId: input.engagementId,
  });

  return deliverable;
}

export async function getDeliverablesForEngagement(engagementId: string) {
  return db.deliverable.findMany({
    where: { engagementId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDeliverableById(deliverableId: string) {
  return db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      engagement: {
        include: {
          client: true,
          conditionProfiles: { where: { isCurrent: true } },
        },
      },
    },
  });
}

export async function updateDeliverableReviewStatus(
  deliverableId: string,
  input: UpdateDeliverableInput,
  actorId: string
) {
  const deliv = await db.deliverable.findUnique({
    where: { id: deliverableId },
  });
  if (!deliv) throw new NotFoundError("Deliverable", deliverableId);

  const updated = await db.deliverable.update({
    where: { id: deliverableId },
    data: {
      approvedBy: actorId,
      approvedAt: new Date(),
      status: "approved",
      version: input.version + 1,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED,
    actorId,
    entityType: "deliverable",
    entityId: deliverableId,
    payload: {
      status: "approved",
    },
    visibility: "internal",
  });

  return updated;
}
