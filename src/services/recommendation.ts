import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { RECOMMENDATION_STATUSES, type RecommendationStatus, RECOMMENDATION_PRIORITIES, type RecommendationPriority, RISK_SEVERITIES } from "@/domain/constants/statuses";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  engagementId: string;
  findingId?: string;
  shockEventId?: string;
  priority?: RecommendationPriority;
  title: string;
  description?: string;
  status?: RecommendationStatus;
}

// ─── Priority Mapping ──────────────────────────────────────────────────────

function mapSeverityToPriority(severity: string): RecommendationPriority {
  switch (severity) {
    case "critical":
      return "high";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "medium";
  }
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
  let shockEventSeverity: string | null = null;
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

    shockEventSeverity = shockEvent.severity;
  }

  // Require at least one source (finding or shock event)
  if (!input.findingId && !input.shockEventId) {
    throw new ValidationError(
      "Recommendation must be linked to either a finding or shock event"
    );
  }

  // Check for duplicate recommendations with same source
  if (input.findingId) {
    const existingForFinding = await db.recommendation.findFirst({
      where: {
        engagementId: input.engagementId,
        findingId: input.findingId,
      },
    });
    if (existingForFinding) {
      throw new ValidationError(
        "Recommendation already exists for this finding"
      );
    }
  }

  if (input.shockEventId) {
    const existingForShock = await db.recommendation.findFirst({
      where: {
        engagementId: input.engagementId,
        shockEventId: input.shockEventId,
      },
    });
    if (existingForShock) {
      throw new ValidationError(
        "Recommendation already exists for this shock event"
      );
    }
  }

  // Determine priority based on source severity if not provided
  let priority = input.priority;
  if (!priority) {
    // Get finding severity if available
    if (input.findingId) {
      const finding = await db.finding.findUnique({
        where: { id: input.findingId },
        select: { severity: true },
      });
      if (finding) {
        priority = mapSeverityToPriority(finding.severity);
      }
    } else if (shockEventSeverity) {
      priority = mapSeverityToPriority(shockEventSeverity);
    }
  }

  // Validate priority if provided
  if (priority && !RECOMMENDATION_PRIORITIES.includes(priority)) {
    throw new ValidationError(
      `Invalid priority: ${priority}. Must be one of: ${RECOMMENDATION_PRIORITIES.join(", ")}`
    );
  }

  // Default priority if still not set
  priority = priority || "medium";

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
      priority: priority!,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "draft",
      createdBy: actorId,
    },
  });

  // Determine source type for audit
  const sourceType = input.findingId ? "finding" : "shock";

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
      priority: priority,
      sourceType: sourceType,
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
