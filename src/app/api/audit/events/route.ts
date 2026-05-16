import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
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

export const GET = withCanonicalEnforcement(
  async (ctx) => {
    const params = parseSearchParams(ctx.request!.url, auditQuerySchema);
    const { events, total } = await queryAuditEvents({ ...params, workspaceId: ctx.verifiedWorkspaceId } as AuditQueryFilter & { workspaceId: string });

    const limit = Math.min(params.limit || 50, 200);
    const offset = params.offset || 0;

    const response = createListResponse(events, limit, offset, total);

    return response;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.SYSTEM_VIEW_AUDIT],
  }
);
