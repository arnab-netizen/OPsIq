import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { hasInternalAccess } from "@/policies/capability-check";
import type { NextRequest } from "next/server";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEngagement, listEngagements } from "@/services/engagement";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { SERVICE_TIERS, ENGAGEMENT_MODES, INTERVENTION_MODES } from "@/domain/constants/statuses";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError, UnauthorizedError, ForbiddenError } from "@/infra/errors";

const createEngagementSchema = z.object({
  title: z.string().min(1),
  clientId: z.string().uuid(),
  serviceTier: z.enum(SERVICE_TIERS),
  engagementMode: z.enum(ENGAGEMENT_MODES),
  interventionMode: z.enum(INTERVENTION_MODES),
  description: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  parentEngagementId: z.string().uuid().optional(),
});

const listEngagementsSchema = paginationSchema.extend({
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const params = parseSearchParams(ctx.request?.url || "", listEngagementsSchema);
    const result = await listEngagements(workspaceId, params, ctx.policy ? hasInternalAccess(ctx.policy) : false);

    return Response.json(result);
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("idempotency-key header required");
    }

    // Check capability: create_engagement
    const capabilityCheck = await assertCapability(workspaceId, "create_engagement");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("create_engagement", capabilityCheck.reason || "Plan limit exceeded");
    }

    const body = await parseRequestBody(ctx.request!, createEngagementSchema);

    const auditContext = createServiceCapabilityContext({
      capability: CAPABILITIES.ENGAGEMENT_CREATE,
    });

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createEngagement",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await createEngagement(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result, auditContext, workspaceId);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, auditContext, workspaceId);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
    requireWorkspace: true,
  }
);
