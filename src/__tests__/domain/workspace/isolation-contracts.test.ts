/**
 * Tests: Workspace Isolation Contracts
 *
 * Validates non-bypassable SaaS data isolation contracts,
 * role-based access control, capability matrices, and tenant safety.
 */

import { describe, it, expect } from "vitest";
import {
  WorkspaceRole,
  RoleCapabilities,
  canActorPerformAction,
  validateWorkspaceBoundary,
  canChangeRole,
  validateBatchIsolation,
  WorkspaceScopeSchema,
  WorkspaceMembershipSchema,
  AccessControlCheckSchema,
  MembershipChangeSchema,
  TenantIsolationAuditSchema,
  ChildResourceIsolationSchema,
  WorkspaceDataBoundarySchema,
} from "@/domain/workspace/isolation-contracts";

describe("Workspace Isolation Contracts", () => {
  describe("Role Definitions", () => {
    it("should define all workspace roles", () => {
      expect(WorkspaceRole.OWNER).toBe("owner");
      expect(WorkspaceRole.ADMIN).toBe("admin");
      expect(WorkspaceRole.OPERATOR).toBe("operator");
      expect(WorkspaceRole.VIEWER).toBe("viewer");
    });

    it("should have 4 workspace roles", () => {
      const roles = Object.values(WorkspaceRole);
      expect(roles.length).toBe(4);
    });
  });

  describe("Role Capability Matrix", () => {
    it("should define capabilities for OWNER", () => {
      const ownerCaps = RoleCapabilities[WorkspaceRole.OWNER];
      expect(ownerCaps).toBeDefined();
      expect(ownerCaps.size).toBeGreaterThan(0);
      expect(ownerCaps.has("workspace:create")).toBe(true);
      expect(ownerCaps.has("workspace:delete")).toBe(true);
      expect(ownerCaps.has("billing:manage")).toBe(true);
    });

    it("should define capabilities for ADMIN", () => {
      const adminCaps = RoleCapabilities[WorkspaceRole.ADMIN];
      expect(adminCaps).toBeDefined();
      expect(adminCaps.has("workspace:read")).toBe(true);
      expect(adminCaps.has("workspace:update")).toBe(true);
      expect(adminCaps.has("workspace:delete")).toBe(false);
      expect(adminCaps.has("billing:manage")).toBe(false);
    });

    it("should define capabilities for OPERATOR", () => {
      const operatorCaps = RoleCapabilities[WorkspaceRole.OPERATOR];
      expect(operatorCaps).toBeDefined();
      expect(operatorCaps.has("engagement:create")).toBe(true);
      expect(operatorCaps.has("action:update")).toBe(true);
      expect(operatorCaps.has("workspace:update")).toBe(false);
      expect(operatorCaps.has("audit:read")).toBe(false);
    });

    it("should define capabilities for VIEWER", () => {
      const viewerCaps = RoleCapabilities[WorkspaceRole.VIEWER];
      expect(viewerCaps).toBeDefined();
      expect(viewerCaps.has("engagement:read")).toBe(true);
      expect(viewerCaps.has("action:read")).toBe(true);
      expect(viewerCaps.has("engagement:create")).toBe(false);
      expect(viewerCaps.has("engagement:update")).toBe(false);
    });

    it("should enforce capability hierarchy", () => {
      const ownerCaps = RoleCapabilities[WorkspaceRole.OWNER];
      const adminCaps = RoleCapabilities[WorkspaceRole.ADMIN];
      const operatorCaps = RoleCapabilities[WorkspaceRole.OPERATOR];
      const viewerCaps = RoleCapabilities[WorkspaceRole.VIEWER];

      // Owner should have all capabilities that Admin has
      for (const cap of adminCaps) {
        expect(ownerCaps.has(cap)).toBe(true);
      }

      // Admin should have all capabilities that Operator has
      for (const cap of operatorCaps) {
        expect(adminCaps.has(cap)).toBe(true);
      }

      // Operator should have all capabilities that Viewer has
      for (const cap of viewerCaps) {
        expect(operatorCaps.has(cap)).toBe(true);
      }
    });

    it("should have distinct capability sizes by role", () => {
      const ownerSize = RoleCapabilities[WorkspaceRole.OWNER].size;
      const adminSize = RoleCapabilities[WorkspaceRole.ADMIN].size;
      const operatorSize = RoleCapabilities[WorkspaceRole.OPERATOR].size;
      const viewerSize = RoleCapabilities[WorkspaceRole.VIEWER].size;

      expect(ownerSize).toBeGreaterThan(adminSize);
      expect(adminSize).toBeGreaterThan(operatorSize);
      expect(operatorSize).toBeGreaterThan(viewerSize);
    });
  });

  describe("Access Control Checks", () => {
    it("should allow OWNER to perform any capability", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "ws-123",
        actorWorkspaceId: "ws-123",
        actorRole: WorkspaceRole.OWNER,
        requiredCapability: "billing:manage",
      });
      expect(result.allowed).toBe(true);
    });

    it("should allow ADMIN to read audit logs", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "ws-123",
        actorWorkspaceId: "ws-123",
        actorRole: WorkspaceRole.ADMIN,
        requiredCapability: "audit:read",
      });
      expect(result.allowed).toBe(true);
    });

    it("should deny OPERATOR from managing billing", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "ws-123",
        actorWorkspaceId: "ws-123",
        actorRole: WorkspaceRole.OPERATOR,
        requiredCapability: "billing:manage",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("lacks capability");
    });

    it("should deny VIEWER from creating engagements", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "ws-123",
        actorWorkspaceId: "ws-123",
        actorRole: WorkspaceRole.VIEWER,
        requiredCapability: "engagement:create",
      });
      expect(result.allowed).toBe(false);
    });

    it("should deny cross-workspace access", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "ws-123",
        actorWorkspaceId: "ws-456",
        actorRole: WorkspaceRole.OWNER,
        requiredCapability: "engagement:read",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Cross-workspace access denied");
    });

    it("should allow OPERATOR to create actions", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "ws-123",
        actorWorkspaceId: "ws-123",
        actorRole: WorkspaceRole.OPERATOR,
        requiredCapability: "action:create",
      });
      expect(result.allowed).toBe(true);
    });

    it("should deny mismatched workspaces even for OWNERs", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "different-workspace",
        actorWorkspaceId: "my-workspace",
        actorRole: WorkspaceRole.OWNER,
        requiredCapability: "workspace:delete",
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe("Workspace Boundary Validation", () => {
    it("should allow mutation of resource in same workspace", () => {
      const result = validateWorkspaceBoundary({
        resourceWorkspaceId: "ws-123",
        requestedWorkspaceId: "ws-123",
        resourceType: "engagement",
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should deny mutation of resource from different workspace", () => {
      const result = validateWorkspaceBoundary({
        resourceWorkspaceId: "ws-123",
        requestedWorkspaceId: "ws-456",
        resourceType: "action",
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Cannot mutate action from different workspace");
    });

    it("should prevent cross-workspace engagement updates", () => {
      const result = validateWorkspaceBoundary({
        resourceWorkspaceId: "tenant-a",
        requestedWorkspaceId: "tenant-b",
        resourceType: "engagement",
      });
      expect(result.valid).toBe(false);
    });

    it("should prevent cross-workspace decision updates", () => {
      const result = validateWorkspaceBoundary({
        resourceWorkspaceId: "workspace-x",
        requestedWorkspaceId: "workspace-y",
        resourceType: "decision",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("Role Change Authorization", () => {
    it("should allow OWNER to promote VIEWER to ADMIN", () => {
      const result = canChangeRole({
        workspaceId: "ws-123",
        memberId: "user-456",
        oldRole: WorkspaceRole.VIEWER,
        newRole: WorkspaceRole.ADMIN,
        changedBy: "user-owner",
        changedByRole: WorkspaceRole.OWNER,
      });
      expect(result.allowed).toBe(true);
    });

    it("should allow ADMIN to promote VIEWER to OPERATOR", () => {
      const result = canChangeRole({
        workspaceId: "ws-123",
        memberId: "user-456",
        oldRole: WorkspaceRole.VIEWER,
        newRole: WorkspaceRole.OPERATOR,
        changedBy: "user-admin",
        changedByRole: WorkspaceRole.ADMIN,
      });
      expect(result.allowed).toBe(true);
    });

    it("should deny OPERATOR from changing roles", () => {
      const result = canChangeRole({
        workspaceId: "ws-123",
        memberId: "user-456",
        oldRole: WorkspaceRole.VIEWER,
        newRole: WorkspaceRole.OPERATOR,
        changedBy: "user-operator",
        changedByRole: WorkspaceRole.OPERATOR,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot change workspace roles");
    });

    it("should deny promotion above changers own role", () => {
      const result = canChangeRole({
        workspaceId: "ws-123",
        memberId: "user-456",
        oldRole: WorkspaceRole.VIEWER,
        newRole: WorkspaceRole.OWNER,
        changedBy: "user-admin",
        changedByRole: WorkspaceRole.ADMIN,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Cannot promote member above your own role level");
    });

    it("should deny ADMIN promoting to OWNER", () => {
      const result = canChangeRole({
        workspaceId: "ws-123",
        memberId: "user-operator",
        oldRole: WorkspaceRole.OPERATOR,
        newRole: WorkspaceRole.OWNER,
        changedBy: "user-admin",
        changedByRole: WorkspaceRole.ADMIN,
      });
      expect(result.allowed).toBe(false);
    });

    it("should allow OWNER to promote OPERATOR to ADMIN", () => {
      const result = canChangeRole({
        workspaceId: "ws-123",
        memberId: "user-operator",
        oldRole: WorkspaceRole.OPERATOR,
        newRole: WorkspaceRole.ADMIN,
        changedBy: "user-owner",
        changedByRole: WorkspaceRole.OWNER,
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("Batch Isolation Validation", () => {
    it("should validate all resources in same workspace", () => {
      const result = validateBatchIsolation({
        workspaceId: "ws-123",
        resourceIds: ["res-1", "res-2", "res-3"],
        membershipMap: {
          "res-1": "ws-123",
          "res-2": "ws-123",
          "res-3": "ws-123",
        },
      });
      expect(result.valid).toBe(true);
      expect(result.failedResourceIds).toBeUndefined();
    });

    it("should detect cross-workspace resources", () => {
      const result = validateBatchIsolation({
        workspaceId: "ws-123",
        resourceIds: ["res-1", "res-2", "res-3"],
        membershipMap: {
          "res-1": "ws-123",
          "res-2": "ws-456",
          "res-3": "ws-123",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.failedResourceIds).toContain("res-2");
      expect(result.failedResourceIds?.length).toBe(1);
    });

    it("should detect multiple cross-workspace resources", () => {
      const result = validateBatchIsolation({
        workspaceId: "ws-123",
        resourceIds: ["res-1", "res-2", "res-3", "res-4"],
        membershipMap: {
          "res-1": "ws-456",
          "res-2": "ws-123",
          "res-3": "ws-789",
          "res-4": "ws-123",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.failedResourceIds).toContain("res-1");
      expect(result.failedResourceIds).toContain("res-3");
      expect(result.failedResourceIds?.length).toBe(2);
    });

    it("should handle empty resource list", () => {
      const result = validateBatchIsolation({
        workspaceId: "ws-123",
        resourceIds: [],
        membershipMap: {},
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("Schema Validation", () => {
    it("should validate workspace scope schema", () => {
      const valid = WorkspaceScopeSchema.safeParse({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "650e8400-e29b-41d4-a716-446655440000",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject invalid workspace ID", () => {
      const invalid = WorkspaceScopeSchema.safeParse({
        workspaceId: "not-a-uuid",
        userId: "650e8400-e29b-41d4-a716-446655440000",
      });
      expect(invalid.success).toBe(false);
    });

    it("should validate workspace membership schema", () => {
      const valid = WorkspaceMembershipSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        workspaceId: "550e8400-e29b-41d4-a716-446655440001",
        userId: "550e8400-e29b-41d4-a716-446655440002",
        role: "admin",
        joinedAt: new Date(),
        invitedBy: null,
        lastActivityAt: new Date(),
        isActive: true,
      });
      expect(valid.success).toBe(true);
    });

    it("should reject invalid role in membership", () => {
      const invalid = WorkspaceMembershipSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        workspaceId: "550e8400-e29b-41d4-a716-446655440001",
        userId: "550e8400-e29b-41d4-a716-446655440002",
        role: "superuser",
        joinedAt: new Date(),
        invitedBy: null,
        lastActivityAt: null,
        isActive: true,
      });
      expect(invalid.success).toBe(false);
    });

    it("should validate access control check schema", () => {
      const valid = AccessControlCheckSchema.safeParse({
        requiredWorkspaceId: "550e8400-e29b-41d4-a716-446655440000",
        actorWorkspaceId: "550e8400-e29b-41d4-a716-446655440001",
        actorRole: "admin",
        requiredCapability: "audit:read",
      });
      expect(valid.success).toBe(true);
    });

    it("should validate membership change schema", () => {
      const valid = MembershipChangeSchema.safeParse({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        memberId: "550e8400-e29b-41d4-a716-446655440001",
        oldRole: "viewer",
        newRole: "operator",
        changedBy: "550e8400-e29b-41d4-a716-446655440002",
        changedByRole: "admin",
        reason: "Promotion for new responsibilities",
      });
      expect(valid.success).toBe(true);
    });

    it("should validate tenant isolation audit schema", () => {
      const valid = TenantIsolationAuditSchema.safeParse({
        auditId: "550e8400-e29b-41d4-a716-446655440000",
        timestamp: new Date(),
        workspaceId: "550e8400-e29b-41d4-a716-446655440001",
        checkType: "workspace_access",
        result: "passed",
        details: "Access control verified",
      });
      expect(valid.success).toBe(true);
    });

    it("should validate child resource isolation schema", () => {
      const valid = ChildResourceIsolationSchema.safeParse({
        resourceId: "550e8400-e29b-41d4-a716-446655440000",
        parentResourceId: "550e8400-e29b-41d4-a716-446655440001",
        workspaceId: "550e8400-e29b-41d4-a716-446655440002",
        createdAt: new Date(),
      });
      expect(valid.success).toBe(true);
    });

    it("should validate workspace data boundary schema", () => {
      const valid = WorkspaceDataBoundarySchema.safeParse({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        resourceType: "engagement",
        resourceCount: 42,
        totalSize: 1024000,
        lastModified: new Date(),
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("Real-World Isolation Scenarios", () => {
    it("should prevent workspace A from accessing workspace B data", () => {
      const actorResult = canActorPerformAction({
        requiredWorkspaceId: "company-a",
        actorWorkspaceId: "company-b",
        actorRole: WorkspaceRole.OWNER,
        requiredCapability: "engagement:read",
      });
      expect(actorResult.allowed).toBe(false);

      const boundaryResult = validateWorkspaceBoundary({
        resourceWorkspaceId: "company-a",
        requestedWorkspaceId: "company-b",
        resourceType: "engagement",
      });
      expect(boundaryResult.valid).toBe(false);
    });

    it("should allow multi-tenant isolation in batch operations", () => {
      const result = validateBatchIsolation({
        workspaceId: "tenant-001",
        resourceIds: ["eng-1", "eng-2", "eng-3", "eng-4", "eng-5"],
        membershipMap: {
          "eng-1": "tenant-001",
          "eng-2": "tenant-001",
          "eng-3": "tenant-001",
          "eng-4": "tenant-001",
          "eng-5": "tenant-001",
        },
      });
      expect(result.valid).toBe(true);
    });

    it("should enforce role-based operations in workspace", () => {
      const allowedOps = [
        { role: WorkspaceRole.OPERATOR, cap: "engagement:create", expected: true },
        { role: WorkspaceRole.OPERATOR, cap: "billing:manage", expected: false },
        { role: WorkspaceRole.ADMIN, cap: "audit:read", expected: true },
        { role: WorkspaceRole.VIEWER, cap: "engagement:read", expected: true },
        { role: WorkspaceRole.VIEWER, cap: "engagement:create", expected: false },
      ];

      for (const op of allowedOps) {
        const result = canActorPerformAction({
          requiredWorkspaceId: "ws-test",
          actorWorkspaceId: "ws-test",
          actorRole: op.role,
          requiredCapability: op.cap,
        });
        expect(result.allowed).toBe(op.expected);
      }
    });

    it("should prevent privilege escalation through role changes", () => {
      const attempts = [
        {
          changerRole: WorkspaceRole.OPERATOR,
          targetRole: WorkspaceRole.ADMIN,
          shouldFail: true,
        },
        {
          changerRole: WorkspaceRole.ADMIN,
          targetRole: WorkspaceRole.OWNER,
          shouldFail: true,
        },
        {
          changerRole: WorkspaceRole.OWNER,
          targetRole: WorkspaceRole.ADMIN,
          shouldFail: false,
        },
      ];

      for (const attempt of attempts) {
        const result = canChangeRole({
          workspaceId: "ws-123",
          memberId: "user-x",
          oldRole: WorkspaceRole.VIEWER,
          newRole: attempt.targetRole,
          changedBy: "user-y",
          changedByRole: attempt.changerRole,
        });

        if (attempt.shouldFail) {
          expect(result.allowed).toBe(false);
        } else {
          expect(result.allowed).toBe(true);
        }
      }
    });
  });

  describe("Capability Determinism", () => {
    it("should return consistent capabilities across multiple calls", () => {
      const ws1 = "workspace-123";
      const user1 = "user-456";
      const role = WorkspaceRole.ADMIN;

      const result1 = canActorPerformAction({
        requiredWorkspaceId: ws1,
        actorWorkspaceId: ws1,
        actorRole: role,
        requiredCapability: "audit:read",
      });

      const result2 = canActorPerformAction({
        requiredWorkspaceId: ws1,
        actorWorkspaceId: ws1,
        actorRole: role,
        requiredCapability: "audit:read",
      });

      expect(result1.allowed).toBe(result2.allowed);
    });

    it("should have deterministic role capabilities", () => {
      const roles = [
        WorkspaceRole.OWNER,
        WorkspaceRole.ADMIN,
        WorkspaceRole.OPERATOR,
        WorkspaceRole.VIEWER,
      ];

      const snapshots: Record<string, number> = {};

      for (let i = 0; i < 2; i++) {
        for (const role of roles) {
          const size = RoleCapabilities[role].size;
          if (snapshots[role]) {
            expect(size).toBe(snapshots[role]);
          } else {
            snapshots[role] = size;
          }
        }
      }
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("should handle empty workspace ID", () => {
      const result = canActorPerformAction({
        requiredWorkspaceId: "",
        actorWorkspaceId: "ws-456",
        actorRole: WorkspaceRole.ADMIN,
        requiredCapability: "engagement:read",
      });
      expect(result.allowed).toBe(false);
    });

    it("should handle special characters in workspace ID", () => {
      const wsId = "550e8400-e29b-41d4-a716-446655440000";
      const result = canActorPerformAction({
        requiredWorkspaceId: wsId,
        actorWorkspaceId: wsId,
        actorRole: WorkspaceRole.OWNER,
        requiredCapability: "workspace:read",
      });
      expect(result.allowed).toBe(true);
    });

    it("should handle large batch isolation checks", () => {
      const resourceIds = Array.from({ length: 1000 }, (_, i) => `res-${i}`);
      const membershipMap = Object.fromEntries(
        resourceIds.map((id) => [id, "ws-123"])
      );

      const result = validateBatchIsolation({
        workspaceId: "ws-123",
        resourceIds,
        membershipMap,
      });
      expect(result.valid).toBe(true);
    });

    it("should detect single isolat resource in large batch", () => {
      const resourceIds = Array.from({ length: 100 }, (_, i) => `res-${i}`);
      const membershipMap: Record<string, string> = {};
      resourceIds.forEach((id) => {
        membershipMap[id] = id === "res-50" ? "ws-999" : "ws-123";
      });

      const result = validateBatchIsolation({
        workspaceId: "ws-123",
        resourceIds,
        membershipMap,
      });
      expect(result.valid).toBe(false);
      expect(result.failedResourceIds).toContain("res-50");
    });
  });
});
