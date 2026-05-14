import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createDeliverable, getDeliverablesForEngagement } from "@/services/deliverable";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, parseRequestBody, uuidSchema } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

const createDeliverableSchema = z.object({
  engagementId: z.string().uuid(),
  stageId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const url = new URL(ctx.request!.url);
    const engagementId = url.searchParams.get("engagementId");

    if (!engagementId) {
      return Response.json(
        { error: "engagementId is required" },
        { status: 400 }
      );
    }

    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const deliverables = await getDeliverablesForEngagement(engagementId, workspaceId);
    return Response.json(deliverables);
  },
  { requireWorkspace: true, requireCapabilities: ['DELIVERABLE_VIEW'] }
);

export const POST = withEnforcementFull(async (request: NextRequest) => {
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
    throw new ForbiddenError("Unauthorized");
  }

  const body = await parseRequestBody(request, createDeliverableSchema);
  parseOrThrow(uuidSchema, body.engagementId);
  parseOrThrow(uuidSchema, body.stageId);

  await assertEngagementAccess(authContext.session.user.id, body.engagementId, workspaceId);

  const canonicalContext = canonicalizeAuthContext(authContext, workspaceId);
  const { isNew, result } = await withIdempotency(
    idempotencyKey,
    "deliverable.create",
    async () => createDeliverable(body, canonicalContext, workspaceId),
    body,
    authContext.session.user.id
  );

  return Response.json(result, { status: isNew ? 201 : 200 });
});
