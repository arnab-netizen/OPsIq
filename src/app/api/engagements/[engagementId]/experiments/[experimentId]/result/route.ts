/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/result
 * Record experiment result and transition to analyzed
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";
import { recordResult, analyzeOutcome, ExperimentLifecycleError } from "@/services/experiment/experiment-lifecycle.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";
import type { Experiment } from "@/domain/experiment/experiment";

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

const experimentStore = new Map<string, Experiment>();

function toExperimentDTO(exp: Experiment) {
  return {
    id: exp.id,
    workspaceId: exp.workspaceId,
    engagementId: exp.engagementId,
    status: exp.status,
    name: exp.name,
    plan: exp.plan,
    execution: exp.execution || null,
    result: exp.result || null,
    learning: exp.learning || null,
    createdAt: exp.createdAt,
    updatedAt: exp.updatedAt,
  };
}

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const { experimentId } = params;

    const body = ctx.request ? await ctx.request.json() : {};
    const validated = resultSchema.parse(body);

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      throw new NotFoundError("Experiment", experimentId);
    }

    const analyzed = await recordResult(experiment, validated, workspaceId, actorId);
    experimentStore.set(experimentId, analyzed);

    const analysis = analyzeOutcome(analyzed);

    return {
      experiment: toExperimentDTO(analyzed),
      analysis,
    };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
