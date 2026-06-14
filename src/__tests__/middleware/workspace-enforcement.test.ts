/**
 * M12 Access Control: Cross-Workspace Access Denial Tests
 *
 * Tests that enforceWorkspaceScoping correctly rejects access when:
 * - User is not a member of the workspace
 * - Workspace does not exist
 * - Workspace is inactive
 * - User session is invalid
 *
 * Execution.md M12 requirement (section 8):
 * "cross-workspace reads are blocked"
 * "cross-workspace writes are blocked"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";

// Mock dependencies
vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findUnique: vi.fn(),
    },
    workspaceMembership: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/services/auth", () => ({
  getSession: vi.fn(),
}));

import { db } from "@/lib/db";
import { getSession } from "@/services/auth";

describe("M12: Cross-Workspace Access Denial", () => {
  const workspaceId1 = "550e8400-e29b-41d4-a716-446655440000";
  const workspaceId2 = "660e8400-e29b-41d4-a716-446655440001";
  const userId = "750e8400-e29b-41d4-a716-446655440002";

  const mockRequest = {
    headers: new Map([["x-workspace-id", workspaceId1]]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enforceWorkspaceScoping", () => {
    it("should reject access when user is not a member of workspace", async () => {
      (getSession as any).mockResolvedValue({
        user: { id: userId },
      });

      (db.workspace.findUnique as any).mockResolvedValue({
        id: workspaceId1,
        isActive: true,
      });

      // User is NOT a member of this workspace
      (db.workspaceMembership.findUnique as any).mockResolvedValue(null);

      const result = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );

      expect(result).toBeNull();
    });

    it("should reject access when workspace does not exist", async () => {
      (getSession as any).mockResolvedValue({
        user: { id: userId },
      });

      // Workspace does not exist
      (db.workspace.findUnique as any).mockResolvedValue(null);

      const result = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );

      expect(result).toBeNull();
    });

    it("should reject access when workspace is inactive", async () => {
      (getSession as any).mockResolvedValue({
        user: { id: userId },
      });

      (db.workspace.findUnique as any).mockResolvedValue({
        id: workspaceId1,
        isActive: false, // Workspace is inactive
      });

      const result = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );

      expect(result).toBeNull();
    });

    it("should reject access when user membership is inactive", async () => {
      (getSession as any).mockResolvedValue({
        user: { id: userId },
      });

      (db.workspace.findUnique as any).mockResolvedValue({
        id: workspaceId1,
        isActive: true,
      });

      (db.workspaceMembership.findUnique as any).mockResolvedValue({
        workspaceId: workspaceId1,
        userId,
        role: "admin",
        isActive: false, // Membership is inactive
      });

      const result = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );

      expect(result).toBeNull();
    });

    it("should reject access when user has no valid session", async () => {
      (getSession as any).mockResolvedValue(null);

      const result = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );

      expect(result).toBeNull();
    });

    it("should reject access for invalid workspace ID format", async () => {
      const invalidWorkspaceId = "not-a-uuid";

      await expect(() =>
        enforceWorkspaceScoping(mockRequest as any, invalidWorkspaceId)
      ).rejects.toThrow(ForbiddenError);
    });

    it("should allow access when user is active member of workspace", async () => {
      (getSession as any).mockResolvedValue({
        user: { id: userId },
      });

      (db.workspace.findUnique as any).mockResolvedValue({
        id: workspaceId1,
        isActive: true,
      });

      (db.workspaceMembership.findUnique as any).mockResolvedValue({
        workspaceId: workspaceId1,
        userId,
        role: "admin",
        isActive: true,
      });

      const result = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
      expect(result?.role).toBe("admin");
    });

    it("should allow different workspace members to access their own workspace only", async () => {
      const userId1 = "750e8400-e29b-41d4-a716-446655440002";
      const userId2 = "750e8400-e29b-41d4-a716-446655440003";

      // User 1 accessing workspace 1
      (getSession as any).mockResolvedValueOnce({
        user: { id: userId1 },
      });

      (db.workspace.findUnique as any).mockResolvedValueOnce({
        id: workspaceId1,
        isActive: true,
      });

      (db.workspaceMembership.findUnique as any).mockResolvedValueOnce({
        workspaceId: workspaceId1,
        userId: userId1,
        role: "admin",
        isActive: true,
      });

      const result1 = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );
      expect(result1).not.toBeNull();
      expect(result1?.userId).toBe(userId1);

      // User 2 trying to access workspace 1 (should fail)
      (getSession as any).mockResolvedValueOnce({
        user: { id: userId2 },
      });

      (db.workspace.findUnique as any).mockResolvedValueOnce({
        id: workspaceId1,
        isActive: true,
      });

      // User 2 is NOT a member of workspace 1
      (db.workspaceMembership.findUnique as any).mockResolvedValueOnce(null);

      const result2 = await enforceWorkspaceScoping(
        mockRequest as any,
        workspaceId1
      );
      expect(result2).toBeNull();
    });
  });

  describe("hasPermission", () => {
    it("should grant all permissions to admin role", () => {
      expect(hasPermission("admin", "create")).toBe(true);
      expect(hasPermission("admin", "read")).toBe(true);
      expect(hasPermission("admin", "update")).toBe(true);
      expect(hasPermission("admin", "delete")).toBe(true);
      expect(hasPermission("admin", "override")).toBe(true);
    });

    it("should grant limited permissions to operator role", () => {
      expect(hasPermission("operator", "create")).toBe(true);
      expect(hasPermission("operator", "read")).toBe(true);
      expect(hasPermission("operator", "delete")).toBe(false);
      expect(hasPermission("operator", "override")).toBe(false);
    });

    it("should grant read-only permissions to reviewer role", () => {
      expect(hasPermission("reviewer", "read")).toBe(true);
      expect(hasPermission("reviewer", "approve")).toBe(true);
      expect(hasPermission("reviewer", "create")).toBe(false);
      expect(hasPermission("reviewer", "delete")).toBe(false);
    });

    it("should reject unknown roles", () => {
      expect(hasPermission("unknown_role", "read")).toBe(false);
      expect(hasPermission("unknown_role", "create")).toBe(false);
    });
  });
});
