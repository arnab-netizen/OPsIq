import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { RECOMMENDATION_STATUSES, type RecommendationStatus, RECOMMENDATION_PRIORITIES, type RecommendationPriority } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  engagementId: string;
  findingId?: string;
  shockEventId?: string;
  priority: RecommendationPriority;
  title: string;
  description?: string;
  status?: RecommendationStatus;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createRecommendation(
  input: CreateRecommendationInput,
  actorId: string
): Promise<{ id: string; engagementId: string; priority: RecommendationPriority }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  // Check intervention phase (reject if closed)
  const interventionState = await db.interventionState.findUnique({
    where: { engagementId: input.engagementId },
  });

  if (interventionState && interventionState.currentPhase === "closed") {
    throw new ValidationError(
      "Cannot create recommendations when intervention is in closed phase"
    );
  }

  // Validate finding if provided and belongs to same engagement
  if (input.findingId) {
    const finding = await db.finding.findUnique({
      where: { id: input.findingId },
    });

    if (!finding) {
      throw new NotFoundError("Finding", input.findingId);
    }

    if (finding.engagementId !== input.engagementId) {
      throw new ValidationError(
        "Finding does not belong to the specified engagement"
      );
    }
  }

  // Validate shock event if provided and belongs to same engagement
  if (input.shockEventId) {
    const shockEvent = await db.shockEvent.findUnique({
      where: { id: input.shockEventId },
    });

    if (!shockEvent) {
      throw new NotFoundError("ShockEvent", input.shockEventId);
    }

    if (shockEvent.engagementId !== input.engagementId) {
      throw new ValidationError(
        "Shock event does not belong to the specified engagement"
      );
    }
  }

  // Validate priority
  if (!RECOMMENDATION_PRIORITIES.includes(input.priority)) {
    throw new ValidationError(
      `Invalid priority: ${input.priority}. Must be one of: ${RECOMMENDATION_PRIORITIES.join(", ")}`
    );
  }

  // Validate status if provided
  if (input.status && !RECOMMENDATION_STATUSES.includes(input.status)) {
    throw new ValidationError(
      `Invalid status: ${input.status}. Must be one of: ${RECOMMENDATION_STATUSES.join(", ")}`
    );
  }

  const recommendation = await db.recommendation.create({
    data: {
      engagementId: input.engagementId,
      findingId: input.findingId ?? null,
      shockEventId: input.shockEventId ?? null,
      priority: input.priority,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "draft",
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
      recommendationId: recommendation.id,
      findingId: input.findingId ?? null,
      shockEventId: input.shockEventId ?? null,
      priority: input.priority,
    },
    visibility: "internal",
  });

  logger.info("Recommendation created", {
    recommendationId: recommendation.id,
    engagementId: input.engagementId,
    priority: input.priority,
  });

  return {
    id: recommendation.id,
    engagementId: recommendation.engagementId,
    priority: recommendation.priority as RecommendationPriority,
  };
}

export async function listRecommendations(
  engagementId: string,
  params: {
    limit?: number;
    offset?: number;
    priority?: string;
    status?: string;
  } = {}
) {
  const { limit = 25, offset = 0, priority, status } = params;

  // Verify engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });
  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const where = {
    engagementId,
    ...(priority && { priority }),
    ...(status && { status }),
  };

  const [recommendations, total] = await Promise.all([
    db.recommendation.findMany({
      where,
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.recommendation.count({ where }),
  ]);

  return { recommendations, total, limit, offset };
}

export async function getRecommendationById(recommendationId: string, engagementId?: string) {
  const recommendation = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });

  if (!recommendation) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  // Validate ownership if engagementId provided
  if (engagementId && recommendation.engagementId !== engagementId) {
    throw new ValidationError(
      "Recommendation does not belong to the specified engagement"
    );
  }

  return {
    id: recommendation.id,
    engagementId: recommendation.engagementId,
    findingId: recommendation.findingId,
    shockEventId: recommendation.shockEventId,
    priority: recommendation.priority as RecommendationPriority,
    title: recommendation.title,
    description: recommendation.description,
    status: recommendation.status as RecommendationStatus,
    version: recommendation.version,
    createdBy: recommendation.createdBy,
    createdAt: recommendation.createdAt,
    updatedAt: recommendation.updatedAt,
  };
}
