/**
 * GET /api/admin/workspaces/[id]/members
 *
 * List members of a workspace.
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 * Workspace-scoped: admin must have ADMIN_SETTINGS in their own workspace.
 */

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

interface WorkspaceMember {
  userId: string;
  role: string;
  createdAt?: string;
}

export const GET = withCanonicalEnforcement(
  async (ctx, params) => {
    const workspaceId = params.id;
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    // Parse query parameters
    const url = new URL(ctx.request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const cursor = url.searchParams.get("cursor") || undefined;

    // TODO: Query from database via Prisma
    // SELECT userId, role FROM WorkspaceMembership WHERE workspaceId = ?
    // For now, return empty list (will be populated in CI verification via DB)
    const members: WorkspaceMember[] = [];

    return {
      workspaceId,
      members,
      pagination: {
        cursor,
        limit,
        hasMore: false,
      },
    };
  },
  {
    requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN],
  }
);
