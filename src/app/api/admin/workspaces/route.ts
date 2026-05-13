/**
 * GET /api/admin/workspaces
 *
 * List all workspaces.
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 */

import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

// Mock workspace listing (will be replaced with DB query via CI verification)
interface AdminWorkspace {
  id: string;
  name: string;
  slug?: string;
  createdAt?: string;
  memberCount: number;
}

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Auth enforcement (ADMIN_SETTINGS capability)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.SYSTEM_ADMIN,
  });
  if (!session || !policy) {
    throw new UnauthorizedError("Unauthorized");
  }

  // Parse query parameters
  const url = new URL(request.url);
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
});
