/**
 * API Route: Experiments
 *
 * Manages experiment lifecycle via HTTP endpoints
 * Wires: ExperimentLifecycleService
 * Enforces: workspace scoping, auth (ENGAGEMENT_UPDATE capability), validation
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createExperiment,
} from "@/services/experiment/experiment-lifecycle.service";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { z } from "zod/v4";
import type {
  Experiment,
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
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    // Check entitlement: experiment_create (plan-based quota enforcement)
    const capabilityCheck = await assertCapability(workspaceId, "experiment_create");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("experiment_create", capabilityCheck.reason || "Plan limit exceeded");
    }

    const body = ctx.request ? await ctx.request.json() : {};
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
      actorId
    );

    return toExperimentDTO(experiment);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);

/**
 * GET /api/engagements/[engagementId]/experiments
 * List experiments for engagement
 */
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    return {
      workspaceId,
      experiments: [],
      count: 0,
    };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
