import { getSession } from "@/services/auth";
import { UnauthorizedError } from "@/infra/errors";

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
}

/**
 * Get the current workspace context from the session.
 * Fails closed if workspace is not available - returns null instead of defaulting.
 *
 * @returns WorkspaceContext with workspace and user IDs, or null if session unavailable
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  // For now, use userId as a temporary workspace identifier
  // This is a placeholder until proper workspace/multi-tenancy is added to sessions
  // In production, workspace would be stored in session or user record
  const workspaceId = session.user.id; // temporary: use user ID as workspace

  return {
    workspaceId,
    userId: session.user.id,
  };
}

/**
 * Require a valid workspace context - fails closed.
 * Throws UnauthorizedError if workspace context cannot be established.
 *
 * @returns WorkspaceContext with workspace and user IDs
 * @throws UnauthorizedError if workspace context unavailable
 */
export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const context = await getWorkspaceContext();
  if (!context) {
    throw new UnauthorizedError("Workspace context required");
  }
  return context;
}

/**
 * Require a specific workspace ID to match the current context.
 * Prevents cross-workspace access - fails closed.
 *
 * @param requiredWorkspaceId - The workspace ID that must match current context
 * @throws UnauthorizedError if workspace IDs don't match
 */
export async function validateWorkspaceAccess(
  requiredWorkspaceId: string
): Promise<void> {
  const context = await requireWorkspaceContext();
  if (context.workspaceId !== requiredWorkspaceId) {
    throw new UnauthorizedError("Cross-workspace access denied");
  }
}
