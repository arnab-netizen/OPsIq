import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createDeliverable, getDeliverablesForEngagement } from "@/services/deliverable";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, parseRequestBody, uuidSchema } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const createDeliverableSchema = z.object({
  engagementId: z.string().uuid(),
  stageId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
  const { session } = await withAuth({ capability: CAPABILITIES.DELIVERABLE_VIEW });

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

  const url = new URL(request.url);
  const engagementId = url.searchParams.get("engagementId");

  if (!engagementId) {
    return Response.json(
      { error: "engagementId is required" },
      { status: 400 }
    );
  }

  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const deliverables = await getDeliverablesForEngagement(engagementId, workspaceId);
  return Response.json(deliverables);
});

export const POST = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.DELIVERABLE_CREATE,
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

  const body = await parseRequestBody(request, createDeliverableSchema);
  parseOrThrow(uuidSchema, body.engagementId);
  parseOrThrow(uuidSchema, body.stageId);

  await assertEngagementAccess(authContext.session.user.id, body.engagementId, workspaceId);

  const { isNew, result } = await withIdempotency(
    idempotencyKey,
    "deliverable.create",
    async () => createDeliverable(body, authContext, workspaceId),
    body,
    authContext.session.user.id
  );

  return Response.json(result, { status: isNew ? 201 : 200 });
});
