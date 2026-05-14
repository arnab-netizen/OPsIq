import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById, updateAction } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { ACTION_STATUSES } from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateActionSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(ACTION_STATUSES).optional(),
  assignedTo: z.string().uuid().optional(),
  completedAt: z.string().optional(),
  verifiedAt: z.string().optional(),
  blockerReason: z.string().optional(),
  notes: z.string().optional(),
  version: z.number().int().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx, params) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const action = await getActionById(actionId, ctx.verifiedWorkspaceId);
    return action;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.ACTION_VIEW],
  }
);

export const PATCH = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
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

  const { actionId } = params;
  parseOrThrow(uuidSchema, actionId);

  const body = await parseRequestBody(request, updateActionSchema);
  await updateAction(actionId, body, { session, policy }, workspaceId);

  const updated = await getActionById(actionId, workspaceId);
  return Response.json(updated);
});
