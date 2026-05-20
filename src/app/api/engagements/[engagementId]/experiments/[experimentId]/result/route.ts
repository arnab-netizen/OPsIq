/**
 * POST /api/engagements/[engagementId]/experiments/[experimentId]/result
 * Record experiment result and transition to analyzed
 */

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordResult, ExperimentLifecycleError } from "@/services/experiment/experiment-lifecycle.service";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";
import type { Experiment } from "@/domain/experiment/experiment";
import { classifyOperatorError } from "@/lib/operator-error-governance";

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
    const validated = resultSchema.parse(body);

    const experiment = experimentStore.get(experimentId);
    if (!experiment) {
      return Response.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    const analyzed = await recordResult(experiment, validated, workspaceId, session.user.id);
    experimentStore.set(experimentId, analyzed);

    return Response.json({
      experiment: toExperimentDTO(analyzed),
    }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof ExperimentLifecycleError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      const classified = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: classified.operatorMessage }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
