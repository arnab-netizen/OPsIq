import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateDeliverableInput {
  engagementId: string;
  type: string;
  title: string;
  summary?: string;
  findings?: string;
  recommendations?: string;
  actions?: string;
  kpis?: string;
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
      type: input.type,
      title: input.title,
      summary: input.summary ?? null,
      findings: input.findings ?? null,
      recommendations: input.recommendations ?? null,
      actions: input.actions ?? null,
      kpis: input.kpis ?? null,
    },
  });

  await emitAuditEvent({
    eventName: "deliverable_created",
    actorId,
    entityType: "deliverable",
    entityId: deliverable.id,
    payload: {
      engagementId: input.engagementId,
      type: input.type,
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
      reviewStatus: input.reviewStatus ?? deliv.reviewStatus,
      reviewedBy: input.reviewedBy ?? actorId,
      reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : new Date(),
      version: input.version + 1,
    },
  });

  await emitAuditEvent({
    eventName: "deliverable_reviewed",
    actorId,
    entityType: "deliverable",
    entityId: deliverableId,
    payload: {
      reviewStatus: input.reviewStatus,
    },
    visibility: "internal",
  });

  return updated;
}
