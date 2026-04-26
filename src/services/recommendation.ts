import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { logger } from "@/infra/logger";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { withIdempotency } from "@/infra/idempotency";

export interface CreateRecommendationInput {
  engagementId: string;
  findingId?: string;
  priority: string;
  title: string;
  description?: string;
  expectedImpact?: string;
  implementationPhase?: string;
  class?: RecommendationClass;
  scoringInput?: RecommendationScoringInput;
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

export type RecommendationClass = "containment" | "stabilization" | "growth";

export interface ScoreBreakdown {
  class?: RecommendationClass;
  weights: ScoringWeights;
  normalizedInputs: {
    impact: number;
    urgency: number;
    confidence: number;
    riskReduction: number;
    strategicAlignment: number;
    effort: number;
    cost: number;
    timeToImpact: number;
    reversibility: number;
    dependency: number;
  };
  contributions: {
    impact: number;
    urgency: number;
    confidence: number;
    riskReduction: number;
    strategicAlignment: number;
    effort: number;
    cost: number;
    timeToImpact: number;
    reversibility: number;
    dependency: number;
  };
  finalScore: number;
}

function normalizeValue(value: number, min: number, max: number): number {
  if (value < min) return 0;
  if (value > max) return 1;
  return (value - min) / (max - min);
}

interface ScoringWeights {
  impact: number;
  urgency: number;
  confidence: number;
  riskReduction: number;
  strategicAlignment: number;
  effort: number;
  cost: number;
  timeToImpact: number;
  reversibility: number;
  dependency: number;
}

function getWeightsByClass(recommendationClass?: RecommendationClass): ScoringWeights {
  const baseWeights: ScoringWeights = {
    impact: 0.2,
    urgency: 0.15,
    confidence: 0.1,
    riskReduction: 0.15,
    strategicAlignment: 0.15,
    effort: 0.1,
    cost: 0.05,
    timeToImpact: 0.05,
    reversibility: 0.03,
    dependency: 0.02,
  };

  if (!recommendationClass) {
    return baseWeights;
  }

  const weights = { ...baseWeights };

  if (recommendationClass === "containment") {
    weights.urgency = 0.22;
    weights.riskReduction = 0.22;
    weights.impact = 0.15;
    weights.strategicAlignment = 0.12;
    weights.confidence = 0.08;
    weights.effort = 0.08;
    weights.cost = 0.04;
    weights.timeToImpact = 0.04;
    weights.reversibility = 0.03;
    weights.dependency = 0.02;
  } else if (recommendationClass === "stabilization") {
    weights.effort = 0.18;
    weights.dependency = 0.12;
    weights.impact = 0.15;
    weights.urgency = 0.12;
    weights.confidence = 0.1;
    weights.riskReduction = 0.12;
    weights.strategicAlignment = 0.12;
    weights.cost = 0.03;
    weights.timeToImpact = 0.03;
    weights.reversibility = 0.03;
  } else if (recommendationClass === "growth") {
    weights.impact = 0.28;
    weights.strategicAlignment = 0.22;
    weights.confidence = 0.12;
    weights.riskReduction = 0.12;
    weights.urgency = 0.1;
    weights.reversibility = 0.05;
    weights.effort = 0.05;
    weights.cost = 0.03;
    weights.timeToImpact = 0.02;
    weights.dependency = 0.01;
  }

  return weights;
}

export function calculateRecommendationScoreBreakdown(
  input: RecommendationScoringInput,
  recommendationClass?: RecommendationClass
): ScoreBreakdown {
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

  const weights = getWeightsByClass(recommendationClass);

  const contributions = {
    impact: normalized.impact * weights.impact,
    urgency: normalized.urgency * weights.urgency,
    confidence: normalized.confidence * weights.confidence,
    riskReduction: normalized.riskReduction * weights.riskReduction,
    strategicAlignment: normalized.strategicAlignment * weights.strategicAlignment,
    effort: (1 - normalized.effort) * weights.effort,
    cost: (1 - normalized.cost) * weights.cost,
    timeToImpact: (1 - normalized.timeToImpact) * weights.timeToImpact,
    reversibility: normalized.reversibility * weights.reversibility,
    dependency: (1 - normalized.dependency) * weights.dependency,
  };

  const finalScore = Math.min(Math.max(Object.values(contributions).reduce((a, b) => a + b, 0), 0), 1);

  return {
    class: recommendationClass,
    weights,
    normalizedInputs: normalized,
    contributions,
    finalScore,
  };
}

export function calculateRecommendationScore(
  input: RecommendationScoringInput,
  recommendationClass?: RecommendationClass
): number {
  const breakdown = calculateRecommendationScoreBreakdown(input, recommendationClass);
  return breakdown.finalScore;
}

export function mapScoreToPriority(score: number): string {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export async function createRecommendation(
  input: CreateRecommendationInput,
  actorId: string,
  idempotencyKey?: string
) {
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "recommendation.create",
      async () => {
        return await db.$transaction(async (tx: any) => {
          let derivedPriority = input.priority;
          let scoreValue: number | null = null;
          let scoreBreakdown: ScoreBreakdown | null = null;

          if (input.scoringInput) {
            scoreBreakdown = calculateRecommendationScoreBreakdown(input.scoringInput, input.class);
            scoreValue = scoreBreakdown.finalScore;
            derivedPriority = mapScoreToPriority(scoreValue);
          }

          const recommendation = await tx.recommendation.create({
            data: {
              engagementId: input.engagementId,
              findingId: input.findingId,
              priority: derivedPriority,
              title: input.title,
              description: input.description,
              estimatedImpact: input.expectedImpact,
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

          return recommendation;
        });
      },
      input,
      actorId
    );

    if (!result.isNew) {
      logger.info("Recommendation creation - idempotency replay", {
        recommendationId: result.result.id,
        engagementId: input.engagementId,
      });
    } else {
      logger.info("Recommendation created", {
        recommendationId: result.result.id,
        engagementId: input.engagementId,
      });
    }

    return result.result;
  }

  let derivedPriority = input.priority;
  let scoreValue: number | null = null;
  let scoreBreakdown: ScoreBreakdown | null = null;

  if (input.scoringInput) {
    scoreBreakdown = calculateRecommendationScoreBreakdown(input.scoringInput, input.class);
    scoreValue = scoreBreakdown.finalScore;
    derivedPriority = mapScoreToPriority(scoreValue);
  }

  const recommendation = await db.recommendation.create({
    data: {
      engagementId: input.engagementId,
      findingId: input.findingId,
      priority: derivedPriority,
      title: input.title,
      description: input.description,
      estimatedImpact: input.expectedImpact,
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
      { code: "STALE_VERSION" }
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
      { code: "OPTIMISTIC_LOCK_FAILED" }
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

export async function updateRecommendationPriorityFromScore(
  recommendationId: string,
  scoringInput: RecommendationScoringInput,
  actorId: string,
  recommendationClass?: RecommendationClass
): Promise<{ id: string; score: number; priority: string }> {
  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  const score = calculateRecommendationScore(scoringInput, recommendationClass);
  const newPriority = mapScoreToPriority(score);

  const updated = await db.recommendation.update({
    where: { id: recommendationId },
    data: {
      priority: newPriority,
      version: { increment: 1 },
    },
    select: {
      id: true,
      priority: true,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_APPROVED,
    actorId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: {
      score,
      priority: newPriority,
      source: "re-evaluation",
    },
    visibility: "internal",
  });

  logger.info("Recommendation priority updated from score", {
    recommendationId,
    score,
    priority: newPriority,
  });

  return updated as { id: string; score: number; priority: string };
}

export async function reRankRecommendationsInEngagement(
  engagementId: string,
  actorId: string
): Promise<{ updated: number; recommendations: Array<{ id: string; oldPriority: string; newPriority: string; score: number }> }> {
  const recommendations = await db.recommendation.findMany({
    where: { engagementId },
  });

  const updated: Array<{ id: string; oldPriority: string; newPriority: string; score: number }> = [];
  let updateCount = 0;

  for (const rec of recommendations) {
    // Check if this recommendation has scoring metrics (for test compatibility)
    const scoringMetrics = (rec as any).scoringMetrics;
    if (!scoringMetrics) {
      continue;
    }

    try {
      const metrics = typeof scoringMetrics === 'string' ? JSON.parse(scoringMetrics) : scoringMetrics;
      const newScore = calculateRecommendationScore(metrics as RecommendationScoringInput);
      const newPriority = mapScoreToPriority(newScore);
      const oldPriority = rec.priority;

      if (newPriority !== oldPriority) {
        // Update the recommendation
        await db.recommendation.update({
          where: { id: rec.id },
          data: {
            priority: newPriority,
            version: { increment: 1 },
          },
        });

        // Emit audit event
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.RECOMMENDATION_UPDATED,
          actorId,
          entityType: "recommendation",
          entityId: rec.id,
          payload: {
            oldPriority,
            newPriority,
            score: newScore,
          },
          visibility: "internal",
        });

        updated.push({
          id: rec.id,
          oldPriority,
          newPriority,
          score: newScore,
        });
        updateCount++;
      }
    } catch (error) {
      // Skip recommendations with invalid scoring metrics
      continue;
    }
  }

  return { updated: updateCount, recommendations: updated };
}

export async function getRecommendation(recommendationId: string) {
  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId },
    include: {
      engagement: true,
      finding: true,
    },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);
  return rec;
}

export async function updateRecommendation(
  recommendationId: string,
  input: UpdateRecommendationInput,
  actorId: string
) {
  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  if (rec.version !== input.version) {
    throw new Error("Recommendation was modified. Please refresh and try again.");
  }

  const updates: any = { version: { increment: 1 } };
  if (input.status) updates.status = input.status;
  if (input.priority) updates.priority = input.priority;

  const updated = await db.recommendation.update({
    where: { id: recommendationId },
    data: updates,
  });

  await emitAuditEvent({
    eventName: "recommendation.updated",
    actorId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: updates,
    visibility: "internal",
  });

  return updated;
}

export async function createRecommendationsFromInterventions(
  engagementId: string,
  interventions: any[], // PrioritizedIntervention[] from consulting-engine
  actorId: string
) {
  if (!interventions || interventions.length === 0) {
    return [];
  }

  const recommendations = [];

  for (const priIntervention of interventions) {
    const intervention = priIntervention.intervention;

    const mapClassToRecommendationClass = (interventionClass: string): RecommendationClass => {
      const mapping: Record<string, RecommendationClass> = {
        CONTAINMENT: "containment",
        STABILIZATION: "stabilization",
        STRUCTURAL_REPAIR: "growth",
        GROWTH_ENABLEMENT: "growth",
        RESILIENCE_PROTECTION: "stabilization",
      };
      return mapping[interventionClass] || "stabilization";
    };

    const input: CreateRecommendationInput = {
      engagementId,
      title: intervention.title,
      description: `${intervention.objective}\n\nRationale: ${intervention.rationale}\n\nWhy now: ${intervention.whyThisNow}\n\nFallback plan: ${intervention.fallbackPlan}`,
      expectedImpact: intervention.expectedImpactOnRevenue,
      priority: mapScoreToPriority(priIntervention.priorityScore),
      class: mapClassToRecommendationClass(intervention.class),
    };

    const rec = await createRecommendation(input, actorId);
    recommendations.push(rec);
  }

  return recommendations;
}
