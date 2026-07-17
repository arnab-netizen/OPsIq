/**
 * Workspace Member & Permission Enforcement
 *
 * Service-layer enforcement ensuring workspace membership is validated
 * and role-based capabilities are enforced before any operation.
 * Prevents cross-workspace access and privilege escalation.
 */

import {
  WorkspaceMembership,
  WorkspaceMembershipSchema,
  WorkspaceRole,
  RoleCapabilities,
  canChangeRole,
} from "@/domain/workspace/isolation-contracts";

/**
 * Workspace member not found error
 */
export class WorkspaceMemberNotFoundError extends Error {
  constructor(userId: string, workspaceId: string) {
    super(
      `User ${userId} is not a member of workspace ${workspaceId}`
    );
    this.name = "WorkspaceMemberNotFoundError";
  }
}

/**
 * Insufficient permission error
 */
export class InsufficientPermissionError extends Error {
  constructor(role: WorkspaceRole, capability: string) {
    super(
      `Role ${role} does not have capability ${capability}`
    );
    this.name = "InsufficientPermissionError";
  }
}

/**
 * Privilege escalation prevention error
 */
export class PrivilegeEscalationError extends Error {
  constructor(attemptedRole: WorkspaceRole, actorRole: WorkspaceRole) {
    super(
      `Cannot promote to ${attemptedRole} - current role is ${actorRole}`
    );
    this.name = "PrivilegeEscalationError";
  }
}

/**
 * In-memory workspace member store (for non-DB testing)
 * Maps workspaceId+userId → WorkspaceMembership
 */
const membershipStore = new Map<
  string,
  WorkspaceMembership
>();

/**
 * Mock workspace with hardcoded members for testing
 */
const mockWorkspaceMembers: Record<string, WorkspaceMembership[]> = {
  "ws-123": [
    {
      id: "mem-001",
      workspaceId: "ws-123",
      userId: "user-owner",
      role: WorkspaceRole.OWNER,
      joinedAt: new Date("2026-01-01"),
      invitedBy: null,
      lastActivityAt: new Date("2026-05-12"),
      isActive: true,
    },
    {
      id: "mem-002",
      workspaceId: "ws-123",
      userId: "user-admin",
      role: WorkspaceRole.ADMIN,
      joinedAt: new Date("2026-02-01"),
      invitedBy: "user-owner",
      lastActivityAt: new Date("2026-05-12"),
      isActive: true,
    },
    {
      id: "mem-003",
      workspaceId: "ws-123",
      userId: "user-operator",
      role: WorkspaceRole.OPERATOR,
      joinedAt: new Date("2026-03-01"),
      invitedBy: "user-admin",
      lastActivityAt: new Date("2026-05-12"),
      isActive: true,
    },
    {
      id: "mem-004",
      workspaceId: "ws-123",
      userId: "user-viewer",
      role: WorkspaceRole.VIEWER,
      joinedAt: new Date("2026-04-01"),
      invitedBy: "user-admin",
      lastActivityAt: null,
      isActive: true,
    },
  ],
  "ws-456": [
    {
      id: "mem-005",
      workspaceId: "ws-456",
      userId: "user-owner-2",
      role: WorkspaceRole.OWNER,
      joinedAt: new Date("2026-01-15"),
      invitedBy: null,
      lastActivityAt: new Date("2026-05-12"),
      isActive: true,
    },
  ],
};

/**
 * Get workspace members from store (with mock fallback)
 */
function getWorkspaceMembers(workspaceId: string): WorkspaceMembership[] {
  // First check in-memory store
  const stored = Array.from(membershipStore.values()).filter(
    (m) => m.workspaceId === workspaceId
  );
  if (stored.length > 0) {
    return stored;
  }

  // Fall back to mock data
  return mockWorkspaceMembers[workspaceId] || [];
}

/**
 * Store a workspace member in in-memory store
 */
function storeMember(membership: WorkspaceMembership): void {
  const key = `${membership.workspaceId}:${membership.userId}`;
  membershipStore.set(key, membership);
}

/**
 * Clear all stored members (for testing)
 */
export function clearMemberStore(): void {
  membershipStore.clear();
}

/**
 * Seed mock members to store
 */
export function seedMockMembers(): void {
  clearMemberStore();
  Object.values(mockWorkspaceMembers).forEach((members) => {
    members.forEach((m) => storeMember(m));
  });
}

/**
 * Get a user's membership in a workspace
 */
export function getMembership(
  workspaceId: string,
  userId: string
): WorkspaceMembership | null {
  const key = `${workspaceId}:${userId}`;
  const stored = membershipStore.get(key);
  if (stored) {
    return stored;
  }

  // Fall back to mock data
  const members = getWorkspaceMembers(workspaceId);
  return members.find((m) => m.userId === userId) || null;
}

/**
 * Require membership in a workspace
 * Throws WorkspaceMemberNotFoundError if user is not a member
 */
export function requireMembership(
  workspaceId: string,
  userId: string
): WorkspaceMembership {
  const membership = getMembership(workspaceId, userId);
  if (!membership || !membership.isActive) {
    throw new WorkspaceMemberNotFoundError(userId, workspaceId);
  }
  return membership;
}

/**
 * Check if user has a specific capability in a workspace
 * Fails closed - returns false on any error
 */
export function hasCapability(
  workspaceId: string,
  userId: string,
  capability: string
): boolean {
  try {
    const membership = requireMembership(workspaceId, userId);
    const capabilities = RoleCapabilities[membership.role];
    return capabilities ? capabilities.has(capability) : false;
  } catch {
    return false;
  }
}

/**
 * Require a specific capability in a workspace
 * Throws InsufficientPermissionError if capability is missing
 */
export function requireCapability(
  workspaceId: string,
  userId: string,
  capability: string
): void {
  const membership = requireMembership(workspaceId, userId);

  if (!hasCapability(workspaceId, userId, capability)) {
    throw new InsufficientPermissionError(membership.role, capability);
  }
}

/**
 * Get all active members of a workspace
 */
export function getWorkspaceMembers_(
  workspaceId: string
): WorkspaceMembership[] {
  return getWorkspaceMembers(workspaceId).filter((m) => m.isActive);
}

/**
 * Add or update a workspace member
 */
export function addMember(membership: WorkspaceMembership): void {
  // Validate membership schema
  const parsed = WorkspaceMembershipSchema.safeParse(membership);
  if (!parsed.success) {
    throw new Error(`Invalid membership: ${parsed.error.message}`);
  }

  storeMember(parsed.data);
}

/**
 * Remove a member from a workspace
 */
export function removeMember(
  workspaceId: string,
  userId: string
): void {
  const key = `${workspaceId}:${userId}`;
  membershipStore.delete(key);
}

/**
 * Update a member's role
 * Enforces privilege escalation prevention
 */
export function updateMemberRole(
  workspaceId: string,
  memberId: string,
  newRole: WorkspaceRole,
  changedByUserId: string
): WorkspaceMembership {
  // Find the member by ID
  const members = getWorkspaceMembers(workspaceId);
  const memberToUpdate = members.find((m) => m.id === memberId);
  if (!memberToUpdate) {
    throw new Error(`Member ${memberId} not found in workspace ${workspaceId}`);
  }

  // Get the actor's membership
  const actorMembership = requireMembership(workspaceId, changedByUserId);

  // Check if role change is allowed
  const changeResult = canChangeRole({
    workspaceId,
    memberId: memberToUpdate.userId,
    oldRole: memberToUpdate.role,
    newRole,
    changedBy: changedByUserId,
    changedByRole: actorMembership.role,
  });

  if (!changeResult.allowed) {
    throw new PrivilegeEscalationError(newRole, actorMembership.role);
  }

  // Update the member
  const updated: WorkspaceMembership = {
    ...memberToUpdate,
    role: newRole,
  };

  storeMember(updated);
  return updated;
}

/**
 * Deactivate a member without deleting
 */
export function deactivateMember(
  workspaceId: string,
  userId: string
): WorkspaceMembership {
  const membership = requireMembership(workspaceId, userId);

  const deactivated: WorkspaceMembership = {
    ...membership,
    isActive: false,
  };

  storeMember(deactivated);
  return deactivated;
}

/**
 * Reactivate a member
 */
export function reactivateMember(
  workspaceId: string,
  userId: string
): WorkspaceMembership {
  const membership = getMembership(workspaceId, userId);
  if (!membership) {
    throw new WorkspaceMemberNotFoundError(userId, workspaceId);
  }

  const reactivated: WorkspaceMembership = {
    ...membership,
    isActive: true,
    lastActivityAt: new Date(),
  };

  storeMember(reactivated);
  return reactivated;
}

/**
 * Check multiple capabilities at once
 */
export function hasAllCapabilities(
  workspaceId: string,
  userId: string,
  capabilities: string[]
): boolean {
  return capabilities.every((cap) =>
    hasCapability(workspaceId, userId, cap)
  );
}

/**
 * Check if user has ANY of the specified capabilities
 */
export function hasAnyCapability(
  workspaceId: string,
  userId: string,
  capabilities: string[]
): boolean {
  return capabilities.some((cap) =>
    hasCapability(workspaceId, userId, cap)
  );
}

/**
 * Get user's role in a workspace
 */
export function getUserRole(
  workspaceId: string,
  userId: string
): WorkspaceRole | null {
  const membership = getMembership(workspaceId, userId);
  return membership ? membership.role : null;
}

/**
 * Check if user is in a management role (owner or admin)
 */
export function isManagementRole(
  workspaceId: string,
  userId: string
): boolean {
  const role = getUserRole(workspaceId, userId);
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

/**
 * Check if user is workspace owner
 */
export function isOwner(workspaceId: string, userId: string): boolean {
  const role = getUserRole(workspaceId, userId);
  return role === WorkspaceRole.OWNER;
}

/**
 * Update member's last activity timestamp
 */
export function updateLastActivity(
  workspaceId: string,
  userId: string
): WorkspaceMembership {
  const membership = requireMembership(workspaceId, userId);

  const updated: WorkspaceMembership = {
    ...membership,
    lastActivityAt: new Date(),
  };

  storeMember(updated);
  return updated;
}
