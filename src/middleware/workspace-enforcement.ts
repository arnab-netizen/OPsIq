import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/services/auth";
import { ForbiddenError } from "@/infra/errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enforce workspace scoping for API requests
 * Verifies user is a member of the workspace before allowing access
 */
export async function enforceWorkspaceScoping(
  request: NextRequest,
  workspaceId: string
): Promise<{ userId: string; role: string } | null> {
  try {
    // Validate workspace ID format first
    if (!UUID_REGEX.test(workspaceId)) {
      throw new ForbiddenError("Invalid workspace ID format");
    }

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
    // If it's already a ForbiddenError, rethrow it
    if (error instanceof ForbiddenError) {
      throw error;
    }
    console.error("Workspace enforcement error:", error);
    return null;
  }
}

/**
 * Check if user has permission for an action in workspace
 *
 * Permissions:
 * - operator: create, read (view decisions only)
 * - reviewer: read, approve, reject (cannot override)
 * - admin: all actions including override
 */
export function hasPermission(role: string, action: string): boolean {
  const permissions: Record<string, string[]> = {
    admin: ["create", "read", "update", "delete", "approve", "reject", "override", "evaluate"],
    operator: ["create", "read", "evaluate"],
    reviewer: ["read", "approve", "reject", "evaluate"],
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
 * Check if user can override
 * Only admin can override blocked decisions
 */
export function canOverride(role: string, reviewedBy?: string | null): boolean {
  // Only admin can override
  return role === "admin";
}
