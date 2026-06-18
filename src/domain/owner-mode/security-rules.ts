/**
 * Security rules for Owner Mode domain operations.
 * Enforces workspace scoping on all queries and mutations.
 */

export interface WorkspaceScopedQuery {
  workspaceId: string;
}

/**
 * Asserts that a query is properly scoped to a workspace.
 * Throws if workspaceId is missing or empty.
 */
export function assertWorkspaceScopedQuery(query: WorkspaceScopedQuery): void {
  if (!query.workspaceId || query.workspaceId.trim() === "") {
    throw new Error(
      "WorkspaceScopedQuery violation: workspaceId is required and must not be empty"
    );
  }
}
