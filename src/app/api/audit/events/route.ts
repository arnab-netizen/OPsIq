import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { queryAuditEvents, createListResponse, AuditQueryFilter } from "@/lib/response-formatter";
import type { NextRequest } from "next/server";

const auditQuerySchema = z.object({
  engagementId: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  eventName: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = withEnforcementFull(async (request) => {
  await withAuth({ capability: CAPABILITIES.SYSTEM_VIEW_AUDIT, internalOnly: true });

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

  const params = parseSearchParams(request.url, auditQuerySchema);
  const { events, total } = await queryAuditEvents({ ...params, workspaceId } as AuditQueryFilter & { workspaceId: string });

  const limit = Math.min(params.limit || 50, 200);
  const offset = params.offset || 0;

  const response = createListResponse(events, limit, offset, total);

  return Response.json(response);
});
