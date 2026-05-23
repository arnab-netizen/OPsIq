import { Prisma } from "@/generated/prisma/client";

/**
 * Models that belong to a workspace and MUST be scoped by workspaceId.
 * All other models are treated as global/system models and don't require scoping.
 */
const WORKSPACE_OWNED_MODELS = new Set([
  "operatorItem", // decisions
  "alert",
  "engagement",
  "clientAccount",
  "lead",
  "user", // workspace members
  "workspaceMembership",
  "evidence",
  "finding",
  "recommendation",
  "action",
  "actionLifecycle",
  "deliverable",
  "engagementMembership",
  "businessConditionProfile",
  "interventionState",
  "decisionLifecycle",
  "auditEvent", // audit events are workspace-scoped
  "learningRecord",
  "businessImpact",
  "executionDrift",
  "decisionConfidence",
  "decisionControl",
  "decisionEvidence",
  "executionCertainty",
  "kpi",
  "outcome",
  "shock",
  "shockEvent",
  "thresholdAlert",
  "override",
  "clientContact",
  "businessCondition",
  "stage",
  "reviewCycle",
  "roleAssignment",
  "reEvaluation",
  "interventionDesign",
  "scenario",
  "constraint",
  "reportGeneration",
]);

/**
 * Global models that do NOT require workspaceId scoping.
 * These are system-wide configuration or reference data.
 */
const GLOBAL_MODELS = new Set([
  "workspace",
  "workspaceRole",
  "auditEventType",
  "capability",
  "problem",
  "intervention",
  "businessIntervention",
  "metrics",
  "systemConfig",
  "idempotencyKey",
  "session",
  "token",
  // Add any other truly global models
]);

interface QueryContext {
  workspaceId?: string;
}

/**
 * Enforce workspace isolation on all queries.
 * Strategy:
 * 1. BLOCK: All write operations (create, update, delete) on workspace models without workspaceId
 * 2. BLOCK: All write operations with conflicting workspaceId
 * 3. LOG: Unscoped reads (these are potential data leaks but less critical than writes)
 * 4. ALLOW: Global model operations without workspaceId
 */
export function createWorkspaceEnforcementMiddleware() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            const isWorkspaceOwned = WORKSPACE_OWNED_MODELS.has(model as string);
            const isGlobal = GLOBAL_MODELS.has(model as string);

            // Skip enforcement for global models
            if (!isWorkspaceOwned || isGlobal) {
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
function isWorkspaceIdInWhere(where: unknown): boolean {
  if (!where || typeof where !== "object") {
    return false;
  }

  // Direct check
  if ("workspaceId" in where) {
    return true;
  }

  // Check in AND conditions
  if (Array.isArray(where.AND)) {
    return where.AND.some((condition: unknown) => isWorkspaceIdInWhere(condition));
  }

  // Check in OR conditions (should be rare for workspace scoping)
  if (Array.isArray(where.OR)) {
    return where.OR.every((condition: unknown) => isWorkspaceIdInWhere(condition));
  }

  return false;
}

/**
 * Validate that workspaceId is consistent if provided in both where and data
 */
function validateWorkspaceIdConsistency(
  model: string,
  where: unknown,
  data: unknown
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
function extractWorkspaceId(where: unknown): string | null {
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
