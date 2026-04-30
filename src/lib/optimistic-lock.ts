import { OptimisticLockError } from "@/infra/errors";
import { db } from "@/lib/db";

/**
 * Performs an optimistic-lock-protected update on any Prisma model that
 * has an integer `version` field. The caller provides the entity type,
 * entity id, and the expected version. If the version in the database
 * does not match, an OptimisticLockError is thrown.
 *
 * Usage pattern:
 *   const updated = await optimisticUpdate("user", userId, expectedVersion, (tx) =>
 *     tx.user.update({
 *       where: { id: userId, version: expectedVersion },
 *       data: { ...changes, version: { increment: 1 } },
 *     })
 *   );
 *
 * The wrapper validates the result and throws if the update affected 0 rows
 * due to a version mismatch (Prisma throws P2025 for missing record).
 */
export async function optimisticUpdate<T>(
  entityType: string,
  entityId: string,
  expectedVersion: number,
  updateFn: (tx: typeof db) => Promise<T>
): Promise<T> {
  try {
    return await updateFn(db);
  } catch (error: unknown) {
    // Prisma P2025: "An operation failed because it depends on one or more
    // records that were required but not found." This occurs when
    // the where clause includes version and it doesn't match.
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      throw new OptimisticLockError(entityType, entityId);
    }
    throw error;
  }
}

/**
 * Helper to build the standard versioned update data shape.
 * Merges the caller's data with version increment.
 */
export function withVersionIncrement<T extends Record<string, unknown>>(
  data: T
): T & { version: { increment: number } } {
  return {
    ...data,
    version: { increment: 1 },
  };
}

/**
 * Helper to build the standard versioned where clause.
 */
export function withVersionCheck<T extends { id: string }>(
  where: T,
  expectedVersion: number
): T & { version: number } {
  return {
    ...where,
    version: expectedVersion,
  };
}
