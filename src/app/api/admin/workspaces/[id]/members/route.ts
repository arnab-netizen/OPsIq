/**
 * GET /api/admin/workspaces/[id]/members
 *
 * List the active members of a workspace (read-only admin operability view).
 * Admin-only endpoint (enforces SYSTEM_ADMIN capability).
 *
 * Phase D1-B: backed by a real database query via the admin operability
 * service. Returns only safe member identity fields (no secrets/tokens).
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { listWorkspaceMembersForAdmin } from "@/services/admin/admin-operability.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = params.id;
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");
    const cursor = url.searchParams.get("cursor");

    const result = await listWorkspaceMembersForAdmin(workspaceId, {
      limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
      cursor,
    });

    return result;
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
  }
);
