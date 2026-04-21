import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { withIdempotency } from "@/infra/idempotency";
import { NotFoundError, ValidationError } from "@/infra/errors";
import {
  optimisticUpdate,
  withVersionCheck,
  withVersionIncrement,
} from "@/lib/optimistic-lock";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { logger } from "@/infra/logger";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CreateRecommendationInput {
  engagementId: string;
  findingId: string;
  title: string;
  description?: string;
  rationale?: string;
  priority: "low" | "medium" | "high" | "critical";
  estimatedImpact?: "low" | "medium" | "high";
}

export interface UpdateRecommendationInput {
  title?: string;
  description?: string;
  rationale?: string;
  priority?: "low" | "medium" | "high" | "critical";
  estimatedImpact?: "low" | "medium" | "high";
  status?: "pending" | "approved" | "rejected" | "superseded";
  version: number;
}

// ─── Service ───────────────────────────────────────────────────────────────

export async function createRecommendation(
  input: CreateRecommendationInput,
  actorId: string
): Promise<{ id: string }> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate finding exists and belongs to engagement
  const finding = await db.finding.findUnique({
    where: { id: input.findingId },
  });
  if (!finding) throw new NotFoundError("Finding", input.findingId);
  if (finding.engagementId !== input.engagementId) {
    throw new ValidationError(
      "Finding does not belong to the specified engagement"
    );
  }

  // Validate priority
  const validPriorities = ["low", "medium", "high", "critical"];
  if (!validPriorities.includes(input.priority)) {
    throw new ValidationError(
      `Invalid priority: ${input.priority}. Must be one of: ${validPriorities.join(", ")}`
    );
  }

  const idempotencyKey = `recommendation-create:${input.findingId}:${input.title}:${actorId}`;

  const result = await withIdempotency(
    idempotencyKey,
    "recommendation.create",
    async () => {
      const recommendation = await db.recommendation.create({
        data: {
          engagementId: input.engagementId,
          findingId: input.findingId,
          title: input.title,
          description: input.description ?? null,
          rationale: input.rationale ?? null,
          priority: input.priority,
          estimatedImpact: input.estimatedImpact ?? null,
          status: "pending",
        },
      });
      return { id: recommendation.id };
    }
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId,
    entityType: "recommendation",
    entityId: result.result.id,
    payload: {
      engagementId: input.engagementId,
      findingId: input.findingId,
      priority: input.priority,
      title: input.title,
    },
    visibility: "internal",
  });

  logger.info("Recommendation created", {
    recommendationId: result.result.id,
    engagementId: input.engagementId,
    findingId: input.findingId,
  });

  return { id: result.result.id };
}

export async function approveRecommendation(
  recommendationId: string,
  actorId: string
): Promise<void> {
  const recommendation = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });
  if (!recommendation) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  if (recommendation.status !== "pending") {
    throw new ValidationError(
      `Cannot approve recommendation with status: ${recommendation.status}`
    );
  }

  const data = {
    status: "approved",
    approvedBy: actorId,
    approvedAt: new Date(),
  };

  await optimisticUpdate("recommendation", recommendationId, recommendation.version, () =>
    db.recommendation.update({
      where: withVersionCheck({ id: recommendationId }, recommendation.version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_APPROVED,
    actorId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: { previousStatus: recommendation.status },
    visibility: "internal",
  });

  // Trigger re-evaluation when recommendation is approved
  await triggerReEvaluation({
    changeType: "recommendation_approved",
    entityType: "recommendation",
    entityId: recommendationId,
    engagementId: recommendation.engagementId,
    severity: "medium",
    description: `Recommendation approved: ${recommendation.title}`,
    triggeredBy: actorId,
  });

  logger.info("Recommendation approved", { recommendationId });
}

export async function updateRecommendation(
  recommendationId: string,
  input: UpdateRecommendationInput,
  actorId: string
): Promise<void> {
  const recommendation = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });
  if (!recommendation) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  // Cannot update approved or rejected recommendations
  if (recommendation.status === "approved" || recommendation.status === "rejected") {
    throw new ValidationError(
      `Cannot update recommendation with status: ${recommendation.status}`
    );
  }

  // Validate priority if changing
  if (input.priority) {
    const validPriorities = ["low", "medium", "high", "critical"];
    if (!validPriorities.includes(input.priority)) {
      throw new ValidationError(
        `Invalid priority: ${input.priority}. Must be one of: ${validPriorities.join(", ")}`
      );
    }
  }

  const { version, ...fields } = input;
  const data: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    data[k] = v;
  }

  await optimisticUpdate("recommendation", recommendationId, version, () =>
    db.recommendation.update({
      where: withVersionCheck({ id: recommendationId }, version),
      data: withVersionIncrement(data),
    })
  );

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: data,
    visibility: "internal",
  });

  logger.info("Recommendation updated", { recommendationId });
}

export async function getRecommendationById(recommendationId: string) {
  const recommendation = await db.recommendation.findUnique({
    where: { id: recommendationId },
    include: {
      engagement: { select: { id: true, code: true, title: true } },
      finding: { select: { id: true, title: true, severity: true } },
      approver: { select: { id: true, name: true, email: true } },
      actions: { select: { id: true, title: true, status: true } },
    },
  });

  if (!recommendation) throw new NotFoundError("Recommendation", recommendationId);
  return recommendation;
}

export async function listRecommendations(params: {
  engagementId?: string;
  findingId?: string;
  status?: string;
  priority?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { engagementId, findingId, status, priority, limit = 25, offset = 0 } = params;

  const where = {
    ...(engagementId && { engagementId }),
    ...(findingId && { findingId }),
    ...(status && { status }),
    ...(priority && { priority }),
  };

  const [recommendations, total] = await Promise.all([
    db.recommendation.findMany({
      where,
      select: {
        id: true,
        title: true,
        priority: true,
        status: true,
        estimatedImpact: true,
        createdAt: true,
        engagement: { select: { id: true, code: true } },
        finding: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.recommendation.count({ where }),
  ]);

  return { recommendations, total, limit, offset };
}
