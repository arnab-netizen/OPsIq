import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";

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

export interface RecommendationScoringInput {
  impact: number;
  urgency: number;
  confidence: number;
  effort: number;
  riskReduction: number;
  timeToImpact: number;
  cost: number;
  reversibility: number;
  dependency: number;
  strategicAlignment: number;
}

function normalizeValue(value: number, min: number, max: number): number {
  if (value < min) return 0;
  if (value > max) return 1;
  return (value - min) / (max - min);
}

export function calculateRecommendationScore(input: RecommendationScoringInput): number {
  const normalized = {
    impact: normalizeValue(input.impact, 1, 5),
    urgency: normalizeValue(input.urgency, 1, 5),
    confidence: normalizeValue(input.confidence, 0, 100),
    riskReduction: normalizeValue(input.riskReduction, 0, 100),
    strategicAlignment: normalizeValue(input.strategicAlignment, 1, 5),
    effort: normalizeValue(input.effort, 1, 5),
    cost: normalizeValue(input.cost, 1, 5),
    timeToImpact: normalizeValue(input.timeToImpact, 1, 365),
    reversibility: normalizeValue(input.reversibility, 0, 100),
    dependency: normalizeValue(input.dependency, 0, 10),
  };

  const score =
    normalized.impact * 0.2 +
    normalized.urgency * 0.15 +
    normalized.confidence * 0.1 +
    normalized.riskReduction * 0.15 +
    normalized.strategicAlignment * 0.15 +
    (1 - normalized.effort) * 0.1 +
    (1 - normalized.cost) * 0.05 +
    (1 - normalized.timeToImpact) * 0.05 +
    normalized.reversibility * 0.03 +
    (1 - normalized.dependency) * 0.02;

  return Math.min(Math.max(score, 0), 1);
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
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId,
    entityType: "recommendation",
    entityId: recommendation.id,
    payload: {
      engagementId: input.engagementId,
      priority: input.priority,
    },
    visibility: "internal",
  });

  // Trigger re-evaluation due to new recommendation
  await triggerReEvaluation({
    changeType: "recommendation",
    entityType: "recommendation",
    entityId: recommendation.id,
    engagementId: input.engagementId,
    severity: (input.priority === "critical" || input.priority === "urgent" ? "high" : "medium") as "low" | "medium" | "high" | "critical",
    description: `Recommendation created: ${input.title}`,
    triggeredBy: actorId,
  });

  logger.info("Recommendation created", {
    recommendationId: recommendation.id,
    engagementId: input.engagementId,
  });

  return recommendation;
}

export async function getRecommendationsForEngagement(engagementId: string, userId: string) {
  // Check engagement access
  await assertEngagementAccess(userId, engagementId);

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

  // Validate version for optimistic locking
  if (rec.version !== input.version) {
    throw new ConflictError(
      "Recommendation has been modified by another process. Current version: " + rec.version,
      "STALE_VERSION"
    );
  }

  // Optimistic locking: update only if version matches
  const updateResult = await db.recommendation.updateMany({
    where: {
      id: recommendationId,
      version: input.version,
    },
    data: {
      status: input.status ?? rec.status,
      version: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    throw new ConflictError(
      "Recommendation has been modified by another process",
      "OPTIMISTIC_LOCK_FAILED"
    );
  }

  const updated = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });
  if (!updated) throw new NotFoundError("Recommendation", recommendationId);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_APPROVED,
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
