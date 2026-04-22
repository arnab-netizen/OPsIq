import { db } from "@/lib/db";
import { emitAuditEvent, type Visibility } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export interface CreateRecommendationInput {
  engagementId: string;
  title: string;
  description?: string;
  rationale?: string;
  priority: string; // "low" | "medium" | "high" | "critical"
  estimatedEffort?: string;
  estimatedImpact?: string;
  linkedFindingId?: string;
  visibility?: Visibility;
}

export async function createRecommendation(
  input: CreateRecommendationInput,
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (input.linkedFindingId) {
    const finding = await db.finding.findUnique({
      where: { id: input.linkedFindingId },
    });
    if (!finding) throw new NotFoundError("Finding", input.linkedFindingId);
    if (finding.engagementId !== input.engagementId) {
      throw new ValidationError("Finding does not belong to this engagement");
    }
  }

  const validPriorities = ["low", "medium", "high", "critical"];
  if (!validPriorities.includes(input.priority)) {
    throw new ValidationError(`Invalid priority: ${input.priority}`);
  }

  const recommendation = await db.recommendation.create({
    data: {
      engagementId: input.engagementId,
      title: input.title,
      description: input.description ?? null,
      rationale: input.rationale ?? null,
      priority: input.priority,
      estimatedEffort: input.estimatedEffort ?? null,
      estimatedImpact: input.estimatedImpact ?? null,
      linkedFindingId: input.linkedFindingId ?? null,
      visibility: input.visibility ?? "internal",
      createdBy: actorId,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId,
    entityType: "recommendation",
    entityId: recommendation.id,
    payload: {
      engagementId: input.engagementId,
      title: input.title,
      priority: input.priority,
    },
    visibility: input.visibility ?? "internal",
  });

  logger.info("Recommendation created", {
    recommendationId: recommendation.id,
    engagementId: input.engagementId,
    priority: input.priority,
  });

  return { id: recommendation.id };
}

export async function getRecommendationsByEngagement(
  engagementId: string,
  filters?: { status?: string; priority?: string }
) {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  return db.recommendation.findMany({
    where: {
      engagementId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.priority && { priority: filters.priority }),
    },
    include: {
      linkedFinding: {
        select: { id: true, title: true, severity: true },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}
