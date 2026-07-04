import { Prisma } from "@/generated/prisma/client";

/**
 * DB-level tenant backstop — curated enforced allowlist (GAP-TEN-01).
 *
 * IMPORTANT: Prisma v7 passes `model` here as PascalCase (e.g. "Engagement").
 * A prior version keyed on camelCase, so nothing matched and the backstop was
 * silently inert. This is now an explicit PascalCase ALLOWLIST: enforcement is
 * OFF by default and ON only for models whose EVERY live + test create/read/
 * update/delete path has been individually audited to already carry
 * `workspaceId` (so enabling enforcement cannot break a legitimate path).
 *
 * The dominant repo pattern is verify-then-mutate-by-id (a workspace-scoped
 * `findFirst`, then `update({ where: { id } })`), which is safe at the route/
 * service layer but does NOT carry workspaceId in the Prisma `where`; enforcing
 * such models here would throw on legitimate writes. Signup also creates User/
 * Session/UserRoleAssignment with no workspaceId column. Those models are
 * therefore intentionally EXCLUDED. See
 * docs/full-repo-commercial-audit/TENANT_BACKSTOP_MODEL_CLASSIFICATION.md for
 * the full per-model classification and the exact criteria to add a model here.
 *
 * This backstop is defense-in-depth ONLY — it does not replace the route-level
 * tenant control (withCanonicalEnforcement + ctx.verifiedWorkspaceId +
 * assertEngagementAccess + capability gates), which remains the primary control.
 */
const CANONICAL_ENFORCED_MODELS = new Set<string>([
  "UsageEvent", // entitlement/metering; every live+test create/read/delete carries workspaceId (verified)
  // NOTE: CanonicalEvent was a candidate but is NOT enforced — the event-store
  // ordering/idempotency paths (exercised by phase-3 concurrency proofs) do
  // unscoped count()/findMany() on CanonicalEvent, so enforcement would break
  // them. Tracked as a follow-up in the classification doc (scope those reads
  // first, then add it here).
]);

interface QueryContext {
  workspaceId?: string;
}

/**
 * Enforce workspace isolation for the curated enforced models (allowlist).
 * For an enforced model:
 * 1. BLOCK create/createMany without workspaceId in data.
 * 2. BLOCK update/delete (and *Many) without workspaceId in where, or conflicting workspaceId.
 * 3. BLOCK findFirst/findMany/count/aggregate/groupBy without workspaceId in where.
 * All non-enforced models pass through untouched (route-level control applies).
 */
export function createWorkspaceEnforcementMiddleware() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // Fail-open by default; enforce ONLY curated, per-model-audited models.
            if (!CANONICAL_ENFORCED_MODELS.has(model as string)) {
              return query(args);
            }

            // CRITICAL: Block unsafe writes
            if (
              operation === "update" ||
              operation === "updateMany" ||
              operation === "delete" ||
              operation === "deleteMany"
            ) {
              const where = args.where;
              if (!where) {
                throw new Error(
                  `WORKSPACE ISOLATION VIOLATION: ${operation} on ${model} requires WHERE clause`
                );
              }
              if (!isWorkspaceIdInWhere(where)) {
                throw new Error(
                  `WORKSPACE ISOLATION VIOLATION: ${operation} on ${model} WHERE must include workspaceId`
                );
              }
              // Validate no conflicting workspaceId in data (only for update operations)
              if (
                (operation === "update" || operation === "updateMany") &&
                args.data &&
                typeof args.data === "object" &&
                "workspaceId" in args.data &&
                args.data.workspaceId
              ) {
                const whereWorkspaceId = extractWorkspaceId(where);
                if (
                  whereWorkspaceId &&
                  whereWorkspaceId !== args.data.workspaceId
                ) {
                  throw new Error(
                    `WORKSPACE ISOLATION VIOLATION: Conflicting workspaceId in update on ${model}`
                  );
                }
              }
            }

            // CRITICAL: Block unsafe creates
            if (operation === "create" || operation === "createMany") {
              const data = Array.isArray(args.data) ? args.data : [args.data];
              for (const item of data) {
                if (
                  !item ||
                  typeof item !== "object" ||
                  !("workspaceId" in item) ||
                  !item.workspaceId
                ) {
                  throw new Error(
                    `WORKSPACE ISOLATION VIOLATION: create ${model} requires workspaceId in data`
                  );
                }
              }
            }

            // CRITICAL: BLOCK unscoped reads (fail-closed - no exceptions)
            if (
              operation === "findFirst" ||
              operation === "findMany" ||
              operation === "count" ||
              operation === "aggregate" ||
              operation === "groupBy"
            ) {
              const where = args.where;
              if (!isWorkspaceIdInWhere(where)) {
                throw new Error(
                  `WORKSPACE ISOLATION VIOLATION: ${operation} on ${model} requires workspaceId in WHERE clause. ` +
                  `This is a CRITICAL security violation. The query has been BLOCKED.`
                );
              }
            }

            // Execute the actual query
            return query(args);
          },
        },
      },
    })
  );
}

/**
 * Check if workspaceId is present in a WHERE clause
 */
function isWorkspaceIdInWhere(where: any): boolean {
  if (!where || typeof where !== "object") {
    return false;
  }

  // Direct check
  if ("workspaceId" in where) {
    return true;
  }

  // Check in AND conditions
  if (Array.isArray(where.AND)) {
    return where.AND.some((condition: any) => isWorkspaceIdInWhere(condition));
  }

  // Check in OR conditions (should be rare for workspace scoping)
  if (Array.isArray(where.OR)) {
    return where.OR.every((condition: any) => isWorkspaceIdInWhere(condition));
  }

  return false;
}

/**
 * Validate that workspaceId is consistent if provided in both where and data
 */
function validateWorkspaceIdConsistency(
  model: string,
  where: any,
  data: any
): void {
  const whereWorkspaceId = extractWorkspaceId(where);
  const dataWorkspaceId = data?.workspaceId;

  if (
    whereWorkspaceId &&
    dataWorkspaceId &&
    whereWorkspaceId !== dataWorkspaceId
  ) {
    throw new Error(
      `Workspace isolation error: workspaceId mismatch on ${model}. WHERE has ${whereWorkspaceId}, data has ${dataWorkspaceId}`
    );
  }
}

/**
 * Extract workspaceId from a WHERE clause
 */
function extractWorkspaceId(where: any): string | null {
  if (!where || typeof where !== "object") {
    return null;
  }

  if ("workspaceId" in where) {
    const id = where.workspaceId;
    if (typeof id === "string") return id;
    if (id && typeof id === "object" && "equals" in id) return id.equals;
  }

  // Check in AND conditions
  if (Array.isArray(where.AND)) {
    for (const condition of where.AND) {
      const id = extractWorkspaceId(condition);
      if (id) return id;
    }
  }

  return null;
}
