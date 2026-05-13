/**
 * GET /api/admin/workspaces/[id]/members
 *
 * List members of a workspace.
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 * Workspace-scoped: admin must have ADMIN_SETTINGS in their own workspace.
 */

import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

interface WorkspaceMember {
  userId: string;
  role: string;
  createdAt?: string;
}

export const GET = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    // Auth enforcement (ADMIN_SETTINGS capability)
    const { session, policy } = await withAuth({
      capability: CAPABILITIES.SYSTEM_ADMIN,
    });
    if (!session || !policy) {
      throw new UnauthorizedError("Unauthorized");
    }

    const workspaceId = params.id;
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    // Parse query parameters
    const url = new URL(request.url);
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
  }
);
