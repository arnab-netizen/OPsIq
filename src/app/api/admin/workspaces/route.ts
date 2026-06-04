/**
 * GET /api/admin/workspaces
 *
 * List all workspaces (read-only admin operability view).
 * Admin-only endpoint (enforces SYSTEM_ADMIN capability).
 *
 * Phase D1-A: backed by a real database query via the admin operability
 * service. Returns only safe workspace fields plus active member counts.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listWorkspacesForAdmin } from "@/services/admin/admin-operability.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");

    const result = await listWorkspacesForAdmin({
      limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
      cursor,
    });

    return result;
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
  }
);
