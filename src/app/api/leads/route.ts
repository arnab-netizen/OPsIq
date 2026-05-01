import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createLead, listLeads } from "@/services/lead";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

const createLeadSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1).optional(),
  contactEmail: z.email().optional(),
  contactPhone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  estimatedValue: z.number().positive().optional(),
  assignedTo: z.string().uuid().optional(),
});

const listLeadsSchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
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

  const params = parseSearchParams(nextRequest.url, listLeadsSchema);
  const result = await listLeads(workspaceId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  const { session } = await withAuth({
    capability: CAPABILITIES.LEAD_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createLeadSchema);
  const result = await createLead(body, session.user.id, workspaceId);

  return Response.json(result, { status: 201 });
});
