/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/approve
 * Transition experiment from draft to approved status
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NotFoundError } from "@/infra/errors";
import { approveExperiment } from "@/services/experiment/experiment-lifecycle.service";
import type { Experiment } from "@/domain/experiment/experiment";

// Mock store for now - would fetch from DB in production
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

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      throw new NotFoundError("Experiment", experimentId);
    }

    const approved = await approveExperiment(experiment, workspaceId, actorId);
    experimentStore.set(experimentId, approved);

    return toExperimentDTO(approved);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
