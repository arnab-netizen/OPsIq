import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getLeadById, updateLead, linkLeadToEngagement } from "@/services/lead";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
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

export const GET = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  await withAuth({ capability: CAPABILITIES.LEAD_VIEW, internalOnly: true });

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

  const { leadId } = await context.params;
  parseOrThrow(uuidSchema, leadId);

  const lead = await getLeadById(leadId, workspaceId);
  return Response.json(lead);
});

export const PATCH = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.LEAD_UPDATE,
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
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { leadId } = await context.params;
  parseOrThrow(uuidSchema, leadId);

  const body = await parseRequestBody(request, updateLeadSchema);
  await updateLead(leadId, body, authContext, workspaceId);

  const updated = await getLeadById(leadId, workspaceId);
  return Response.json(updated);
});

export const POST = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({
    capability: CAPABILITIES.LEAD_UPDATE,
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
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { leadId } = await context.params;
  parseOrThrow(uuidSchema, leadId);

  const body = await parseRequestBody(request, linkLeadSchema);
  await linkLeadToEngagement(
    leadId,
    body.engagementId,
    body.clientId,
    session.user.id,
    workspaceId
  );

  const updated = await getLeadById(leadId, workspaceId);
  return Response.json(updated);
});
