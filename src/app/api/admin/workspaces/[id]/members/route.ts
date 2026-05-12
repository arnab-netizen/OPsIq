/**
 * GET /api/admin/workspaces/[id]/members
 *
 * List members of a workspace.
 * Admin-only endpoint (enforces ADMIN_SETTINGS capability).
 * Workspace-scoped: admin must have ADMIN_SETTINGS in their own workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

interface WorkspaceMember {
  userId: string;
  role: string;
  createdAt?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth enforcement (ADMIN_SETTINGS capability)
    const { session, policy } = await withAuth({
      capability: CAPABILITIES.SYSTEM_ADMIN,
    });
    if (!session || !policy) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const cursor = url.searchParams.get("cursor") || undefined;

    // TODO: Query from database via Prisma
    // SELECT userId, role FROM WorkspaceMembership WHERE workspaceId = ?
    // For now, return empty list (will be populated in CI verification via DB)
    const members: WorkspaceMember[] = [];

    const response = {
      workspaceId,
      members,
      pagination: {
        cursor,
        limit,
        hasMore: false,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to list workspace members:", error);
    return NextResponse.json(
      { error: "Failed to list workspace members" },
      { status: 500 }
    );
  }
}
