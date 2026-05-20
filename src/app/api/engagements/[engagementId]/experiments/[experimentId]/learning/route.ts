/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/learning
 * Capture learning from analyzed experiment and transition to archived
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { captureLearning, ExperimentLifecycleError } from "@/services/experiment/experiment-lifecycle.service";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";
import type { Experiment } from "@/domain/experiment/experiment";
import { classifyOperatorError } from "@/lib/operator-error-governance";

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
    const validated = learningSchema.parse(body);

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      return Response.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    const archived = await captureLearning(experiment, validated, workspaceId, session.user.id);
    experimentStore.set(experimentId, archived);

    return Response.json(toExperimentDTO(archived), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof ExperimentLifecycleError || error instanceof Error) {
      const classified = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
