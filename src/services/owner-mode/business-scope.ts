/**
 * Business-scope guard for owner-mode write paths.
 *
 * One owner workspace may hold many businesses. When a business-specific owner-mode row is written
 * (capacity / workload / proof / standing instruction), its `businessId` MUST be validated to belong to
 * the workspace before it is persisted. This guard rejects a cross-workspace `businessId` (so a caller
 * can never attach a row to a business outside its own workspace) and never trusts a raw client-supplied
 * id without this server-side check.
 *
 * Reused by every business-aware owner-mode writer so the validation rule lives in exactly one place.
 */

/** Minimal `OwnerBusiness` lookup surface (DI-friendly; matches the generated Prisma delegate). */
export interface BusinessScopeDb {
  ownerBusiness: {
    findFirst(args: { where: { id: string; workspaceId: string }; select?: { id: true } }): Promise<{ id: string } | null>;
  };
}

/** Thrown when a supplied `businessId` does not belong to the workspace it is being written under. */
export class BusinessScopeError extends Error {
  readonly code = "BUSINESS_SCOPE_VIOLATION";
  constructor(workspaceId: string, businessId: string) {
    super(`Business ${businessId} does not belong to workspace ${workspaceId}; refusing cross-workspace write.`);
    this.name = "BusinessScopeError";
  }
}

/**
 * Assert that `businessId` is a real business inside `workspaceId`. Throws `BusinessScopeError` otherwise.
 * Server-side authority: the business must exist AND be scoped to the workspace — a row from another
 * workspace returns null here and is rejected.
 */
export async function assertBusinessInWorkspace(db: BusinessScopeDb, workspaceId: string, businessId: string): Promise<void> {
  const found = await db.ownerBusiness.findFirst({ where: { id: businessId, workspaceId }, select: { id: true } });
  if (!found) throw new BusinessScopeError(workspaceId, businessId);
}
