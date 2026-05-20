import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext, ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createDeliverable, getDeliverablesForEngagement } from "@/services/deliverable";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, parseRequestBody, uuidSchema } from "@/lib/validation";
import { withIdempotency } from "@/infra/idempotency";
import { z } from "zod/v4";

const createDeliverableSchema = z.object({
  engagementId: z.string().uuid(),
  stageId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = nextRequest.headers.get("x-workspace-id");
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

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const idempotencyKey = ctx.request!.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "Idempotency-Key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, createDeliverableSchema);
    parseOrThrow(uuidSchema, body.engagementId);
    parseOrThrow(uuidSchema, body.stageId);

    await assertEngagementAccess(ctx.verifiedActorId, body.engagementId, ctx.verifiedWorkspaceId);

    const { isNew, result } = await withIdempotency(
      idempotencyKey,
      "deliverable.create",
      async () => {
        const authEnvelope: ServiceAuthEnvelope = {
          verifiedActorId: ctx.verifiedActorId,
          verifiedActorType: ctx.verifiedActorType,
          verifiedWorkspaceId: ctx.verifiedWorkspaceId,
          verifiedCapabilities: ctx.verifiedCapabilities,
          hasInternalAccess: false,
          verifiedActor: ctx.verifiedActor,
        };
        return createDeliverable(body, authEnvelope);
      },
      body,
      ctx.verifiedActorId
    );

    return Response.json(result, { status: isNew ? 201 : 200 });
  },
  {
    requireCapabilities: [CAPABILITIES.DELIVERABLE_CREATE],
    requireWorkspace: true,
  }
);
