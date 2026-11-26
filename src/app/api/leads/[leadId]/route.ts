import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, ValidationError } from "@/infra/errors";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getLeadById, updateLead, linkLeadToEngagement } from "@/services/lead";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { LEAD_STATUSES } from "@/domain/constants/statuses";

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
    return lead;
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.LEAD_VIEW] }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { leadId } = params;
    parseOrThrow(uuidSchema, leadId);
    const workspaceId = ctx.verifiedWorkspaceId;

    const body = await parseRequestBody(ctx.request!, updateLeadSchema);
    await updateLead(leadId, body, ctx, workspaceId);

    const updated = await getLeadById(leadId, workspaceId);
    return updated;
  },
  {
    requireCapabilities: [CAPABILITIES.LEAD_UPDATE],
    requireWorkspace: true,
  }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }

    const workspaceId = ctx.verifiedWorkspaceId;
    const { leadId } = params;
    parseOrThrow(uuidSchema, leadId);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, linkLeadSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "linkLeadToEngagement",
      actorId: ctx.verifiedActorId,
      payload: { leadId, engagementId: body.engagementId, clientId: body.clientId },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      await linkLeadToEngagement(
        leadId,
        body.engagementId,
        body.clientId,
        ctx.verifiedActorId,
        workspaceId
      );

      const updated = await getLeadById(leadId, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 200, updated);
      return updated;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.LEAD_UPDATE],
    requireWorkspace: true,
  }
);
