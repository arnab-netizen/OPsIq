/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/learning
 * Capture learning from analyzed experiment and transition to archived
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";
import { captureLearning, ExperimentLifecycleError } from "@/services/experiment/experiment-lifecycle.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";
import type { Experiment } from "@/domain/experiment/experiment";

const learningSchema = z.object({
  keyFinding: z.string().min(10),
  implications: z.string().min(10),
  confidence: z.enum(["low", "medium", "high"]),
  nextAction: z.string().optional(),
  priorityAfterLearning: z.enum(["low", "medium", "high", "critical"]).optional(),
  howToImproveMetric: z.string().optional(),
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
    const validated = learningSchema.parse(body);

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      throw new NotFoundError("Experiment", experimentId);
    }

    const archived = await captureLearning(experiment, validated, workspaceId, actorId);
    experimentStore.set(experimentId, archived);

    return toExperimentDTO(archived);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
