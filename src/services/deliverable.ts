import { db } from "@/lib/db";
import type { ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
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
  auth: ServiceAuthEnvelope
) {
  // Validate capability
  if (!auth.verifiedCapabilities.has(CAPABILITIES.DELIVERABLE_CREATE)) {
    throw new ForbiddenError(`${CAPABILITIES.DELIVERABLE_CREATE} capability required`);
  }

  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: auth.verifiedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const deliverable = await db.deliverable.create({
    data: {
      engagementId: input.engagementId,
      stageId: input.stageId,
      title: input.title,
      description: input.description || null,
      createdBy: auth.verifiedActorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DELIVERABLE_CREATED,
    actorId: auth.verifiedActorId,
    entityType: "deliverable",
    entityId: deliverable.id,
    workspaceId: auth.verifiedWorkspaceId,
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
  auth: ServiceAuthEnvelope
) {
  // Validate capability
  if (!auth.verifiedCapabilities.has(CAPABILITIES.DELIVERABLE_APPROVE)) {
    throw new ForbiddenError(`${CAPABILITIES.DELIVERABLE_APPROVE} capability required`);
  }

  const deliv = await db.deliverable.findFirst({
    where: {
      id: deliverableId,
      engagement: { workspaceId: auth.verifiedWorkspaceId },
    },
    include: { engagement: true },
  });
  if (!deliv) throw new NotFoundError("Deliverable", deliverableId);

  const updated = await db.deliverable.update({
    where: { id: deliverableId },
    data: {
      approvedBy: auth.verifiedActorId,
      approvedAt: new Date(),
      status: "approved",
      version: input.version + 1,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED,
    actorId: auth.verifiedActorId,
    entityType: "deliverable",
    entityId: deliverableId,
    workspaceId: auth.verifiedWorkspaceId,
    payload: {
      status: "approved",
    },
    visibility: "internal",
  });

  return updated;
}
