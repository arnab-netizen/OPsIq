import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createAction, listActions } from "@/services/action";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";

const createActionSchema = z.object({
  engagementId: z.string().uuid(),
  recommendationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  assignedTo: z.string().uuid().optional(),
});

const listActionsSchema = paginationSchema.extend({
  engagementId: z.string().uuid().optional(),
  recommendationId: z.string().uuid().optional(),
  status: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

export const GET = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

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
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const params = parseSearchParams(request.url, listActionsSchema);
  const result = await listActions(workspaceId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.ACTION_CREATE,
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

  // Require Idempotency-Key (fail-closed)
  const idempotencyKey = nextRequest.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "Idempotency-Key header required" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check capability: action_create
  const capabilityCheck = await assertCapability(workspaceId, "action_create");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("action_create", capabilityCheck.reason || "Plan limit exceeded");
  }

  const body = await parseRequestBody(request, createActionSchema);

  const { isNew, result } = await withIdempotency(
    idempotencyKey,
    "action.create",
    async () => createAction(body, authContext, workspaceId),
    body,
    authContext.session.user.id
  );

  return Response.json(result, { status: isNew ? 201 : 200 });
});
