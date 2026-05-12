/**
 * GET /api/admin/workspaces
 *
 * List all workspaces.
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { withErrorHandling } from "@/infra/error-handler";
import { CAPABILITIES } from "@/domain/constants/capabilities";

// Mock workspace listing (will be replaced with DB query via CI verification)
interface AdminWorkspace {
  id: string;
  name: string;
  slug?: string;
  createdAt?: string;
  memberCount: number;
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Auth enforcement (ADMIN_SETTINGS capability)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.SYSTEM_ADMIN,
  });
  if (!session || !policy) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse query parameters
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const cursor = url.searchParams.get("cursor") || undefined;

  try {
    // TODO: Query from database via Prisma
    // For now, return empty list (will be populated in CI verification via DB)
    const workspaces: AdminWorkspace[] = [];

    const response = {
      workspaces,
      pagination: {
        cursor,
        limit,
        hasMore: false,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return NextResponse.json(
      { error: "Failed to list workspaces" },
      { status: 500 }
    );
  }
});
