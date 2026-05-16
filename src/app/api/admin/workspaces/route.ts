/**
 * GET /api/admin/workspaces
 *
 * List all workspaces.
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 */

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

interface AdminWorkspace {
  id: string;
  name: string;
  slug?: string;
  createdAt?: string;
  memberCount: number;
}

export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // Parse query parameters
    const url = new URL(ctx.request!.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const cursor = url.searchParams.get("cursor") || undefined;

    // TODO: Query from database via Prisma
    // For now, return empty list (will be populated in CI verification via DB)
    const workspaces: AdminWorkspace[] = [];

    return {
      workspaces,
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
