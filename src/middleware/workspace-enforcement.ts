import { NextRequest } from "next/server";
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

    // Verify workspace exists. Narrow select to the sole field consumed (`isActive`): a bare/default
    // select reads every workspaces column and 500s under production schema drift (a newer nullable
    // column missing from the deployed DB). Narrowing is drift-safe and behavior-preserving.
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { isActive: true },
    });

    if (!workspace || !workspace.isActive) {
      return null;
    }

    // Verify user is active member of workspace. Narrow select to only the consumed fields
    // (`role`, `isActive`) for the same drift-safety reason.
    const membership = await db.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.user.id,
        },
      },
      select: { role: true, isActive: true },
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
 * - operator: create, read, evaluate, execute, record_outcome, fail_decision
 * - reviewer: read, approve, reject, evaluate, verify_outcome
 * - admin: all actions including override, execute, record_outcome, fail_decision, verify_outcome
 */
export type WorkspaceAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "override"
  | "evaluate"
  | "execute"
  | "record_outcome"
  | "fail_decision"
  | "verify_outcome";

export function hasPermission(role: string, action: WorkspaceAction): boolean {
  const permissions: Record<string, WorkspaceAction[]> = {
    admin: ["create", "read", "update", "delete", "approve", "reject", "override", "evaluate", "execute", "record_outcome", "fail_decision", "verify_outcome"],
    operator: ["create", "read", "evaluate", "execute", "record_outcome", "fail_decision"],
    reviewer: ["read", "approve", "reject", "evaluate", "verify_outcome"],
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
