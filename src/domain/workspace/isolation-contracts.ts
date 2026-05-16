/**
 * Workspace Isolation Contracts
 *
 * Defines contracts for non-bypassable SaaS data isolation.
 * Every tenant-owned resource must declare workspace scope.
 * Every operation must validate workspace membership.
 */

import { z } from "zod";

/**
 * Workspace scope validation - every read/write must prove workspace access
 */
export const WorkspaceScopeSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID format").min(1),
  userId: z.string().uuid("Invalid user ID format").min(1),
  requestingWorkspaceId: z.string().uuid("Request workspace must match").optional(),
});

export type WorkspaceScope = z.infer<typeof WorkspaceScopeSchema>;

/**
 * Workspace membership with explicit role
 */
export enum WorkspaceRole {
  OWNER = "owner",
  ADMIN = "admin",
  OPERATOR = "operator",
  VIEWER = "viewer",
}

export const WorkspaceMembershipSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid("Every member belongs to exactly one workspace"),
  userId: z.string().uuid(),
  role: z.nativeEnum(WorkspaceRole),
  joinedAt: z.date(),
  invitedBy: z.string().uuid().nullable(),
  lastActivityAt: z.date().nullable(),
  isActive: z.boolean(),
});

export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>;

/**
 * Role-based capability matrix
 */
export const RoleCapabilities: Record<WorkspaceRole, Set<string>> = {
  [WorkspaceRole.OWNER]: new Set([
    "workspace:create",
    "workspace:read",
    "workspace:update",
    "workspace:delete",
    "workspace:invite",
    "workspace:remove_member",
    "workspace:change_role",
    "workspace:settings",
    "engagement:create",
    "engagement:read",
    "engagement:update",
    "engagement:delete",
    "action:create",
    "action:read",
    "action:update",
    "action:delete",
    "decision:create",
    "decision:read",
    "decision:update",
    "decision:delete",
    "recommendation:read",
    "audit:read",
    "billing:view",
    "billing:manage",
  ]),
  [WorkspaceRole.ADMIN]: new Set([
    "workspace:read",
    "workspace:update",
    "workspace:invite",
    "workspace:remove_member",
    "workspace:change_role",
    "engagement:create",
    "engagement:read",
    "engagement:update",
    "engagement:delete",
    "action:create",
    "action:read",
    "action:update",
    "action:delete",
    "decision:create",
    "decision:read",
    "decision:update",
    "decision:delete",
    "recommendation:read",
    "audit:read",
    "billing:view",
  ]),
  [WorkspaceRole.OPERATOR]: new Set([
    "workspace:read",
    "engagement:create",
    "engagement:read",
    "engagement:update",
    "action:create",
    "action:read",
    "action:update",
    "decision:create",
    "decision:read",
    "decision:update",
    "recommendation:read",
  ]),
  [WorkspaceRole.VIEWER]: new Set([
    "workspace:read",
    "engagement:read",
    "action:read",
    "decision:read",
    "recommendation:read",
  ]),
};

/**
 * Access control contract - validates every operation
 */
export const AccessControlCheckSchema = z.object({
  requiredWorkspaceId: z.string().uuid(),
  actorWorkspaceId: z.string().uuid(),
  actorRole: z.nativeEnum(WorkspaceRole),
  requiredCapability: z.string(),
});

export type AccessControlCheck = z.infer<typeof AccessControlCheckSchema>;

/**
 * Check if actor has required capability in workspace
 */
export function canActorPerformAction(
  params: AccessControlCheck
): { allowed: boolean; reason?: string } {
  // Workspace must match
  if (params.requiredWorkspaceId !== params.actorWorkspaceId) {
    return {
      allowed: false,
      reason: "Cross-workspace access denied - workspace ID mismatch",
    };
  }

  // Check capability
  const capabilities = RoleCapabilities[params.actorRole];
  if (!capabilities || !capabilities.has(params.requiredCapability)) {
    return {
      allowed: false,
      reason: `Role ${params.actorRole} lacks capability ${params.requiredCapability}`,
    };
  }

  return { allowed: true };
}

/**
 * Child resource isolation - resources scoped by parent workspace
 */
export const ChildResourceIsolationSchema = z.object({
  resourceId: z.string().uuid(),
  parentResourceId: z.string().uuid("Must reference parent resource"),
  workspaceId: z.string().uuid("Isolated by workspace via parent"),
  createdAt: z.date(),
});

export type ChildResourceIsolation = z.infer<
  typeof ChildResourceIsolationSchema
>;

/**
 * Workspace data boundary contract
 */
export const WorkspaceDataBoundarySchema = z.object({
  workspaceId: z.string().uuid(),
  resourceType: z.enum([
    "engagement",
    "action",
    "decision",
    "recommendation",
    "experiment",
    "evidence",
  ]),
  resourceCount: z.number().int().min(0),
  totalSize: z.number().int().min(0),
  lastModified: z.date(),
});

export type WorkspaceDataBoundary = z.infer<
  typeof WorkspaceDataBoundarySchema
>;

/**
 * Validate that resource belongs to workspace before mutation
 */
export function validateWorkspaceBoundary(
  params: {
    resourceWorkspaceId: string;
    requestedWorkspaceId: string;
    resourceType: string;
  }
): { valid: boolean; error?: string } {
  if (params.resourceWorkspaceId !== params.requestedWorkspaceId) {
    return {
      valid: false,
      error: `Cannot mutate ${params.resourceType} from different workspace`,
    };
  }

  return { valid: true };
}

/**
 * Workspace membership change contract - prevent elevation of privilege
 */
export const MembershipChangeSchema = z.object({
  workspaceId: z.string().uuid(),
  memberId: z.string().uuid(),
  oldRole: z.nativeEnum(WorkspaceRole),
  newRole: z.nativeEnum(WorkspaceRole),
  changedBy: z.string().uuid(),
  changedByRole: z.nativeEnum(WorkspaceRole),
  reason: z.string().optional(),
});

export type MembershipChange = z.infer<typeof MembershipChangeSchema>;

/**
 * Validate role change permissions
 */
export function canChangeRole(
  params: MembershipChange
): { allowed: boolean; reason?: string } {
  const changerCapabilities = RoleCapabilities[params.changedByRole];

  // Only OWNER and ADMIN can change roles
  if (
    !changerCapabilities ||
    !changerCapabilities.has("workspace:change_role")
  ) {
    return {
      allowed: false,
      reason: `Role ${params.changedByRole} cannot change workspace roles`,
    };
  }

  // Cannot promote above own role
  const roleHierarchy = {
    [WorkspaceRole.OWNER]: 4,
    [WorkspaceRole.ADMIN]: 3,
    [WorkspaceRole.OPERATOR]: 2,
    [WorkspaceRole.VIEWER]: 1,
  };

  if (
    roleHierarchy[params.newRole] > roleHierarchy[params.changedByRole]
  ) {
    return {
      allowed: false,
      reason: "Cannot promote member above your own role level",
    };
  }

  return { allowed: true };
}

/**
 * Tenant isolation audit contract
 */
export const TenantIsolationAuditSchema = z.object({
  auditId: z.string().uuid(),
  timestamp: z.date(),
  workspaceId: z.string().uuid(),
  checkType: z.enum([
    "workspace_access",
    "membership_verification",
    "data_boundary",
    "capability_check",
  ]),
  result: z.enum(["passed", "failed", "warning"]),
  details: z.string(),
});

export type TenantIsolationAudit = z.infer<typeof TenantIsolationAuditSchema>;

/**
 * Batch isolation validation for critical operations
 */
export function validateBatchIsolation(
  params: {
    workspaceId: string;
    resourceIds: string[];
    membershipMap: Record<string, string>; // resourceId -> workspaceId
  }
): { valid: boolean; failedResourceIds?: string[] } {
  const failed: string[] = [];

  for (const resourceId of params.resourceIds) {
    const resourceWorkspace = params.membershipMap[resourceId];
    if (resourceWorkspace !== params.workspaceId) {
      failed.push(resourceId);
    }
  }

  return {
    valid: failed.length === 0,
    failedResourceIds: failed.length > 0 ? failed : undefined,
  };
}
