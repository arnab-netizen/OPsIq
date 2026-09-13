/**
 * GET /api/admin/beta-requests
 *
 * List controlled-beta homepage capture requests (read-only admin
 * operability view). Admin-only endpoint (enforces SYSTEM_ADMIN capability).
 *
 * This is the "HOW_OWNER_REVIEWS_REQUESTS" mechanism for the controlled-beta
 * homepage capture — API-only, mirroring the existing
 * GET /api/admin/workspaces pattern exactly. No new UI dashboard.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listBetaRequestsForAdmin } from "@/services/admin/admin-operability.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");
    const status = url.searchParams.get("status") ?? undefined;

    const result = await listBetaRequestsForAdmin({
      status,
      limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
      cursor,
    });

    return result;
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
  }
);
