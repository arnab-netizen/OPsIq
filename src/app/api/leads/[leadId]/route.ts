import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getLeadById, updateLead, linkLeadToEngagement } from "@/services/lead";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { LEAD_STATUSES } from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateLeadSchema = z.object({
  companyName: z.string().min(1).optional(),
  contactName: z.string().optional(),
  contactEmail: z.email().optional(),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  estimatedValue: z.number().positive().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: z.string().uuid().optional(),
  version: z.number().int().min(1),
});

const linkLeadSchema = z.object({
  action: z.literal("link_to_engagement"),
  engagementId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const { leadId } = params;
    parseOrThrow(uuidSchema, leadId);

    const lead = await getLeadById(leadId, workspaceId);
    return Response.json(lead);
  },
  { requireWorkspace: true, requireCapabilities: ['LEAD_VIEW'] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { leadId } = params;
    parseOrThrow(uuidSchema, leadId);
    const workspaceId = ctx.verifiedWorkspaceId;

    const body = await parseRequestBody(ctx.request!, updateLeadSchema);
    await updateLead(leadId, body, ctx, workspaceId);

    const updated = await getLeadById(leadId, workspaceId);
    return Response.json(updated);
  },
  {
    requireCapabilities: [CAPABILITIES.LEAD_UPDATE],
    requireWorkspace: true,
  }
);

export const POST = withEnforcementFull(async (request, context, params) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({
    capability: CAPABILITIES.LEAD_UPDATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = ctx.verifiedWorkspaceId;
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

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const { leadId } = params;
  parseOrThrow(uuidSchema, leadId);

  const body = await parseRequestBody(request, linkLeadSchema);

  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "linkLeadToEngagement",
    actorId: session.user.id,
    payload: { leadId, engagementId: body.engagementId, clientId: body.clientId },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    await linkLeadToEngagement(
      leadId,
      body.engagementId,
      body.clientId,
      session.user.id,
      workspaceId
    );

    const updated = await getLeadById(leadId, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 200, updated);
    return Response.json(updated);
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
