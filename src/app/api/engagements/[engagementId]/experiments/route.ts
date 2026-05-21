/**
 * API Route: Experiments
 *
 * Manages experiment lifecycle via HTTP endpoints
 * Wires: ExperimentLifecycleService
 * Enforces: workspace scoping, auth (ENGAGEMENT_UPDATE capability), validation
 */

import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import {
  createExperiment,
  approveExperiment,
  startExperiment,
  updateExecution,
  recordResult,
  captureLearning,
  analyzeOutcome,
  ExperimentLifecycleError,
} from "@/services/experiment/experiment-lifecycle.service";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";
import type {
  Experiment,
  ExperimentPlan,
  Hypothesis,
  ExperimentExecution,
  ExperimentResult,
  ExperimentLearning,
} from "@/domain/experiment/experiment";

// Zod schemas for request validation
const hypothesisSchema = z.object({
  statement: z.string().min(20),
  type: z.enum(["revenue_growth", "retention_improvement", "cost_reduction", "market_expansion", "product_pivot", "operational_efficiency", "risk_mitigation"]),
  successCriterion: z.string().min(10),
  successThreshold: z.number().positive(),
  successMetric: z.string(),
  failureRisk: z.string().min(10),
  failureThreshold: z.number().negative(),
  testDurationWeeks: z.number().int().min(1),
  reviewCadenceWeeks: z.number().int().min(1),
});

const experimentPlanSchema = z.object({
  hypothesis: hypothesisSchema,
  actionDescription: z.string().min(20),
  targetAudience: z.string().min(5),
  controlGroup: z.string().min(5),
  primaryMetric: z.string(),
  secondaryMetrics: z.array(z.string()).min(1),
  confoundingFactors: z.array(z.string()).min(1),
  estimatedCost: z.number().nonnegative(),
  estimatedEffort: z.string(),
  requiredCapabilities: z.array(z.string()),
  dependencies: z.array(z.string()).default([]),
  requiredApprovals: z.array(z.string()).default([]),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  rigorLevel: z.enum(["exploratory", "standard", "strict", "controlled"]),
});

const createExperimentSchema = z.object({
  engagementId: z.string().uuid(),
  plan: experimentPlanSchema,
  name: z.string().min(5),
  description: z.string().optional(),
  linkedDecisionId: z.string().uuid().optional(),
  linkedActionId: z.string().uuid().optional(),
  linkedRecommendationId: z.string().uuid().optional(),
});

const executionSchema = z.object({
  percentComplete: z.number().min(0).max(100).optional(),
  daysElapsed: z.number().nonnegative().optional(),
  daysRemaining: z.number().nonnegative().optional(),
  notes: z.array(z.string()).optional(),
  stoppedEarly: z.boolean().optional(),
  stoppingReason: z.string().optional(),
});

const resultSchema = z.object({
  classification: z.enum(["success", "partial", "failure", "inconclusive"]),
  successThresholdMet: z.boolean(),
  primaryMetricValue: z.number(),
  primaryMetricChange: z.number(),
  primaryMetricTrend: z.enum(["increasing", "decreasing", "flat"]),
  secondaryResults: z.record(z.string(), z.object({
    value: z.number(),
    change: z.number(),
    trend: z.enum(["increasing", "decreasing", "flat"]),
  })),
  actualCost: z.number().nonnegative(),
  roi: z.number(),
  confidenceLevel: z.number().min(0).max(100).optional(),
  dataQuality: z.enum(["high", "medium", "low"]),
});

const learningSchema = z.object({
  keyFinding: z.string().min(10),
  implications: z.string().min(10),
  confidence: z.enum(["low", "medium", "high"]),
  nextAction: z.string().optional(),
  priorityAfterLearning: z.enum(["low", "medium", "high", "critical"]).optional(),
  howToImproveMetric: z.string().optional(),
});

// Response DTO (no internal fields exposed)
function toExperimentDTO(exp: Experiment) {
  return {
    id: exp.id,
    workspaceId: exp.workspaceId,
    engagementId: exp.engagementId,
    status: exp.status,
    name: exp.name,
    description: exp.description || null,
    plan: exp.plan,
    execution: exp.execution || null,
    result: exp.result || null,
    learning: exp.learning || null,
    linkedDecisionId: exp.linkedDecisionId || null,
    linkedActionId: exp.linkedActionId || null,
    linkedRecommendationId: exp.linkedRecommendationId || null,
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
  };
}

/**
 * POST /api/engagements/[engagementId]/experiments
 * Create a new experiment in draft status
 */
export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  // Check entitlement: experiment_create (plan-based quota enforcement)
  const capabilityCheck = await assertCapability(workspaceId, "experiment_create");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("experiment_create", capabilityCheck.reason || "Plan limit exceeded");
  }

  try {
    const body = await request.json();
    const validated = createExperimentSchema.parse(body);

    const experiment = await createExperiment(
      workspaceId,
      validated.engagementId,
      validated.plan,
      validated.name,
      validated.description,
      validated.linkedDecisionId,
      validated.linkedActionId,
      validated.linkedRecommendationId,
      session.user.id
    );

    return Response.json(toExperimentDTO(experiment), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof ExperimentLifecycleError) {
      const governed = classifyOperatorError(error, { context: "load" });
      return Response.json(
        { error: error.code, message: governed.operatorMessage },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return Response.json({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

/**
 * GET /api/engagements/[engagementId]/experiments
 * List experiments for engagement
 */
export const GET = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_UPDATE,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    // TODO: Implement DB query to fetch experiments for engagement
    // For now, return empty list as placeholder
    return Response.json({
      workspaceId,
      experiments: [],
      count: 0,
    });
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
