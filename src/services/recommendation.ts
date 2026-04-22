import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateRecommendationInput {
  engagementId: string;
  findingId?: string;
  priority: string;
  title: string;
  description?: string;
  expectedImpact?: string;
  implementationPhase?: string;
}

export interface UpdateRecommendationInput {
  status?: string;
  priority?: string;
  version: number;
}

export async function createRecommendation(
  input: CreateRecommendationInput,
  actorId: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const recommendation = await db.recommendation.create({
    data: {
      engagementId: input.engagementId,
      findingId: input.findingId ?? null,
      priority: input.priority,
      title: input.title,
      description: input.description ?? null,
      expectedImpact: input.expectedImpact ?? null,
      implementationPhase: input.implementationPhase ?? null,
      recommendedBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: "recommendation_created",
    actorId,
    entityType: "recommendation",
    entityId: recommendation.id,
    payload: {
      engagementId: input.engagementId,
      priority: input.priority,
    },
    visibility: "internal",
  });

  logger.info("Recommendation created", {
    recommendationId: recommendation.id,
    engagementId: input.engagementId,
  });

  return recommendation;
}

export async function getRecommendationsForEngagement(engagementId: string) {
  return db.recommendation.findMany({
    where: { engagementId },
    include: { actions: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateRecommendationStatus(
  recommendationId: string,
  input: UpdateRecommendationInput,
  actorId: string
) {
  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  const updated = await db.recommendation.update({
    where: { id: recommendationId },
    data: {
      status: input.status ?? rec.status,
      version: input.version + 1,
    },
  });

  await emitAuditEvent({
    eventName: "recommendation_updated",
    actorId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: {
      status: input.status,
    },
    visibility: "internal",
  });

  return updated;
}
