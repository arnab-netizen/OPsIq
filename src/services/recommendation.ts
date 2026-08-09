import { db } from "@/lib/db";
import { enforceOwnerGatesForPromotion } from "@/services/owner-mode/gate-enforcement-policy";
import { arbitrateInterventions } from "@/services/owner-mode/intervention-arbitration.service";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  PlanLimitError,
} from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { withIdempotency } from "@/infra/idempotency";
import { calculateExecutionCertainty } from "@/services/execution-certainty";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import { assertCapability } from "@/services/entitlement.service";
import { recordRecommendationUsage } from "@/services/usage.service";
import { EventEmitterService } from "@/services/event-emitter";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";
import { listEvidence } from "@/services/evidence";
import { getKPIsForEngagement } from "@/services/kpi";


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
  why_now?: string;
  cost_of_inaction?: string;
  expected_metric?: string;
  expected_direction?: string;
  expected_target?: string;
}

export interface UpdateRecommendationInput {
  status?: string;
  priority?: string;
  version: number;
  overrideExecutionCertainty?: {
    reason: string;
    approvedBy: string;
  };
  why_now?: string;
  cost_of_inaction?: string;
  expected_metric?: string;
  expected_direction?: string;
  expected_target?: string;
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

interface EvidenceAssessment {
  evidenceCount: number;
  validatedCount: number;
  rejectedCount: number;
  validationScore: number;
  reliabilityLevel: "low" | "medium" | "high" | "critical";
}

interface KPIAssessment {
  kpiCount: number;
  healthyKPICount: number;
  degradedKPICount: number;
  healthScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

type AuditTrailEvent = {
  eventType: string;
  eventNumber: number;
  occurredAt: Date;
  payload: unknown;
};

function normalizeValue(value: number, min: number, max: number): number {
  if (value < min) return 0;
  if (value > max) return 1;
  return (value - min) / (max - min);
}

function getWeightsByClass(
  recommendationClass?: RecommendationClass
): ScoringWeights {
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
    strategicAlignment:
      normalized.strategicAlignment * weights.strategicAlignment,
    effort: (1 - normalized.effort) * weights.effort,
    cost: (1 - normalized.cost) * weights.cost,
    timeToImpact: (1 - normalized.timeToImpact) * weights.timeToImpact,
    reversibility: normalized.reversibility * weights.reversibility,
    dependency: (1 - normalized.dependency) * weights.dependency,
  };

  const finalScore = Math.min(
    Math.max(Object.values(contributions).reduce((a, b) => a + b, 0), 0),
    1
  );

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
  const breakdown = calculateRecommendationScoreBreakdown(
    input,
    recommendationClass
  );
  return breakdown.finalScore;
}

export function mapScoreToPriority(score: number): string {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

async function evaluateEngagementEvidence(
  engagementId: string,
  workspaceId: string
): Promise<EvidenceAssessment> {
  try {
    const evidence = await listEvidence(workspaceId, { engagementId });

    const validatedCount = evidence.filter(
      (item: Record<string, unknown>) => item.status === "validated"
    ).length;

    const rejectedCount = evidence.filter(
      (item: Record<string, unknown>) => item.status === "rejected"
    ).length;

    const totalCount = evidence.length;
    const validationScore = totalCount > 0 ? validatedCount / totalCount : 0;

    let reliabilityLevel: EvidenceAssessment["reliabilityLevel"];

    if (validationScore >= 0.8) {
      reliabilityLevel = "critical";
    } else if (validationScore >= 0.6) {
      reliabilityLevel = "high";
    } else if (validationScore >= 0.4) {
      reliabilityLevel = "medium";
    } else {
      reliabilityLevel = "low";
    }

    return {
      evidenceCount: totalCount,
      validatedCount,
      rejectedCount,
      validationScore,
      reliabilityLevel,
    };
  } catch {
    return {
      evidenceCount: 0,
      validatedCount: 0,
      rejectedCount: 0,
      validationScore: 0,
      reliabilityLevel: "low",
    };
  }
}

async function evaluateEngagementKPIHealth(
  engagementId: string,
  workspaceId: string
): Promise<KPIAssessment> {
  try {
    const kpis = await getKPIsForEngagement(engagementId, workspaceId);

    const degradedCount =
      kpis?.filter((kpi: Record<string, unknown>) => kpi.status === "degraded")
        .length || 0;

    const totalCount = kpis?.length || 0;
    const healthyCount = totalCount - degradedCount;
    const healthScore = totalCount > 0 ? healthyCount / totalCount : 1;

    let riskLevel: KPIAssessment["riskLevel"];

    if (healthScore >= 0.85) {
      riskLevel = "low";
    } else if (healthScore >= 0.65) {
      riskLevel = "medium";
    } else if (healthScore >= 0.4) {
      riskLevel = "high";
    } else {
      riskLevel = "critical";
    }

    return {
      kpiCount: totalCount,
      healthyKPICount: healthyCount,
      degradedKPICount: degradedCount,
      healthScore,
      riskLevel,
    };
  } catch {
    return {
      kpiCount: 0,
      healthyKPICount: 0,
      degradedKPICount: 0,
      healthScore: 1,
      riskLevel: "low",
    };
  }
}

export async function createRecommendation(
  input: CreateRecommendationInput,
  authContext: CanonicalAuthContext,
  workspaceId: string,
  idempotencyKey?: string
) {
  const capabilityCheck = await assertCapability(
    workspaceId,
    "generate_recommendation"
  );

  if (!capabilityCheck.allowed) {
    throw new PlanLimitError(
      "generate_recommendation",
      capabilityCheck.reason || "Plan limit exceeded"
    );
  }

  const [userId, validatedWorkspaceId] = requireServiceContext(
    authContext,
    workspaceId
  );

  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: validatedWorkspaceId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", input.engagementId);
  }

  const evidenceAssessment = await evaluateEngagementEvidence(
    input.engagementId,
    validatedWorkspaceId
  );

  const kpiAssessment = await evaluateEngagementKPIHealth(
    input.engagementId,
    validatedWorkspaceId
  );

  const buildRecommendationPayload = () => {
    let derivedPriority = input.priority;

    if (input.scoringInput) {
      const scoreBreakdown = calculateRecommendationScoreBreakdown(
        input.scoringInput,
        input.class
      );
      derivedPriority = mapScoreToPriority(scoreBreakdown.finalScore);
    }

    const expectations = {
      why_now: input.why_now,
      cost_of_inaction: input.cost_of_inaction,
      expected_metric: input.expected_metric,
      expected_direction: input.expected_direction,
      expected_target: input.expected_target,
    };

    const hasAnyExpectation = Object.values(expectations).some(v => v !== undefined);
    const constraintsConsidered = hasAnyExpectation ? expectations : undefined;

    return { derivedPriority, constraintsConsidered };
  };

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "recommendation.create",
      async () => {
        return db.$transaction(async (tx: any) => {
          const { derivedPriority, constraintsConsidered } = buildRecommendationPayload();

          const recommendation = await tx.recommendation.create({
            data: {
              engagementId: input.engagementId,
              findingId: input.findingId,
              priority: derivedPriority,
              title: input.title,
              description: input.description,
              estimatedImpact: input.expectedImpact,
              workspaceId: validatedWorkspaceId,
              createdBy: userId,
              evidenceValidationScore: Math.round(
                evidenceAssessment.validationScore * 100
              ),
              reliabilityLevel: evidenceAssessment.reliabilityLevel,
              kpiHealthScore: Math.round(kpiAssessment.healthScore * 100),
              kpiRiskLevel: kpiAssessment.riskLevel,
              ...(constraintsConsidered && { constraintsConsidered }),
            },
          });

          await emitAuditEvent({
            eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
            actorId: userId,
            workspaceId: validatedWorkspaceId,
            entityType: "recommendation",
            entityId: recommendation.id,
            payload: {
              engagementId: input.engagementId,
              priority: input.priority,
              why_now: input.why_now,
              cost_of_inaction: input.cost_of_inaction,
              expected_metric: input.expected_metric,
              expected_direction: input.expected_direction,
              expected_target: input.expected_target,
            },
            visibility: "internal",
          }, tx);

          await EventEmitterService.emit({
            aggregateId: recommendation.id,
            aggregateType: "recommendation",
            eventType: "recommendation.created",
            eventVersion: 1,
            payload: {
              engagementId: input.engagementId,
              priority: derivedPriority,
              title: input.title,
              description: input.description,
              evidenceValidationScore: String(evidenceAssessment.validationScore),
              reliabilityLevel: evidenceAssessment.reliabilityLevel,
              kpiHealthScore: String(kpiAssessment.healthScore),
              kpiRiskLevel: kpiAssessment.riskLevel,
            },
            actorId: userId,
            workspaceId: validatedWorkspaceId,
            idempotencyKey,
            visibilityScope: "internal",
            sensitivityClassification: "standard",
          });

          return recommendation;
        });
      },
      input,
      userId
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

      await recordRecommendationUsage(validatedWorkspaceId, 1, {
        recommendationId: result.result.id,
        engagementId: input.engagementId,
      });
    }

    return result.result;
  }

  const { derivedPriority, constraintsConsidered } = buildRecommendationPayload();

  const recommendation = await db.recommendation.create({
    data: {
      engagementId: input.engagementId,
      findingId: input.findingId,
      priority: derivedPriority,
      title: input.title,
      description: input.description,
      estimatedImpact: input.expectedImpact,
      workspaceId: validatedWorkspaceId,
      createdBy: userId,
      evidenceValidationScore: Math.round(
        evidenceAssessment.validationScore * 100
      ),
      reliabilityLevel: evidenceAssessment.reliabilityLevel,
      kpiHealthScore: Math.round(kpiAssessment.healthScore * 100),
      kpiRiskLevel: kpiAssessment.riskLevel,
      ...(constraintsConsidered && { constraintsConsidered }),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId: userId,
    workspaceId: validatedWorkspaceId,
    entityType: "recommendation",
    entityId: recommendation.id,
    payload: {
      engagementId: input.engagementId,
      priority: input.priority,
      why_now: input.why_now,
      cost_of_inaction: input.cost_of_inaction,
      expected_metric: input.expected_metric,
      expected_direction: input.expected_direction,
      expected_target: input.expected_target,
    },
    visibility: "internal",
  });

  await EventEmitterService.emit({
    aggregateId: recommendation.id,
    aggregateType: "recommendation",
    eventType: "recommendation.created",
    eventVersion: 1,
    payload: {
      engagementId: input.engagementId,
      priority: derivedPriority,
      title: input.title,
      description: input.description,
    },
    actorId: userId,
    workspaceId: validatedWorkspaceId,
    idempotencyKey,
    visibilityScope: "internal",
    sensitivityClassification: "standard",
  });

  await recordRecommendationUsage(validatedWorkspaceId, 1, {
    recommendationId: recommendation.id,
    engagementId: input.engagementId,
  });

  logger.info("Recommendation created", {
    recommendationId: recommendation.id,
    engagementId: input.engagementId,
  });

  return recommendation;
}

export async function verifyRecommendationState(
  recommendationId: string,
  userId: string,
  workspaceId: string
): Promise<{
  verified: boolean;
  live: Record<string, unknown>;
  replayed: Record<string, unknown>;
  parityOk: boolean;
  operationMode: "fully_trusted" | "snapshot_backed" | "uncertain";
}> {
  enforceWorkspaceId(workspaceId, "verifyRecommendationState", "recommendation");

  const liveRec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId },
  });

  if (!liveRec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  logger.warn("Recommendation state replay verification is parked", {
    recommendationId,
    userId,
    workspaceId,
  });

  return {
    verified: false,
    live: {
      id: liveRec.id,
      title: liveRec.title,
      priority: liveRec.priority,
      evidenceValidationScore: liveRec.evidenceValidationScore,
    },
    replayed: {},
    parityOk: false,
    operationMode: "uncertain",
  };
}

/**
 * Semantic priority rank for owner-facing recommendation ordering (highest priority first).
 * Lower rank = higher priority. Mirrors the established repo pattern
 * (`owner-dashboard.service.ts` priorityOrder). `Recommendation.priority` is a free-form String
 * column, so ordering MUST be by this rank — a DB `orderBy: { priority: "desc" }` sorts lexically
 * ("medium" > "low" > "high"), which is not highest-priority-first.
 */
const RECOMMENDATION_PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const RECOMMENDATION_PRIORITY_UNKNOWN_RANK = 999;

export async function getRecommendationsForEngagement(
  engagementId: string,
  userId: string,
  workspaceId: string
) {
  enforceWorkspaceId(
    workspaceId,
    "getRecommendationsForEngagement",
    "recommendation"
  );

  await assertEngagementAccess(userId, engagementId, workspaceId);

  const recommendations = await db.recommendation.findMany({
    where: { engagementId, workspaceId },
    select: {
      id: true,
      engagementId: true,
      findingId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      // `estimatedImpact` is the real Recommendation column. The previous select requested
      // `expectedImpact`, `implementationPhase`, and `executionCertaintyScore` — none of which exist
      // on the Recommendation model — so `prisma.recommendation.findMany` threw
      // PrismaClientValidationError on EVERY call, i.e. the owner recommendations API route
      // (GET /api/engagements/[id]/recommendations) was fully broken. Select only real columns.
      estimatedImpact: true,
      version: true,
      createdAt: true,
      evidenceValidationScore: true,
      reliabilityLevel: true,
      kpiHealthScore: true,
      kpiRiskLevel: true,
      // NOTE: `Recommendation` has no `actions` relation (its relations are `engagement`,
      // `finding`, `operatorItems`; `Action.recommendationId` is an unlinked FK). The previous
      // select nested `actions: {...}`, which — together with the non-existent scalar columns
      // corrected above — made this findMany throw PrismaClientValidationError on every call.
    },
    // createdAt-desc is the deterministic secondary order; the primary
    // highest-priority-first order is applied below by semantic rank.
    orderBy: [{ createdAt: "desc" }],
  });

  // Highest-priority-first: `priority` is a plain String, so ordering it at the DB level sorts
  // LEXICALLY ("medium" > "low" > "high") and buried the owner's highest-priority recommendations
  // at the bottom. Re-order by the semantic priority rank. Array.prototype.sort is stable, so the
  // createdAt-desc order from the query is preserved as the tie-break within an equal-priority group.
  return [...recommendations].sort(
    (a, b) =>
      (RECOMMENDATION_PRIORITY_ORDER[a.priority] ?? RECOMMENDATION_PRIORITY_UNKNOWN_RANK) -
      (RECOMMENDATION_PRIORITY_ORDER[b.priority] ?? RECOMMENDATION_PRIORITY_UNKNOWN_RANK)
  );
}

export async function updateRecommendationStatus(
  recommendationId: string,
  input: UpdateRecommendationInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(
    authContext,
    workspaceId
  );

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
    include: { engagement: true },
  });

  if (!rec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  if (rec.version !== input.version) {
    throw new ConflictError(
      "Recommendation has been modified by another process. Current version: " +
        rec.version,
      { code: "STALE_VERSION" }
    );
  }

  if (input.status === "approved") {
    // Jarvis 360 Slice 0: owner safety gates are now DEFAULT-ON. The central policy
    // runs all four proven promotion gates (business-impact, input-quality,
    // confidence, cash-safety) unless the workspace has an explicit, audited owner
    // opt-out. STRICT (legacy opt-in) keeps hard fail-closed; DEFAULT_ON blocks/
    // downgrades only MATERIAL recs on absent data while low-risk recs proceed with
    // caution. Each gate is fail-closed and throws its typed *GateError on block.
    await enforceOwnerGatesForPromotion(recommendationId, validatedWorkspaceId);

    const stateVerification = await verifyRecommendationState(
      recommendationId,
      userId,
      validatedWorkspaceId
    );

    if (!stateVerification.parityOk) {
      logger.error(
        "UpdateRecommendationStatus: State verification unavailable on approval",
        {
          recommendationId,
          operationMode: stateVerification.operationMode,
        }
      );

      throw new ValidationError(
        "Cannot approve recommendation because state verification is unavailable.",
        {
          recommendationId,
          operationMode: stateVerification.operationMode,
        }
      );
    }

    try {
      const [findings, recommendations, actions] = await Promise.all([
        db.finding.findMany({
          where: {
            engagementId: rec.engagementId,
            engagement: { workspaceId: validatedWorkspaceId },
          },
        }),
        db.recommendation.findMany({
          where: {
            engagementId: rec.engagementId,
            workspaceId: validatedWorkspaceId,
          },
        }),
        db.action.findMany({
          where: {
            engagementId: rec.engagementId,
            engagement: { workspaceId: validatedWorkspaceId },
          },
        }),
      ]);

      const engagement = await db.engagement.findUnique({
        where: { id: rec.engagementId, workspaceId: validatedWorkspaceId },
      });

      if (engagement) {
        const findingsForCertainty = findings.map(
          (finding: (typeof findings)[number]) => ({
            id: finding.id,
            severity:
              (finding.severity as "critical" | "high" | "medium" | "low") ||
              "low",
            resolved:
              finding.status === "resolved" || finding.status === "closed",
            verified: finding.verified ?? false,
          })
        );

        const recommendationsForCertainty = recommendations.map(
          (recommendationItem: (typeof recommendations)[number]) => ({
            id: recommendationItem.id,
            priority:
              (recommendationItem.priority as
                | "critical"
                | "high"
                | "medium"
                | "low") || "medium",
            status:
              (recommendationItem.status as
                | "blocked"
                | "in_progress"
                | "completed") || "in_progress",
          })
        );

        const actionsForCertainty = actions.map(
          (action: (typeof actions)[number]) => ({
            id: action.id,
            priority:
              (action.priority as "critical" | "high" | "medium" | "low") ||
              "medium",
            status:
              (action.status as
                | "blocked"
                | "pending"
                | "in_progress"
                | "completed"
                | "verified") || "pending",
          })
        );

        const certaintyResult = calculateExecutionCertainty(
          rec.engagementId,
          findingsForCertainty,
          recommendationsForCertainty,
          actionsForCertainty,
          [],
          {
            overallStatus:
              (engagement.healthStatus as
                | "critical"
                | "at_risk"
                | "stable"
                | "healthy") || "stable",
            kpiTrend: "flat" as const,
          }
        );

        if (certaintyResult.level === "blocked" || certaintyResult.score < 40) {
          if (input.overrideExecutionCertainty) {
            logger.warn(
              "Execution certainty gate overridden for recommendation approval",
              {
                recommendationId,
                engagementId: rec.engagementId,
                score: certaintyResult.score,
                level: certaintyResult.level,
                overrideReason: input.overrideExecutionCertainty.reason,
                overriddenBy: input.overrideExecutionCertainty.approvedBy,
              }
            );

            await emitAuditEvent({
              eventName: AUDIT_EVENTS.EXECUTION_CERTAINTY_OVERRIDE,
              actorId: userId,
              workspaceId: validatedWorkspaceId,
              entityType: "recommendation",
              entityId: recommendationId,
              payload: {
                engagementId: rec.engagementId,
                score: certaintyResult.score,
                level: certaintyResult.level,
                blockers: certaintyResult.blockers,
                risks: certaintyResult.risks,
                reason: input.overrideExecutionCertainty.reason,
                approvedBy: input.overrideExecutionCertainty.approvedBy,
              },
              visibility: "internal",
            });
          } else {
            logger.warn(
              "Execution certainty gate blocking recommendation approval",
              {
                recommendationId,
                engagementId: rec.engagementId,
                score: certaintyResult.score,
                level: certaintyResult.level,
                blockers: certaintyResult.blockers,
                risks: certaintyResult.risks,
              }
            );

            await emitAuditEvent({
              eventName: AUDIT_EVENTS.EXECUTION_CERTAINTY_WARNING,
              actorId: userId,
              workspaceId: validatedWorkspaceId,
              entityType: "recommendation",
              entityId: recommendationId,
              payload: {
                engagementId: rec.engagementId,
                score: certaintyResult.score,
                level: certaintyResult.level,
                blockers: certaintyResult.blockers,
                risks: certaintyResult.risks,
                reason:
                  "Recommendation cannot be approved because execution certainty is too low",
              },
              visibility: "internal",
            });

            throw new ValidationError(
              "Recommendation cannot be approved because execution certainty is too low",
              {
                score: certaintyResult.score,
                level: certaintyResult.level,
                blockers: certaintyResult.blockers,
                risks: certaintyResult.risks,
              }
            );
          }
        }
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
      logger.error("Error checking execution certainty before approval", {
        recommendationId,
        engagementId: rec.engagementId,
        error: governed.operatorMessage,
      });

      throw new ValidationError(
        "Unable to validate execution certainty before approval. Please try again.",
        {
          originalError: governed.operatorMessage,
        }
      );
    }
  }

  const updateResult = await db.recommendation.updateMany({
    where: {
      id: recommendationId,
      workspaceId: validatedWorkspaceId,
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
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
  });

  if (!updated) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_APPROVED,
    actorId: userId,
    workspaceId: validatedWorkspaceId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: {
      status: input.status,
    },
    visibility: "internal",
  });

  // Emit canonical event to maintain event sourcing trail
  if (input.status) {
    await EventEmitterService.emit({
      aggregateId: recommendationId,
      aggregateType: "recommendation",
      eventType: "recommendation.status_changed",
      eventVersion: 1,
      payload: {
        status: input.status,
        previousStatus: rec.status,
      },
      actorId: userId,
      workspaceId: validatedWorkspaceId,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });
  }

  return updated;
}

export async function updateRecommendationPriorityFromScore(
  recommendationId: string,
  scoringInput: RecommendationScoringInput,
  authContext: CanonicalAuthContext,
  workspaceId: string,
  recommendationClass?: RecommendationClass
): Promise<{ id: string; score: number; priority: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(
    authContext,
    workspaceId
  );

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
  });

  if (!rec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  const score = calculateRecommendationScore(scoringInput, recommendationClass);
  const newPriority = mapScoreToPriority(score);

  const updated = await db.recommendation.update({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
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
    actorId: userId,
    workspaceId: validatedWorkspaceId,
    entityType: "recommendation",
    entityId: recommendationId,
    payload: {
      score,
      priority: newPriority,
      source: "re-evaluation",
    },
    visibility: "internal",
  });

  // Emit canonical event to maintain event sourcing trail
  await EventEmitterService.emit({
    aggregateId: recommendationId,
    aggregateType: "recommendation",
    eventType: "recommendation.priority_updated",
    eventVersion: 1,
    payload: {
      priority: newPriority,
      previousPriority: rec.priority,
      score: String(score),
      source: "re-evaluation",
    },
    actorId: userId,
    workspaceId: validatedWorkspaceId,
    visibilityScope: "internal",
    sensitivityClassification: "standard",
  });

  logger.info("Recommendation priority updated from score", {
    recommendationId,
    score,
    priority: newPriority,
  });

  return {
    id: updated.id,
    priority: updated.priority,
    score,
  };
}

export async function reRankRecommendationsInEngagement(
  engagementId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{
  updated: number;
  recommendations: Array<{
    id: string;
    oldPriority: string;
    newPriority: string;
    score: number;
  }>;
}> {
  const [userId, validatedWorkspaceId] = requireServiceContext(
    authContext,
    workspaceId
  );

  const recommendations = await db.recommendation.findMany({
    where: { engagementId, workspaceId: validatedWorkspaceId },
  });

  const updated: Array<{
    id: string;
    oldPriority: string;
    newPriority: string;
    score: number;
  }> = [];

  let updateCount = 0;

  for (const rec of recommendations) {
    const scoringMetrics = (rec as { scoringMetrics?: unknown }).scoringMetrics;

    if (!scoringMetrics) {
      continue;
    }

    try {
      const metrics =
        typeof scoringMetrics === "string"
          ? JSON.parse(scoringMetrics)
          : scoringMetrics;

      const newScore = calculateRecommendationScore(
        metrics as RecommendationScoringInput
      );

      const newPriority = mapScoreToPriority(newScore);
      const oldPriority = rec.priority;

      if (newPriority !== oldPriority) {
        await db.recommendation.update({
          where: { id: rec.id, workspaceId: validatedWorkspaceId },
          data: {
            priority: newPriority,
            version: { increment: 1 },
          },
        });

        await emitAuditEvent({
          eventName: AUDIT_EVENTS.RECOMMENDATION_UPDATED,
          actorId: userId,
          entityType: "recommendation",
          entityId: rec.id,
          workspaceId: validatedWorkspaceId,
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
    } catch {
      continue;
    }
  }

  return { updated: updateCount, recommendations: updated };
}

export async function getRecommendation(
  recommendationId: string,
  workspaceId: string
) {
  enforceWorkspaceId(workspaceId, "getRecommendation", "recommendation");

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId },
    select: {
      id: true,
      engagementId: true,
      findingId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      // `estimatedImpact` is the real Recommendation column. The previous select requested
      // `expectedImpact`, `implementationPhase`, `executionCertaintyScore`, and `scoreBreakdown` —
      // none of which exist on the Recommendation model — so `prisma.recommendation.findUnique`
      // threw PrismaClientValidationError on EVERY call, i.e. the owner-facing single-recommendation
      // API route (GET /api/recommendations/[id] and the PATCH re-read) 500'd on every request.
      // This is the identical defect fixed for the listing path in Phase 2 G2
      // (`getRecommendationsForEngagement`). Select only real columns.
      estimatedImpact: true,
      version: true,
      createdAt: true,
      constraintsConsidered: true,
      engagement: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      finding: {
        select: {
          id: true,
          title: true,
          severity: true,
        },
      },
    },
  });

  if (!rec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  return rec;
}

export async function updateRecommendation(
  recommendationId: string,
  input: UpdateRecommendationInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(
    authContext,
    workspaceId
  );

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
  });

  if (!rec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  if (rec.version !== input.version) {
    throw new Error("Recommendation was modified. Please refresh and try again.");
  }

  const updates: Record<string, unknown> = { version: { increment: 1 } };

  if (input.status) {
    updates.status = input.status;
  }

  if (input.priority) {
    updates.priority = input.priority;
  }

  const hasExpectationField = [
    input.why_now,
    input.cost_of_inaction,
    input.expected_metric,
    input.expected_direction,
    input.expected_target,
  ].some(v => v !== undefined);

  if (hasExpectationField) {
    const currentConstraints = (rec.constraintsConsidered as Record<string, unknown> | null) || {};
    const mergedConstraints = {
      ...currentConstraints,
      ...(input.why_now !== undefined && { why_now: input.why_now }),
      ...(input.cost_of_inaction !== undefined && { cost_of_inaction: input.cost_of_inaction }),
      ...(input.expected_metric !== undefined && { expected_metric: input.expected_metric }),
      ...(input.expected_direction !== undefined && { expected_direction: input.expected_direction }),
      ...(input.expected_target !== undefined && { expected_target: input.expected_target }),
    };
    updates.constraintsConsidered = mergedConstraints;
  }

  const updated = await db.recommendation.update({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
    data: updates,
  });

  await emitAuditEvent({
    eventName: "recommendation.updated",
    actorId: userId,
    entityType: "recommendation",
    entityId: recommendationId,
    workspaceId: validatedWorkspaceId,
    payload: updates,
    visibility: "internal",
  });

  // Emit canonical event to maintain event sourcing trail
  const eventPayload: Record<string, unknown> = {};
  if (input.status) {
    eventPayload.status = input.status;
  }
  if (input.priority) {
    eventPayload.priority = input.priority;
  }
  if (input.why_now !== undefined) {
    eventPayload.why_now = input.why_now;
  }
  if (input.cost_of_inaction !== undefined) {
    eventPayload.cost_of_inaction = input.cost_of_inaction;
  }
  if (input.expected_metric !== undefined) {
    eventPayload.expected_metric = input.expected_metric;
  }
  if (input.expected_direction !== undefined) {
    eventPayload.expected_direction = input.expected_direction;
  }
  if (input.expected_target !== undefined) {
    eventPayload.expected_target = input.expected_target;
  }

  if (Object.keys(eventPayload).length > 0) {
    await EventEmitterService.emit({
      aggregateId: recommendationId,
      aggregateType: "recommendation",
      eventType: "recommendation.updated",
      eventVersion: 1,
      payload: eventPayload as Record<string, string>,
      actorId: userId,
      workspaceId: validatedWorkspaceId,
      visibilityScope: "internal",
      sensitivityClassification: "standard",
    });
  }

  return updated;
}

export async function getRecommendationAuditTrail(
  recommendationId: string,
  userId: string,
  workspaceId: string
): Promise<AuditTrailEvent[]> {
  enforceWorkspaceId(workspaceId, "getRecommendationAuditTrail", "recommendation");

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId },
    include: { engagement: true },
  });

  if (!rec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  await assertEngagementAccess(userId, rec.engagementId, workspaceId);

  const events = await db.canonicalEvent.findMany({
    where: {
      aggregateId: recommendationId,
      aggregateType: "recommendation",
      workspaceId,
    },
    orderBy: { eventNumber: "asc" },
  });

  return events.map((event: typeof events[0]) => ({
    eventType: event.eventType,
    eventNumber: event.eventNumber,
    occurredAt: event.occurredAt,
    payload: event.payload,
  }));
}

export async function createRecommendationsFromInterventions(
  engagementId: string,
  interventions: PrioritizedIntervention[],
  authContext: CanonicalAuthContext,
  workspaceId: string
) {
  const [, validatedWorkspaceId] = requireServiceContext(
    authContext,
    workspaceId
  );

  if (!interventions || interventions.length === 0) {
    return [];
  }

  // G15 — arbitrate the candidate interventions before generating recommendations so the
  // chosen action, rejected alternatives, and what-NOT-to-do are decided + audited at
  // runtime (not only reachable via the standalone arbitrate route).
  await arbitrateInterventions(validatedWorkspaceId, interventions);

  const recommendations = [];

  for (const priIntervention of interventions) {
    const intervention = priIntervention.intervention;

    const mapClassToRecommendationClass = (
      interventionClass: string
    ): RecommendationClass => {
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

    const rec = await createRecommendation(input, authContext, validatedWorkspaceId);
    recommendations.push(rec);
  }

  return recommendations;
}
