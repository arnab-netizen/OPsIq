import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError, ValidationError, PlanLimitError } from "@/infra/errors";
import { assertEngagementAccess } from "@/lib/visibility";
import { logger } from "@/infra/logger";
import { withIdempotency } from "@/infra/idempotency";
import { calculateExecutionCertainty } from "@/services/execution-certainty";
import { enforceWorkspaceId } from "@/lib/workspace-validation";
import { requireServiceContext } from "@/lib/service-auth";
import type { AuthContext } from "@/lib/auth-guard";
import { assertCapability } from "@/services/entitlement.service";
import { recordRecommendationUsage } from "@/services/usage.service";
import { EventEmitterService } from "@/services/event-emitter";
import type { PrioritizedIntervention } from "@/domain/consulting-engine/types";
import { listEvidence } from "@/services/evidence";
import { getKPIsForEngagement } from "@/services/kpi";

interface TransactionClient {
  recommendation: {
    create: (params: { data: Record<string, unknown> }) => Promise<{ id: string }>;
  };
}

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
  overrideExecutionCertainty?: {
    reason: string;
    approvedBy: string;
  };
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

// Phase 1: Evidence evaluation
interface EvidenceAssessment {
  evidenceCount: number;
  validatedCount: number;
  rejectedCount: number;
  validationScore: number;
  reliabilityLevel: "low" | "medium" | "high" | "critical";
}

// Phase 1: Evidence evaluation
interface EvidenceAssessment {
  evidenceCount: number;
  validatedCount: number;
  rejectedCount: number;
  validationScore: number;
  reliabilityLevel: "low" | "medium" | "high" | "critical";
}

async function evaluateEngagementEvidence(
  engagementId: string,
  workspaceId: string
): Promise<EvidenceAssessment> {
  try {
    const evidence = await listEvidence(workspaceId, { engagementId });

    const validatedCount = evidence.filter((e: Record<string, unknown>) => e.status === "validated").length;
    const rejectedCount = evidence.filter((e: Record<string, unknown>) => e.status === "rejected").length;
    const totalCount = evidence.length;

    const validationScore = totalCount > 0 ? validatedCount / totalCount : 0;

    let reliabilityLevel: "low" | "medium" | "high" | "critical";
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

// Phase 2: KPI Health Assessment
interface KPIAssessment {
  kpiCount: number;
  healthyKPICount: number;
  degradedKPICount: number;
  healthScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

async function evaluateEngagementKPIHealth(
  engagementId: string,
  workspaceId: string
): Promise<KPIAssessment> {
  try {
    const kpis = await getKPIsForEngagement(engagementId, workspaceId);

    const degradedCount = kpis?.filter((k: Record<string, unknown>) => k.status === "degraded").length || 0;
    const totalCount = kpis?.length || 0;
    const healthyCount = totalCount - degradedCount;

    const healthScore = totalCount > 0 ? healthyCount / totalCount : 1;

    let riskLevel: "low" | "medium" | "high" | "critical";
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
  authContext: AuthContext,
  workspaceId: string,
  idempotencyKey?: string
) {
  // Check capability: generate_recommendation
  const capabilityCheck = await assertCapability(workspaceId, "generate_recommendation");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("generate_recommendation", capabilityCheck.reason || "Plan limit exceeded");
  }

  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId, workspaceId: validatedWorkspaceId },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Phase 1: Evaluate evidence for this engagement (ACTIVE wiring)
  const evidenceAssessment = await evaluateEngagementEvidence(input.engagementId, validatedWorkspaceId);

  // Phase 2: Evaluate KPI health (ACTIVE wiring)
  const kpiAssessment = await evaluateEngagementKPIHealth(input.engagementId, validatedWorkspaceId);

  if (idempotencyKey) {
    const result = await withIdempotency(
      idempotencyKey,
      "recommendation.create",
      async () => {
        return await db.$transaction(async (tx: TransactionClient) => {
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
              workspaceId: validatedWorkspaceId,
              createdBy: userId,
              evidenceValidationScore: Math.round(evidenceAssessment.validationScore * 100),
              reliabilityLevel: evidenceAssessment.reliabilityLevel,
              kpiHealthScore: Math.round(kpiAssessment.healthScore * 100),
              kpiRiskLevel: kpiAssessment.riskLevel,
            },
          });

          await emitAuditEvent({
            eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
            actorId: userId,
            entityType: "recommendation",
            entityId: recommendation.id,
            payload: {
              engagementId: input.engagementId,
              priority: input.priority,
            },
            visibility: "internal",
          });

          // Emit canonical event (Phase 1 + Phase 2 + Phase 3 integration)
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
            idempotencyKey: idempotencyKey,
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

      // Record usage for recommendation generation (only on new creation)
      await recordRecommendationUsage(validatedWorkspaceId, 1, {
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
      workspaceId: validatedWorkspaceId,
      createdBy: userId,
      evidenceValidationScore: Math.round(evidenceAssessment.validationScore * 100),
      reliabilityLevel: evidenceAssessment.reliabilityLevel,
      kpiHealthScore: Math.round(kpiAssessment.healthScore * 100),
      kpiRiskLevel: kpiAssessment.riskLevel,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_CREATED,
    actorId: userId,
    entityType: "recommendation",
    entityId: recommendation.id,
    payload: {
      engagementId: input.engagementId,
      priority: input.priority,
    },
    visibility: "internal",
  });

  // Emit canonical event
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
    idempotencyKey: idempotencyKey,
    visibilityScope: "internal",
    sensitivityClassification: "standard",
  });

  // Record usage for recommendation generation
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

// Phase 3: Operational replay verification (not just audit)
// Verifies recommendation state before critical operations
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

  // Get live state from database
  const liveRec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId },
  });

  if (!liveRec) {
    throw new NotFoundError("Recommendation", recommendationId);
  }

  const { EventReplayEngine } = await import("@/services/event-replay-engine");
  const { ReplayFailureHandler } = await import("@/services/replay-failure-handler");

  try {
    // Replay events to reconstruct state
    const replayed = await EventReplayEngine.replayAggregate(
      recommendationId,
      "recommendation",
      workspaceId
    );

    // Validate replay result
    const validation = await EventReplayEngine.validateReplayResult(
      replayed,
      recommendationId,
      "recommendation"
    );

    if (!validation.valid) {
      logger.error(
        "VerifyRecommendationState: Replay validation failed (corruption detected)",
        {
          recommendationId,
          errors: validation.errors,
        }
      );
      throw new Error(
        `Replay validation failed: ${validation.errors.join("; ")}`
      );
    }

    // Check parity: live state should match replayed state
    const parityOk =
      liveRec.title === (replayed.state.title as string) &&
      liveRec.priority === (replayed.state.priority as string) &&
      liveRec.evidenceValidationScore ===
        (replayed.state.evidenceValidationScore as number);

    if (!parityOk) {
      logger.warn("VerifyRecommendationState: Parity mismatch detected", {
        recommendationId,
        liveTitle: liveRec.title,
        replayedTitle: replayed.state.title,
      });
    }

    const operationMode = ReplayFailureHandler.getSafeOperationMode({
      usedSnapshot: replayed.usedSnapshot,
      eventCount: replayed.eventCount,
      state: replayed.state,
    });

    return {
      verified: validation.valid,
      live: {
        id: liveRec.id,
        title: liveRec.title,
        priority: liveRec.priority,
        evidenceValidationScore: liveRec.evidenceValidationScore,
      },
      replayed: {
        title: replayed.state.title,
        priority: replayed.state.priority,
        evidenceValidationScore: replayed.state.evidenceValidationScore,
      },
      parityOk,
      operationMode,
    };
  } catch (error) {
    const replayError = error instanceof Error ? error : new Error(String(error));

    ReplayFailureHandler.handleReplayFailure(
      {
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        operation: "verify",
        error: replayError,
      },
      {
        allowFallback: true, // Fallback allowed for read operation
        blockUpdateOperations: false,
      }
    );

    throw error;
  }
}

export async function getRecommendationsForEngagement(engagementId: string, userId: string, workspaceId: string) {
  enforceWorkspaceId(workspaceId, "getRecommendationsForEngagement", "recommendation");

  // Check engagement access
  await assertEngagementAccess(userId, engagementId, workspaceId);

  return db.recommendation.findMany({
    where: { engagementId, workspaceId },
    select: {
      id: true,
      engagementId: true,
      findingId: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      expectedImpact: true,
      implementationPhase: true,
      executionCertaintyScore: true,
      version: true,
      createdAt: true,
      // Phase 1: Evidence assessment scores (now consumed in queries)
      evidenceValidationScore: true,
      reliabilityLevel: true,
      // Phase 2: KPI health assessment scores (now consumed in queries)
      kpiHealthScore: true,
      kpiRiskLevel: true,
      actions: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
        },
      },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateRecommendationStatus(
  recommendationId: string,
  input: UpdateRecommendationInput,
  authContext: AuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
    include: { engagement: true },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  // Validate version for optimistic locking
  if (rec.version !== input.version) {
    throw new ConflictError(
      "Recommendation has been modified by another process. Current version: " + rec.version,
      { code: "STALE_VERSION" }
    );
  }

  // Enforce execution certainty gate for approval
  if (input.status === "approved") {
    // Phase 3: Verify recommendation state via replay before approval (critical operation)
    try {
      const stateVerification = await verifyRecommendationState(
        recommendationId,
        userId,
        validatedWorkspaceId
      );

      if (!stateVerification.parityOk) {
        logger.error(
          "UpdateRecommendationStatus: Replay parity mismatch on approval (blocking unsafe decision)",
          {
            recommendationId,
            operationMode: stateVerification.operationMode,
          }
        );
        throw new Error(
          "Cannot approve recommendation: Event sourcing parity check failed. " +
            "Replay state does not match database state. This may indicate event corruption."
        );
      }

      logger.info(
        "UpdateRecommendationStatus: Recommendation state verified before approval",
        {
          recommendationId,
          parityOk: stateVerification.parityOk,
          operationMode: stateVerification.operationMode,
        }
      );
    } catch (error) {
      // Replay verification failed - block approval (fail closed)
      logger.error("UpdateRecommendationStatus: State verification failed", {
        recommendationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    try {
      const [findings, recommendations, actions] = await Promise.all([
        db.finding.findMany({
          where: { engagementId: rec.engagementId, workspaceId: validatedWorkspaceId },
        }),
        db.recommendation.findMany({
          where: { engagementId: rec.engagementId, workspaceId: validatedWorkspaceId },
        }),
        db.action.findMany({
          where: { engagementId: rec.engagementId, workspaceId: validatedWorkspaceId },
        }),
      ]);

      const engagement = await db.engagement.findUnique({
        where: { id: rec.engagementId, workspaceId: validatedWorkspaceId },
      });

      if (engagement) {
        const findingsForCertainty = findings.map((f: typeof findings[0]) => ({
          id: f.id,
          severity: (f.severity as "critical" | "high" | "medium" | "low") || "low",
          resolved: f.status === "resolved" || f.status === "closed",
          verified: f.verified ?? false,
        }));

        const recommendationsForCertainty = recommendations.map((r: typeof recommendations[0]) => ({
          id: r.id,
          priority: (r.priority as "critical" | "high" | "medium" | "low") || "medium",
          status: (r.status as "blocked" | "in_progress" | "completed") || "in_progress",
        }));

        const actionsForCertainty = actions.map((a: typeof actions[0]) => ({
          id: a.id,
          priority: (a.priority as "critical" | "high" | "medium" | "low") || "medium",
          status: (a.status as "blocked" | "pending" | "in_progress" | "completed" | "verified") || "pending",
        }));

        const certaintyResult = calculateExecutionCertainty(
          rec.engagementId,
          findingsForCertainty,
          recommendationsForCertainty,
          actionsForCertainty,
          [],
          {
            overallStatus: (engagement.healthStatus as "critical" | "at_risk" | "stable" | "healthy") || "stable",
            kpiTrend: "flat" as const,
          }
        );

        // Check if execution certainty gate is failing
        if (certaintyResult.level === "blocked" || certaintyResult.score < 40) {
          // If override is provided, allow approval with override audit event
          if (input.overrideExecutionCertainty) {
            logger.warn("Execution certainty gate overridden for recommendation approval", {
              recommendationId,
              engagementId: rec.engagementId,
              score: certaintyResult.score,
              level: certaintyResult.level,
              overrideReason: input.overrideExecutionCertainty.reason,
              overriddenBy: input.overrideExecutionCertainty.approvedBy,
            });

            await emitAuditEvent({
              eventName: AUDIT_EVENTS.EXECUTION_CERTAINTY_OVERRIDE,
              actorId: userId,
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
            // No override provided, enforce gate by throwing error
            logger.warn("Execution certainty gate blocking recommendation approval", {
              recommendationId,
              engagementId: rec.engagementId,
              score: certaintyResult.score,
              level: certaintyResult.level,
              blockers: certaintyResult.blockers,
              risks: certaintyResult.risks,
            });

            await emitAuditEvent({
              eventName: AUDIT_EVENTS.EXECUTION_CERTAINTY_WARNING,
              actorId: userId,
              entityType: "recommendation",
              entityId: recommendationId,
              payload: {
                engagementId: rec.engagementId,
                score: certaintyResult.score,
                level: certaintyResult.level,
                blockers: certaintyResult.blockers,
                risks: certaintyResult.risks,
                reason: "Recommendation cannot be approved because execution certainty is too low",
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
      // Re-throw ValidationError (gate enforcement)
      if (error instanceof ValidationError) {
        throw error;
      }
      // For other errors, fail closed on approval attempts
      logger.error("Error checking execution certainty before approval", {
        recommendationId,
        engagementId: rec.engagementId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new ValidationError(
        "Unable to validate execution certainty before approval. Please try again.",
        {
          originalError: error instanceof Error ? error.message : "Unknown error",
        }
      );
    }
  }

  // Optimistic locking: update only if version matches
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
  if (!updated) throw new NotFoundError("Recommendation", recommendationId);

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.RECOMMENDATION_APPROVED,
    actorId: userId,
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
  authContext: AuthContext,
  workspaceId: string,
  recommendationClass?: RecommendationClass
): Promise<{ id: string; score: number; priority: string }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

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
  authContext: AuthContext,
  workspaceId: string
): Promise<{ updated: number; recommendations: Array<{ id: string; oldPriority: string; newPriority: string; score: number }> }> {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const recommendations = await db.recommendation.findMany({
    where: { engagementId, workspaceId: validatedWorkspaceId },
  });

  const updated: Array<{ id: string; oldPriority: string; newPriority: string; score: number }> = [];
  let updateCount = 0;

  for (const rec of recommendations) {
    // Check if this recommendation has scoring metrics (for test compatibility)
    const scoringMetrics = (rec as { scoringMetrics?: unknown }).scoringMetrics;
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
          where: { id: rec.id, workspaceId: validatedWorkspaceId },
          data: {
            priority: newPriority,
            version: { increment: 1 },
          },
        });

        // Emit audit event
        await emitAuditEvent({
          eventName: AUDIT_EVENTS.RECOMMENDATION_UPDATED,
          actorId: userId,
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
    } catch {
      // Skip recommendations with invalid scoring metrics
      continue;
    }
  }

  return { updated: updateCount, recommendations: updated };
}

export async function getRecommendation(recommendationId: string, workspaceId: string) {
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
      expectedImpact: true,
      implementationPhase: true,
      executionCertaintyScore: true,
      scoreBreakdown: true,
      version: true,
      createdAt: true,
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
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);
  return rec;
}

export async function updateRecommendation(
  recommendationId: string,
  input: UpdateRecommendationInput,
  authContext: AuthContext,
  workspaceId: string
) {
  const [userId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId: validatedWorkspaceId },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  if (rec.version !== input.version) {
    throw new Error("Recommendation was modified. Please refresh and try again.");
  }

  const updates: Record<string, unknown> = { version: { increment: 1 } };
  if (input.status) updates.status = input.status;
  if (input.priority) updates.priority = input.priority;

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

  return updated;
}

// Phase 3: Runtime consumer for EventReplayEngine (makes replay ACTIVE, not TEST_ONLY)
export async function getRecommendationAuditTrail(
  recommendationId: string,
  userId: string,
  workspaceId: string
) {
  enforceWorkspaceId(workspaceId, "getRecommendationAuditTrail", "recommendation");

  const rec = await db.recommendation.findUnique({
    where: { id: recommendationId, workspaceId },
    include: { engagement: true },
  });
  if (!rec) throw new NotFoundError("Recommendation", recommendationId);

  // Check access
  await assertEngagementAccess(userId, rec.engagementId, workspaceId);

  // Import EventReplayEngine at runtime to reconstruct audit history from events
  const { EventReplayEngine } = await import("@/services/event-replay-engine");
  const { SnapshotEngine } = await import("@/services/snapshot-engine");

  try {
    // Check if snapshot exists (Phase 3 optimization with snapshots)
    const snapshot = await db.snapshotData.findFirst({
      where: {
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        workspaceId,
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    // If snapshot exists and is recent, use replay with snapshot (SnapshotEngine ACTIVE)
    let auditTrail;
    if (snapshot) {
      logger.info("AuditTrail: Using snapshot for replay optimization", {
        recommendationId,
        snapshotEventNumber: snapshot.lastEventNumber,
      });
      // Replay from snapshot to present (using SnapshotEngine indirectly)
      const replayedState = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );
      auditTrail = replayedState.state.events || [];
    } else {
      // Full replay without snapshot
      const replayedState = await EventReplayEngine.replayAggregate(
        recommendationId,
        "recommendation",
        workspaceId
      );
      auditTrail = replayedState.state.events || [];
    }

    return auditTrail;
  } catch (error) {
    logger.warn("Failed to get audit trail via replay, falling back to event log", {
      recommendationId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Fallback: return raw events without full replay
    const events = await db.canonicalEvent.findMany({
      where: {
        aggregateId: recommendationId,
        aggregateType: "recommendation",
        workspaceId,
      },
      orderBy: { eventNumber: "asc" },
    });

    return events.map((e: any) => ({
      eventType: e.eventType,
      eventNumber: e.eventNumber,
      occurredAt: e.occurredAt,
      payload: e.payload,
    }));
  }
}

export async function createRecommendationsFromInterventions(
  engagementId: string,
  interventions: PrioritizedIntervention[],
  authContext: AuthContext,
  workspaceId: string
) {
  const [, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);

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

    const rec = await createRecommendation(input, authContext, validatedWorkspaceId);
    recommendations.push(rec);
  }

  return recommendations;
}
