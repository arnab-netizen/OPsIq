import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { withVersionIncrement } from "@/lib/optimistic-lock";
import { validateRecommendationTransition } from "@/policies/state-transition";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";
import type {
  RecommendationStatus,
  RecommendationPriority,
  RecommendationType,
} from "@/domain/constants/statuses";
import { RECOMMENDATION_STATUSES } from "@/domain/constants/statuses";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  engagementId: string;
  stageId?: string;
  findingId: string;
  title: string;
  summary: string;
  priority: RecommendationPriority;
  type: RecommendationType;
  rationale: string;
  expectedImpact?: string;
  estimatedEffort?: string;
  targetMetric?: string;
  ownerId?: string;
  dueAt?: string;
}

export interface UpdateRecommendationInput {
  title?: string;
  summary?: string;
  priority?: RecommendationPriority;
  type?: RecommendationType;
  rationale?: string;
  expectedImpact?: string;
  estimatedEffort?: string;
  targetMetric?: string;
  ownerId?: string;
  dueAt?: string;
  status?: RecommendationStatus;
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createRecommendation(
  input: CreateRecommendationInput,
  actorId: string
): Promise<{ id: string }> {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  const finding = await db.finding.findUnique({
    where: { id: input.findingId },
  });
  if (!finding) throw new NotFoundError("Finding", input.findingId);

  if (input.stageId) {
    const stage = await db.stage.findUnique({
      where: { id: input.stageId },
    });
    if (!stage) throw new NotFoundError("Stage", input.stageId);
  }

  const recommendation = await db.recommendation.create({
    data: {
      engagementId: input.engagementId,
      stageId: input.stageId ?? null,
      findingId: input.findingId,
      title: input.title,
      summary: input.summary,
      priority: input.priority,
      type: input.type,
      rationale: input.rationale,
      status: "proposed",
      expectedImpact: input.expectedImpact ?? null,
      estimatedEffort: input.estimatedEffort ?? null,
      targetMetric: input.targetMetric ?? null,
      ownerId: input.ownerId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId,
    entityType: "recommendation",
    entityId: recommendation.id,
    payload: {
      engagementId: input.engagementId,
      findingId: input.findingId,
      title: input.title,
      priority: input.priority,
      type: input.type,
    },
    visibility: "internal",
  });

  logger.info("Recommendation created", {
    recommendationId: recommendation.id,
    findingId: input.findingId,
  });

  return { id: recommendation.id };
}

export async function getRecommendation(id: string) {
  const recommendation = await db.recommendation.findUnique({
    where: { id },
    include: {
      engagement: true,
      stage: true,
      finding: true,
      actions: true,
    },
  });
  if (!recommendation) throw new NotFoundError("Recommendation", id);
  return recommendation;
}

export async function getRecommendationsForFinding(findingId: string) {
  return db.recommendation.findMany({
    where: {
      findingId,
      archivedAt: null,
    },
    include: {
      actions: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getRecommendationsForEngagement(engagementId: string) {
  return db.recommendation.findMany({
    where: {
      engagementId,
      archivedAt: null,
    },
    include: {
      finding: true,
      actions: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
}

export async function updateRecommendation(
  id: string,
  input: UpdateRecommendationInput,
  actorId: string
): Promise<void> {
  const recommendation = await db.recommendation.findUnique({ where: { id } });
  if (!recommendation) throw new NotFoundError("Recommendation", id);

  if (input.version !== recommendation.version) {
    throw new ValidationError("Version mismatch");
  }

  if (input.status && input.status !== recommendation.status) {
    validateRecommendationTransition(
      recommendation.status as RecommendationStatus,
      input.status
    );

    if (input.status === "endorsed" && !recommendation.rationale) {
      throw new ValidationError("Cannot endorse recommendation without rationale");
    }

    if (input.status === "converted") {
      const actionCount = await db.action.count({
        where: { recommendationId: id },
      });
      if (actionCount === 0) {
        throw new ValidationError(
          "Cannot convert recommendation without at least one action"
        );
      }
    }
  }

  const updated = await db.recommendation.update({
    where: { id },
    data: withVersionIncrement({
      title: input.title ?? undefined,
      summary: input.summary ?? undefined,
      priority: input.priority ?? undefined,
      type: input.type ?? undefined,
      rationale: input.rationale ?? undefined,
      expectedImpact: input.expectedImpact ?? undefined,
      estimatedEffort: input.estimatedEffort ?? undefined,
      targetMetric: input.targetMetric ?? undefined,
      ownerId: input.ownerId ?? undefined,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      status: input.status ?? undefined,
      endorsedAt: input.status === "endorsed" ? new Date() : undefined,
      convertedAt: input.status === "converted" ? new Date() : undefined,
      rejectedAt: input.status === "rejected" ? new Date() : undefined,
      withdrawnAt: input.status === "withdrawn" ? new Date() : undefined,
    }),
  });

  if (input.status && input.status !== recommendation.status) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOMMENDATION_STATUS_CHANGED,
      actorId,
      entityType: "recommendation",
      entityId: id,
      payload: {
        fromStatus: recommendation.status,
        toStatus: input.status,
      },
      visibility: "internal",
    });

    await triggerReEvaluation({
      changeType: input.status === "endorsed" ? "new_critical_evidence" : "scope_change",
      entityType: "recommendation",
      entityId: id,
      engagementId: recommendation.engagementId,
      severity: recommendation.priority === "urgent" ? "critical" : "high",
      description: `Recommendation status changed to ${input.status}`,
      triggeredBy: actorId,
    });
  } else {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.RECOMMENDATION_UPDATED,
      actorId,
      entityType: "recommendation",
      entityId: id,
      payload: {
        fields: Object.keys(input).filter(k => k !== "version" && k !== "status"),
      },
      visibility: "internal",
    });
  }

  logger.info("Recommendation updated", {
    recommendationId: id,
    engagementId: recommendation.engagementId,
  });
}

export async function archiveRecommendation(
  id: string,
  actorId: string
): Promise<void> {
  const recommendation = await db.recommendation.findUnique({ where: { id } });
  if (!recommendation) throw new NotFoundError("Recommendation", id);

  await db.recommendation.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      version: { increment: 1 },
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_ARCHIVED,
    actorId,
    entityType: "recommendation",
    entityId: id,
    payload: {
      engagementId: recommendation.engagementId,
    },
    visibility: "internal",
  });

  logger.info("Recommendation archived", {
    recommendationId: id,
    engagementId: recommendation.engagementId,
  });
}
