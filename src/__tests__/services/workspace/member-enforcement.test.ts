/**
 * Tests: Workspace Member & Permission Enforcement
 *
 * Validates workspace membership validation, role-based access control,
 * capability checking, privilege escalation prevention, and member management.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  WorkspaceRole,
  RoleCapabilities,
} from "@/domain/workspace/isolation-contracts";
import {
  getMembership,
  requireMembership,
  hasCapability,
  requireCapability,
  getWorkspaceMembers_,
  addMember,
  removeMember,
  updateMemberRole,
  deactivateMember,
  reactivateMember,
  hasAllCapabilities,
  hasAnyCapability,
  getUserRole,
  isManagementRole,
  isOwner,
  updateLastActivity,
  clearMemberStore,
  seedMockMembers,
  WorkspaceMemberNotFoundError,
  InsufficientPermissionError,
  PrivilegeEscalationError,
} from "@/services/workspace/member-enforcement";

describe("Workspace Member & Permission Enforcement", () => {
  beforeEach(() => {
    clearMemberStore();
    seedMockMembers();
  });

  describe("Membership Validation", () => {
    it("should find active member in workspace", () => {
      const membership = getMembership("ws-123", "user-owner");

      expect(membership).toBeDefined();
      expect(membership?.userId).toBe("user-owner");
      expect(membership?.role).toBe(WorkspaceRole.OWNER);
      expect(membership?.isActive).toBe(true);
    });

    it("should return null for non-existent member", () => {
      const membership = getMembership("ws-123", "user-does-not-exist");

      expect(membership).toBeNull();
    });

    it("should return null for member in different workspace", () => {
      const membership = getMembership("ws-456", "user-owner");

      expect(membership).toBeNull();
    });

    it("should require membership and throw for missing member", () => {
      expect(() => {
        requireMembership("ws-123", "user-does-not-exist");
      }).toThrow(WorkspaceMemberNotFoundError);
    });

    it("should require membership and throw for inactive member", () => {
      // Deactivate a member
      deactivateMember("ws-123", "user-viewer");

      expect(() => {
        requireMembership("ws-123", "user-viewer");
      }).toThrow(WorkspaceMemberNotFoundError);
    });

    it("should return membership for active user", () => {
      const membership = requireMembership("ws-123", "user-admin");

      expect(membership.userId).toBe("user-admin");
      expect(membership.role).toBe(WorkspaceRole.ADMIN);
    });
  });

  describe("Capability Checking", () => {
    it("should allow owner to perform admin action", () => {
      const can = hasCapability("ws-123", "user-owner", "workspace:delete");

      expect(can).toBe(true);
    });

    it("should deny viewer from performing admin action", () => {
      const can = hasCapability("ws-123", "user-viewer", "workspace:delete");

      expect(can).toBe(false);
    });

    it("should deny non-member from any capability", () => {
      const can = hasCapability("ws-123", "user-does-not-exist", "engagement:read");

      expect(can).toBe(false);
    });

    it("should allow operator to create engagements", () => {
      const can = hasCapability("ws-123", "user-operator", "engagement:create");

      expect(can).toBe(true);
    });

    it("should deny operator from deleting engagements", () => {
      const can = hasCapability("ws-123", "user-operator", "engagement:delete");

      expect(can).toBe(false);
    });

    it("should allow viewer to read engagements", () => {
      const can = hasCapability("ws-123", "user-viewer", "engagement:read");

      expect(can).toBe(true);
    });

    it("should deny viewer from writing engagements", () => {
      const can = hasCapability("ws-123", "user-viewer", "engagement:update");

      expect(can).toBe(false);
    });

    it("should require capability and throw on insufficient permission", () => {
      expect(() => {
        requireCapability("ws-123", "user-viewer", "workspace:delete");
      }).toThrow(InsufficientPermissionError);
    });

    it("should require capability and not throw on sufficient permission", () => {
      expect(() => {
        requireCapability("ws-123", "user-admin", "engagement:delete");
      }).not.toThrow();
    });

    it("should check all capabilities", () => {
      const has = hasAllCapabilities("ws-123", "user-admin", [
        "engagement:create",
        "engagement:read",
        "engagement:delete",
      ]);

      expect(has).toBe(true);
    });

    it("should fail all capabilities check if one is missing", () => {
      const has = hasAllCapabilities("ws-123", "user-operator", [
        "engagement:create",
        "engagement:read",
        "engagement:delete", // operator cannot delete
      ]);

      expect(has).toBe(false);
    });

    it("should check any capability", () => {
      const has = hasAnyCapability("ws-123", "user-operator", [
        "workspace:delete", // operator cannot delete workspace
        "engagement:create", // operator can create engagement
      ]);

      expect(has).toBe(true);
    });

    it("should fail any capability check if all missing", () => {
      const has = hasAnyCapability("ws-123", "user-viewer", [
        "workspace:delete",
        "workspace:create",
        "engagement:update",
      ]);

      expect(has).toBe(false);
    });
  });

  describe("Role-Based Access Control", () => {
    it("should identify owner role", () => {
      const role = getUserRole("ws-123", "user-owner");

      expect(role).toBe(WorkspaceRole.OWNER);
    });

    it("should identify admin role", () => {
      const role = getUserRole("ws-123", "user-admin");

      expect(role).toBe(WorkspaceRole.ADMIN);
    });

    it("should return null for non-member role", () => {
      const role = getUserRole("ws-123", "user-does-not-exist");

      expect(role).toBeNull();
    });

    it("should detect management role for owner", () => {
      const isManagement = isManagementRole("ws-123", "user-owner");

      expect(isManagement).toBe(true);
    });

    it("should detect management role for admin", () => {
      const isManagement = isManagementRole("ws-123", "user-admin");

      expect(isManagement).toBe(true);
    });

    it("should deny management role for operator", () => {
      const isManagement = isManagementRole("ws-123", "user-operator");

      expect(isManagement).toBe(false);
    });

    it("should deny management role for viewer", () => {
      const isManagement = isManagementRole("ws-123", "user-viewer");

      expect(isManagement).toBe(false);
    });

    it("should detect owner", () => {
      const isOwnr = isOwner("ws-123", "user-owner");

      expect(isOwnr).toBe(true);
    });

    it("should deny owner status for admin", () => {
      const isOwnr = isOwner("ws-123", "user-admin");

      expect(isOwnr).toBe(false);
    });

    it("should deny owner status for non-member", () => {
      const isOwnr = isOwner("ws-123", "user-does-not-exist");

      expect(isOwnr).toBe(false);
    });
  });

  describe("Member Management", () => {
    it("should add a new member to workspace", () => {
      const newMember = {
        id: "550e8400-e29b-41d4-a716-446655440999",
        workspaceId: "550e8400-e29b-41d4-a716-446655440123",
        userId: "550e8400-e29b-41d4-a716-446655440501",
        role: WorkspaceRole.OPERATOR,
        joinedAt: new Date(),
        invitedBy: "550e8400-e29b-41d4-a716-446655440502",
        lastActivityAt: null,
        isActive: true,
      };

      addMember(newMember);

      const retrieved = getMembership(
        "550e8400-e29b-41d4-a716-446655440123",
        "550e8400-e29b-41d4-a716-446655440501"
      );
      expect(retrieved).toBeDefined();
      expect(retrieved?.role).toBe(WorkspaceRole.OPERATOR);
    });

    it("should remove a member from workspace", () => {
      removeMember("ws-123", "user-viewer");

      const membership = getMembership("ws-123", "user-viewer");
      expect(membership).toBeNull();
    });

    it("should get all active members of workspace", () => {
      const members = getWorkspaceMembers_("ws-123");

      expect(members.length).toBeGreaterThan(0);
      expect(members.every((m) => m.isActive)).toBe(true);
    });

    it("should update member's last activity", () => {
      const before = getMembership("ws-123", "user-operator");
      const beforeActivity = before?.lastActivityAt;

      // Wait a bit to ensure timestamp changes
      const updated = updateLastActivity("ws-123", "user-operator");

      expect(updated.lastActivityAt).not.toEqual(beforeActivity);
      expect(updated.lastActivityAt?.getTime()).toBeGreaterThanOrEqual(
        beforeActivity?.getTime() ?? 0
      );
    });

    it("should deactivate a member", () => {
      const deactivated = deactivateMember("ws-123", "user-viewer");

      expect(deactivated.isActive).toBe(false);

      // Verify membership check fails for deactivated member
      expect(() => {
        requireMembership("ws-123", "user-viewer");
      }).toThrow(WorkspaceMemberNotFoundError);
    });

    it("should reactivate a member", () => {
      deactivateMember("ws-123", "user-viewer");

      const reactivated = reactivateMember("ws-123", "user-viewer");

      expect(reactivated.isActive).toBe(true);
      expect(() => {
        requireMembership("ws-123", "user-viewer");
      }).not.toThrow();
    });
  });

  describe("Role Updates & Privilege Escalation Prevention", () => {
    it("should allow owner to promote admin to owner", () => {
      const updated = updateMemberRole(
        "ws-123",
        "mem-002",
        WorkspaceRole.OWNER,
        "user-owner"
      );

      expect(updated.role).toBe(WorkspaceRole.OWNER);
    });

    it("should allow admin to promote operator to admin", () => {
      const updated = updateMemberRole(
        "ws-123",
        "mem-003",
        WorkspaceRole.ADMIN,
        "user-admin"
      );

      expect(updated.role).toBe(WorkspaceRole.ADMIN);
    });

    it("should deny admin from promoting to owner (escalation)", () => {
      expect(() => {
        updateMemberRole("ws-123", "mem-004", WorkspaceRole.OWNER, "user-admin");
      }).toThrow(PrivilegeEscalationError);
    });

    it("should deny operator from changing any role", () => {
      expect(() => {
        updateMemberRole(
          "ws-123",
          "mem-002",
          WorkspaceRole.VIEWER,
          "user-operator"
        );
      }).toThrow();
    });

    it("should deny viewer from changing any role", () => {
      expect(() => {
        updateMemberRole(
          "ws-123",
          "mem-001",
          WorkspaceRole.VIEWER,
          "user-viewer"
        );
      }).toThrow();
    });

    it("should allow owner to demote admin to operator", () => {
      const updated = updateMemberRole(
        "ws-123",
        "mem-002",
        WorkspaceRole.OPERATOR,
        "user-owner"
      );

      expect(updated.role).toBe(WorkspaceRole.OPERATOR);
    });

    it("should allow admin to demote operator to viewer", () => {
      const updated = updateMemberRole(
        "ws-123",
        "mem-003",
        WorkspaceRole.VIEWER,
        "user-admin"
      );

      expect(updated.role).toBe(WorkspaceRole.VIEWER);
    });

    it("should enforce role hierarchy (admin cannot exceed own role)", () => {
      expect(() => {
        updateMemberRole("ws-123", "mem-002", WorkspaceRole.ADMIN, "user-admin");
      }).not.toThrow(); // admin can set others to admin or below
    });
  });

  describe("Workspace Isolation", () => {
    it("should prevent cross-workspace membership lookup", () => {
      const membership = getMembership("ws-456", "user-owner");

      expect(membership).toBeNull();
    });

    it("should prevent cross-workspace capability check", () => {
      const can = hasCapability("ws-456", "user-owner", "engagement:read");

      expect(can).toBe(false);
    });

    it("should prevent cross-workspace membership requirement", () => {
      expect(() => {
        requireMembership("ws-456", "user-owner");
      }).toThrow(WorkspaceMemberNotFoundError);
    });

    it("should isolate separate workspaces with different members", () => {
      const ws123Members = getWorkspaceMembers_("ws-123");
      const ws456Members = getWorkspaceMembers_("ws-456");

      expect(ws123Members.length).toBeGreaterThan(0);
      expect(ws456Members.length).toBeGreaterThan(0);
      expect(ws123Members).not.toEqual(ws456Members);
    });

    it("should prevent capability check in wrong workspace", () => {
      const can = hasCapability("ws-123", "user-owner-2", "engagement:read");

      expect(can).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty workspace membership list", () => {
      const members = getWorkspaceMembers_("ws-999");

      expect(members).toEqual([]);
    });

    it("should handle capability check for deactivated member", () => {
      deactivateMember("ws-123", "user-operator");

      const can = hasCapability("ws-123", "user-operator", "engagement:create");

      expect(can).toBe(false);
    });

    it("should handle role update for non-existent member", () => {
      expect(() => {
        updateMemberRole(
          "ws-123",
          "mem-does-not-exist",
          WorkspaceRole.ADMIN,
          "user-owner"
        );
      }).toThrow();
    });

    it("should handle reactivation of member with updated activity timestamp", () => {
      deactivateMember("ws-123", "user-viewer");
      const reactivated = reactivateMember("ws-123", "user-viewer");

      expect(reactivated.isActive).toBe(true);
      expect(reactivated.lastActivityAt).toBeDefined();
      expect(reactivated.lastActivityAt?.getTime()).toBeGreaterThan(0);
    });

    it("should verify capability determinism (same input = same output)", () => {
      const can1 = hasCapability("ws-123", "user-admin", "engagement:create");
      const can2 = hasCapability("ws-123", "user-admin", "engagement:create");

      expect(can1).toBe(can2);
    });

    it("should handle members with various UUID formats", () => {
      const newMember = {
        id: "550e8400-e29b-41d4-a716-446655440888",
        workspaceId: "550e8400-e29b-41d4-a716-446655440123",
        userId: "550e8400-e29b-41d4-a716-446655440777",
        role: WorkspaceRole.OPERATOR,
        joinedAt: new Date(),
        invitedBy: null,
        lastActivityAt: null,
        isActive: true,
      };

      addMember(newMember);

      const retrieved = getMembership(
        "550e8400-e29b-41d4-a716-446655440123",
        "550e8400-e29b-41d4-a716-446655440777"
      );
      expect(retrieved).toBeDefined();
      expect(retrieved?.userId).toBe("550e8400-e29b-41d4-a716-446655440777");
    });

    it("should handle large workspace membership lists", () => {
      const workspaceId = "550e8400-e29b-41d4-a716-446655440999";
      // Add many members to a workspace
      for (let i = 0; i < 100; i++) {
        addMember({
          id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, "0")}`,
          workspaceId,
          userId: `550e8400-e29b-41d4-a716-44665545${String(i).padStart(4, "0")}`,
          role: WorkspaceRole.OPERATOR,
          joinedAt: new Date(),
          invitedBy: null,
          lastActivityAt: null,
          isActive: true,
        });
      }

      const members = getWorkspaceMembers_(workspaceId);

      expect(members.length).toBe(100);
    });

    it("should maintain capability matrix consistency across all roles", () => {
      // Verify all roles have their expected capability counts
      const ownerCaps = RoleCapabilities[WorkspaceRole.OWNER];
      const adminCaps = RoleCapabilities[WorkspaceRole.ADMIN];
      const operatorCaps = RoleCapabilities[WorkspaceRole.OPERATOR];
      const viewerCaps = RoleCapabilities[WorkspaceRole.VIEWER];

      expect(ownerCaps?.size).toBeGreaterThan(adminCaps?.size ?? 0);
      expect(adminCaps?.size).toBeGreaterThanOrEqual(operatorCaps?.size ?? 0);
      expect(operatorCaps?.size).toBeGreaterThan(viewerCaps?.size ?? 0);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should model onboarding flow (invite and role assignment)", () => {
      // Add new team member as operator
      const newMember = {
        id: "550e8400-e29b-41d4-a716-446655440666",
        workspaceId: "550e8400-e29b-41d4-a716-446655440123",
        userId: "550e8400-e29b-41d4-a716-446655440555",
        role: WorkspaceRole.OPERATOR,
        joinedAt: new Date(),
        invitedBy: "550e8400-e29b-41d4-a716-446655440502",
        lastActivityAt: null,
        isActive: true,
      };

      addMember(newMember);

      // Verify they can create engagements
      expect(
        hasCapability(
          "550e8400-e29b-41d4-a716-446655440123",
          "550e8400-e29b-41d4-a716-446655440555",
          "engagement:create"
        )
      ).toBe(true);

      // Verify they cannot delete
      expect(
        hasCapability(
          "550e8400-e29b-41d4-a716-446655440123",
          "550e8400-e29b-41d4-a716-446655440555",
          "engagement:delete"
        )
      ).toBe(false);
    });

    it("should model promotion workflow", () => {
      const original = requireMembership("ws-123", "user-operator");
      expect(original.role).toBe(WorkspaceRole.OPERATOR);

      // Promote to admin
      const promoted = updateMemberRole(
        "ws-123",
        original.id,
        WorkspaceRole.ADMIN,
        "user-admin"
      );

      expect(promoted.role).toBe(WorkspaceRole.ADMIN);
      expect(hasCapability("ws-123", "user-operator", "engagement:delete")).toBe(true);
    });

    it("should model off-boarding flow (deactivate then remove)", () => {
      // Deactivate departing team member
      const deactivated = deactivateMember("ws-123", "user-viewer");
      expect(deactivated.isActive).toBe(false);

      // Later, remove completely
      removeMember("ws-123", "user-viewer");

      // Verify member is gone
      const retrieved = getMembership("ws-123", "user-viewer");
      expect(retrieved).toBeNull();
    });

    it("should prevent privilege escalation in multi-step scenario", () => {
      // User tries to escalate themselves
      const operator = requireMembership("ws-123", "user-operator");

      expect(() => {
        updateMemberRole(
          "ws-123",
          operator.id,
          WorkspaceRole.OWNER,
          "user-operator"
        );
      }).toThrow(PrivilegeEscalationError);

      // Verify they're still operator
      expect(getUserRole("ws-123", "user-operator")).toBe(
        WorkspaceRole.OPERATOR
      );
    });

    it("should track activity across workspace membership lifecycle", () => {
      let member = requireMembership("ws-123", "user-operator");
      const initialActivity = member.lastActivityAt;

      updateLastActivity("ws-123", "user-operator");
      member = requireMembership("ws-123", "user-operator");

      expect(member.lastActivityAt).not.toEqual(initialActivity);
    });
  });
});
