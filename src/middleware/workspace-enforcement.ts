import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";

/**
 * Enforce workspace scoping for API requests
 * Verifies user is a member of the workspace before allowing access
 */
export async function enforceWorkspaceScoping(
  request: NextRequest,
  workspaceId: string
): Promise<{ userId: string; role: string } | null> {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return null;
    }

    // Verify workspace exists
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.isActive) {
      return null;
    }

    // Verify user is active member of workspace
    const membership = await db.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.user.id,
        },
      },
    });

    if (!membership || !membership.isActive) {
      return null;
    }

    return {
      userId: session.user.id,
      role: membership.role,
    };
  } catch (error) {
    console.error("Workspace enforcement error:", error);
    return null;
  }
}

/**
 * Check if user has permission for an action in workspace
 */
export function hasPermission(role: string, action: string): boolean {
  const permissions: Record<string, string[]> = {
    admin: ["create", "read", "update", "delete", "approve", "reject", "override"],
    operator: ["create", "read", "update"],
    reviewer: ["read", "approve", "reject", "override"],
  };

  return permissions[role]?.includes(action) ?? false;
}
