/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/progress
 * Update experiment execution progress
 */

import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateExecution, ExperimentLifecycleError } from "@/services/experiment/experiment-lifecycle.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";
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
    const body = await request.json();
    const validated = progressSchema.parse(body);

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      return Response.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    const updated = await updateExecution(experiment, validated, workspaceId, session.user.id);
    experimentStore.set(experimentId, updated);

    return Response.json(toExperimentDTO(updated), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof ExperimentLifecycleError) {
      const governed = classifyOperatorError(error, { context: "action" });
      return Response.json(
        { error: governed.operatorMessage },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return Response.json({ error: classifyOperatorError(error, { context: "action" }).operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
