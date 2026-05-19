/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/start
 * Transition experiment from approved to active status
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { startExperiment, ExperimentLifecycleError } from "@/services/experiment/experiment-lifecycle.service";
import type { NextRequest } from "next/server";
import type { Experiment } from "@/domain/experiment/experiment";

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

export const POST = withEnforcementFull(async (request, context, params) => {
  const { experimentId } = params;

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
    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      return Response.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    const active = await startExperiment(experiment, workspaceId, session.user.id);
    experimentStore.set(experimentId, active);

    return Response.json(toExperimentDTO(active), { status: 200 });
  } catch (error) {
    if (error instanceof ExperimentLifecycleError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
