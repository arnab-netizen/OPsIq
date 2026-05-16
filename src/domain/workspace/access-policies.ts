/**
 * Workspace Data Access Policies
 *
 * Enforces scoped data access at query level.
 * Prevents fetch-then-filter vulnerabilities by requiring workspace scope before data access.
 */

import { z } from "zod";

/**
 * Data access operation types
 */
export enum AccessOperation {
  READ = "read",
  WRITE = "write",
  DELETE = "delete",
  EXPORT = "export",
  ADMIN = "admin",
}

/**
 * Resource types that must be scoped
 */
export enum ResourceType {
  WORKSPACE = "workspace",
  ENGAGEMENT = "engagement",
  ACTION = "action",
  DECISION = "decision",
  RECOMMENDATION = "recommendation",
  EVIDENCE = "evidence",
  EXPERIMENT = "experiment",
  FINDING = "finding",
  OUTCOME = "outcome",
  MEMBER = "member",
}

/**
 * Scoped query contract - every query must have workspace scope
 */
export const ScopedQuerySchema = z.object({
  workspaceId: z.string().uuid("Every query must specify workspace"),
  resourceType: z.nativeEnum(ResourceType),
  operation: z.nativeEnum(AccessOperation),
  actorWorkspaceId: z.string().uuid("Actor must be in requested workspace"),
  requesterId: z.string().uuid(),
});

export type ScopedQuery = z.infer<typeof ScopedQuerySchema>;

/**
 * Query validation result
 */
export interface QueryValidationResult {
  valid: boolean;
  scopeEnforced: boolean;
  workspaceMatches: boolean;
  operationAllowed: boolean;
  reason?: string;
}

/**
 * Validate query has proper workspace scope
 */
export function validateScopedQuery(
  query: ScopedQuery
): QueryValidationResult {
  // Workspace must match
  if (query.workspaceId !== query.actorWorkspaceId) {
    return {
      valid: false,
      scopeEnforced: false,
      workspaceMatches: false,
      operationAllowed: false,
      reason: "Query workspace does not match actor workspace",
    };
  }

  // Scope must be explicitly declared (no unscoped queries)
  if (!query.workspaceId) {
    return {
      valid: false,
      scopeEnforced: false,
      workspaceMatches: true,
      operationAllowed: false,
      reason: "Query scope is required",
    };
  }

  return {
    valid: true,
    scopeEnforced: true,
    workspaceMatches: true,
    operationAllowed: true,
  };
}

/**
 * Parent-child resource scoping
 * Child resources must be accessed through parent workspace scope
 */
export const ParentChildScopeSchema = z.object({
  parentResourceId: z.string().uuid(),
  parentWorkspaceId: z.string().uuid("Parent must belong to workspace"),
  childResourceId: z.string().uuid(),
  requestedWorkspaceId: z.string().uuid("Request must match parent workspace"),
});

export type ParentChildScope = z.infer<typeof ParentChildScopeSchema>;

/**
 * Validate parent-child resource access
 */
export function validateParentChildScope(
  scope: ParentChildScope
): {
  valid: boolean;
  reason?: string;
} {
  // Child can only be accessed through correct parent workspace
  if (scope.parentWorkspaceId !== scope.requestedWorkspaceId) {
    return {
      valid: false,
      reason: "Child resource parent workspace does not match request",
    };
  }

  return { valid: true };
}

/**
 * Collection query policy - prevent unscoped collection queries
 */
export const CollectionQueryPolicySchema = z.object({
  collectionType: z.enum([
    "engagements",
    "actions",
    "decisions",
    "recommendations",
    "evidence",
    "experiments",
    "members",
  ]),
  workspaceId: z.string().uuid("Collections must be scoped to workspace"),
  filters: z.record(z.string(), z.unknown()).optional(),
  pagination: z
    .object({
      skip: z.number().int().min(0),
      take: z.number().int().min(1).max(1000),
    })
    .optional(),
});

export type CollectionQueryPolicy = z.infer<typeof CollectionQueryPolicySchema>;

/**
 * Validate collection query enforces workspace scope
 */
export function validateCollectionQuery(
  policy: CollectionQueryPolicy
): {
  valid: boolean;
  scopeRequired: boolean;
  filteringAllowed: boolean;
  reason?: string;
} {
  // Workspace MUST be specified (not optional, not derived)
  if (!policy.workspaceId) {
    return {
      valid: false,
      scopeRequired: true,
      filteringAllowed: false,
      reason: "Workspace scope is required for collection queries",
    };
  }

  // Filters are allowed only in addition to workspace scope
  if (policy.filters && Object.keys(policy.filters).length > 0) {
    // Filters should not include workspace (it's set at scope level)
    const filterKeys = Object.keys(policy.filters);
    if (
      filterKeys.includes("workspaceId") ||
      filterKeys.includes("workspace_id")
    ) {
      return {
        valid: false,
        scopeRequired: true,
        filteringAllowed: true,
        reason: "Workspace scope must be set at query level, not in filters",
      };
    }
  }

  // Pagination must be present for safety
  if (!policy.pagination) {
    return {
      valid: false,
      scopeRequired: true,
      filteringAllowed: true,
      reason: "Pagination required to prevent large unscoped fetches",
    };
  }

  return {
    valid: true,
    scopeRequired: true,
    filteringAllowed: true,
  };
}

/**
 * Bulk operation policy - batch operations must verify workspace scope
 */
export const BulkOperationPolicySchema = z.object({
  workspaceId: z.string().uuid(),
  resourceIds: z.array(z.string().uuid()).min(1),
  operation: z.nativeEnum(AccessOperation),
  verifyBeforeMutation: z.boolean().default(true),
});

export type BulkOperationPolicy = z.infer<typeof BulkOperationPolicySchema>;

/**
 * Validate bulk operation scope
 */
export function validateBulkOperationScope(
  params: {
    policy: BulkOperationPolicy;
    resourceWorkspaceMap: Record<string, string>; // resourceId -> workspaceId
  }
): {
  valid: boolean;
  scopeEnforced: boolean;
  failedResourceIds?: string[];
  reason?: string;
} {
  const failed: string[] = [];

  for (const resourceId of params.policy.resourceIds) {
    const resourceWorkspace = params.resourceWorkspaceMap[resourceId];

    if (resourceWorkspace !== params.policy.workspaceId) {
      failed.push(resourceId);
    }
  }

  if (failed.length > 0) {
    return {
      valid: false,
      scopeEnforced: false,
      failedResourceIds: failed,
      reason: `${failed.length} resource(s) do not belong to workspace`,
    };
  }

  return {
    valid: true,
    scopeEnforced: true,
  };
}

/**
 * Data export policy - ensure exports are scoped and redacted
 */
export const DataExportPolicySchema = z.object({
  workspaceId: z.string().uuid("Exports must be workspace-scoped"),
  requesterId: z.string().uuid(),
  exportType: z.enum(["full", "audit", "compliance"]),
  includePersonalData: z.boolean().default(false),
  redactionRules: z
    .array(
      z.object({
        fieldPattern: z.string(),
        redactionStrategy: z.enum(["mask", "hash", "remove"]),
      })
    )
    .optional(),
});

export type DataExportPolicy = z.infer<typeof DataExportPolicySchema>;

/**
 * Validate export policy enforces scope and redaction
 */
export function validateExportPolicy(
  policy: DataExportPolicy
): {
  valid: boolean;
  scopeEnforced: boolean;
  redactionRequired: boolean;
  reason?: string;
} {
  // Workspace scope required
  if (!policy.workspaceId) {
    return {
      valid: false,
      scopeEnforced: false,
      redactionRequired: true,
      reason: "Exports must specify workspace scope",
    };
  }

  // Compliance/Audit exports cannot include personal data unredacted
  if (policy.exportType !== "full" && policy.includePersonalData) {
    return {
      valid: false,
      scopeEnforced: true,
      redactionRequired: true,
      reason: `${policy.exportType} exports must redact personal data`,
    };
  }

  // Redaction rules should be present for non-full exports with personal data included
  if (
    policy.exportType !== "full" &&
    policy.includePersonalData &&
    !policy.redactionRules
  ) {
    return {
      valid: false,
      scopeEnforced: true,
      redactionRequired: true,
      reason: `${policy.exportType} exports require redaction rules`,
    };
  }

  return {
    valid: true,
    scopeEnforced: true,
    redactionRequired: policy.exportType !== "full",
  };
}

/**
 * Admin operation policy - restrict admin actions to specific workspaces
 */
export const AdminOperationPolicySchema = z.object({
  adminId: z.string().uuid(),
  targetWorkspaceId: z.string().uuid("Admin operations are workspace-scoped"),
  operation: z.string(),
  requiresAudit: z.boolean().default(true),
  affectedResourceCount: z.number().int().min(0),
});

export type AdminOperationPolicy = z.infer<typeof AdminOperationPolicySchema>;

/**
 * Validate admin operations are properly scoped
 */
export function validateAdminOperation(
  policy: AdminOperationPolicy
): {
  valid: boolean;
  scopeEnforced: boolean;
  auditEnforced: boolean;
  reason?: string;
} {
  // All admin operations must be workspace-scoped
  if (!policy.targetWorkspaceId) {
    return {
      valid: false,
      scopeEnforced: false,
      auditEnforced: false,
      reason: "Admin operations must target specific workspace",
    };
  }

  // High-impact operations (affecting multiple resources) require audit
  if (policy.affectedResourceCount > 10 && !policy.requiresAudit) {
    return {
      valid: false,
      scopeEnforced: true,
      auditEnforced: false,
      reason: "Bulk admin operations (10+ resources) require audit trail",
    };
  }

  return {
    valid: true,
    scopeEnforced: true,
    auditEnforced: policy.requiresAudit,
  };
}

/**
 * Workspace data isolation audit
 */
export const DataIsolationAuditSchema = z.object({
  auditId: z.string().uuid(),
  timestamp: z.date(),
  workspaceId: z.string().uuid(),
  queryType: z.enum(["scoped", "unscoped", "malformed"]),
  resourcesAccessed: z.number().int().min(0),
  isolationBreachDetected: z.boolean(),
  details: z.string(),
});

export type DataIsolationAudit = z.infer<typeof DataIsolationAuditSchema>;

/**
 * Batch scope validation - detect isolation breaches in operations
 */
export function detectIsolationBreaches(params: {
  workspaceId: string;
  operations: Array<{
    resourceId: string;
    resourceWorkspace: string;
    operation: AccessOperation;
  }>;
}): {
  breachesDetected: boolean;
  breachedOperations: typeof params.operations;
  severity: "none" | "low" | "high" | "critical";
} {
  const breached = params.operations.filter(
    (op) => op.resourceWorkspace !== params.workspaceId
  );

  let severity: "none" | "low" | "high" | "critical" = "none";
  if (breached.length > 0) {
    if (breached.some((op) => op.operation === AccessOperation.DELETE)) {
      severity = "critical";
    } else if (breached.some((op) => op.operation === AccessOperation.WRITE)) {
      severity = "high";
    } else {
      severity = "low";
    }
  }

  return {
    breachesDetected: breached.length > 0,
    breachedOperations: breached,
    severity,
  };
}
