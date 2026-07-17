/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/progress
 * Update experiment execution progress
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";
import { updateExecution } from "@/services/experiment/experiment-lifecycle.service";
import { z } from "zod/v4";
import type { Experiment } from "@/domain/experiment/experiment";

const progressSchema = z.object({
  percentComplete: z.number().min(0).max(100).optional(),
  daysElapsed: z.number().nonnegative().optional(),
  daysRemaining: z.number().nonnegative().optional(),
  notes: z.array(z.string()).optional(),
  stoppedEarly: z.boolean().optional(),
  stoppingReason: z.string().optional(),
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
    const validated = progressSchema.parse(body);

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      throw new NotFoundError("Experiment", experimentId);
    }

    const updated = await updateExecution(experiment, validated, workspaceId, actorId);
    experimentStore.set(experimentId, updated);

    return toExperimentDTO(updated);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
