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

/**
 * Check if user can act on a specific decision
 * - User must be assigned to the decision, OR
 * - User must be admin (can act on any decision)
 */
export function canActOnDecision(
  userId: string,
  role: string,
  decision: any
): boolean {
  // Admin can act on any decision
  if (role === "admin") return true;

  // Other users must be assigned to the decision
  if (decision.assignedTo === userId) return true;

  return false;
}

/**
 * Check if user can override (reviewer required)
 * Only reviewers and admins can override
 */
export function canOverride(role: string, reviewedBy?: string | null): boolean {
  // Admin can always override
  if (role === "admin") return true;

  // Reviewer can override
  if (role === "reviewer") return true;

  return false;
}
