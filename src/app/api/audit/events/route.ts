import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { queryAuditEvents, createListResponse, AuditQueryFilter } from "@/lib/response-formatter";

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

export const GET = withRequestContext(async (request) => {
  await withAuth({ capability: CAPABILITIES.SYSTEM_VIEW_AUDIT });

  const params = parseSearchParams(request.url, auditQuerySchema);
  const { events, total } = await queryAuditEvents(params as AuditQueryFilter);

  const limit = Math.min(params.limit || 50, 200);
  const offset = params.offset || 0;

  const response = createListResponse(events, limit, offset, total);

  return Response.json(response);
});
