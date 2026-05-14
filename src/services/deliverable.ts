import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { requireCapabilityForService } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

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
  authContext: any,
  workspaceId: string
) {
  if (!workspaceId) throw new Error("workspaceId is required");
  requireCapabilityForService(authContext, CAPABILITIES.DELIVERABLE_CREATE);

  const actorId = authContext.session?.user?.id;
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId },
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
    workspaceId,
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

export async function getDeliverablesForEngagement(engagementId: string, workspaceId: string) {
  return db.deliverable.findMany({
    where: { engagementId, engagement: { workspaceId } },
    select: {
      id: true,
      engagementId: true,
      stageId: true,
      title: true,
      description: true,
      status: true,
      version: true,
      createdAt: true,
      createdBy: true,
      approvedAt: true,
      approvedBy: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDeliverableById(deliverableId: string, workspaceId: string) {
  if (!workspaceId) throw new Error("workspaceId is required");
  const deliverable = await db.deliverable.findFirst({
    where: {
      id: deliverableId,
      engagement: { workspaceId },
    },
    include: {
      engagement: {
        include: {
          client: true,
          conditionProfiles: { where: { isCurrent: true } },
        },
      },
    },
  });
  return deliverable;
}

export async function updateDeliverableReviewStatus(
  deliverableId: string,
  input: UpdateDeliverableInput,
  authContext: any,
  workspaceId: string
) {
  if (!workspaceId) throw new Error("workspaceId is required");
  requireCapabilityForService(authContext, CAPABILITIES.DELIVERABLE_APPROVE);

  const actorId = authContext.session?.user?.id;
  const deliv = await db.deliverable.findFirst({
    where: {
      id: deliverableId,
      engagement: { workspaceId },
    },
    include: { engagement: true },
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
    workspaceId,
    payload: {
      status: "approved",
    },
    visibility: "internal",
  });

  return updated;
}
