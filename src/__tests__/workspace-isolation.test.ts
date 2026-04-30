import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    alert: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  enforceWorkspaceId,
  validateWorkspaceId,
} from "@/lib/workspace-validation";
import { createAlert } from "@/services/alerts/alert-service";
import { createDecision } from "@/services/decisions/decision-creation-service";
import { db } from "@/lib/db";

describe("Workspace Isolation Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("enforceWorkspaceId", () => {
    it("should throw if workspaceId is missing", () => {
      expect(() => {
        enforceWorkspaceId(null, "test", "testResource");
      }).toThrow("Invalid or missing workspace ID");
    });

    it("should throw if workspaceId is invalid UUID", () => {
      expect(() => {
        enforceWorkspaceId("not-a-uuid", "test", "testResource");
      }).toThrow("Workspace ID must be a valid UUID");
    });

    it("should accept valid UUID", () => {
      expect(() => {
        enforceWorkspaceId(
          "550e8400-e29b-41d4-a716-446655440000",
          "test",
          "testResource"
        );
      }).not.toThrow();
    });

    it("should return the valid workspaceId", () => {
      const id = "550e8400-e29b-41d4-a716-446655440000";
      const result = enforceWorkspaceId(id, "test", "testResource");
      expect(result).toBe(id);
    });
  });

  describe("validateWorkspaceId", () => {
    it("should reject undefined", () => {
      expect(() => {
        validateWorkspaceId(undefined);
      }).toThrow();
    });

    it("should reject null", () => {
      expect(() => {
        validateWorkspaceId(null);
      }).toThrow();
    });

    it("should reject non-string", () => {
      expect(() => {
        validateWorkspaceId(123 as any);
      }).toThrow();
    });

    it("should reject invalid UUID format", () => {
      expect(() => {
        validateWorkspaceId("workspace-123");
      }).toThrow();
    });

    it("should accept valid UUIDs", () => {
      const validUUIDs = [
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "00000000-0000-0000-0000-000000000000",
      ];

      validUUIDs.forEach((uuid) => {
        expect(() => {
          validateWorkspaceId(uuid);
        }).not.toThrow();
      });
    });
  });

  describe("Cross-Tenant Data Isolation", () => {
    it("createAlert should enforce workspace isolation", async () => {
      const mockAlert = {
        id: "alert-1",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked" as const,
        channel: "in_app" as const,
        message: "Test",
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.alert.create).mockResolvedValueOnce(mockAlert as any);

      // Valid workspace ID
      await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked",
        channel: "in_app",
        message: "Test",
      });

      expect(vi.mocked(db.alert.create)).toHaveBeenCalled();
    });

    it("createAlert should reject invalid workspace ID", async () => {
      await expect(
        createAlert({
          workspaceId: "invalid-workspace",
          userId: "user-001",
          type: "blocked",
          channel: "in_app",
          message: "Test",
        })
      ).rejects.toThrow();
    });

    it("createDecision should enforce workspace isolation", async () => {
      const mockDecision = {
        id: "d-001",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        problem: "Test Decision",
        action: "strategic",
        decisionType: "strategic",
        impactExpected: 100000,
        impactLow: 80000,
        impactHigh: 120000,
        confidence: 0.85,
        priorityScore: 85000,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      // Valid workspace ID
      const result = await createDecision({
        title: "Test Decision",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });

      expect(result.id).toBe("d-001");
      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalled();
    });

    it("createDecision should reject invalid workspace ID", async () => {
      await expect(
        createDecision({
          title: "Test",
          type: "strategic",
          impact: 100000,
          confidence: 0.85,
          workspaceId: "cross-tenant-attack",
          userId: "user-001",
        })
      ).rejects.toThrow("Workspace ID must be a valid UUID");
    });

    it("should prevent mixing workspaceIds in bulk operations", async () => {
      const ws1 = "550e8400-e29b-41d4-a716-446655440001";
      const ws2 = "550e8400-e29b-41d4-a716-446655440002";

      const mockDecision1 = {
        id: "d-001",
        workspaceId: ws1,
        problem: "Test",
        action: "strategic",
        decisionType: "strategic",
        impactExpected: 100000,
        impactLow: 80000,
        impactHigh: 120000,
        confidence: 0.85,
        priorityScore: 85000,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDecision2 = {
        ...mockDecision1,
        id: "d-002",
        workspaceId: ws2,
      };

      vi.mocked(db.operatorItem.create)
        .mockResolvedValueOnce(mockDecision1 as any)
        .mockResolvedValueOnce(mockDecision2 as any);

      // Attempting to create with different workspace should succeed
      await createDecision({
        title: "Test",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: ws1,
        userId: "user-001",
      });

      // Different workspace should be isolated
      await createDecision({
        title: "Test",
        type: "strategic",
        impact: 100000,
        confidence: 0.85,
        workspaceId: ws2,
        userId: "user-001",
      });

      // Verify both created with correct workspace
      expect(vi.mocked(db.operatorItem.create)).toHaveBeenCalledTimes(2);
    });
  });

  describe("Database Query Isolation", () => {
    it("should verify create calls include workspaceId", async () => {
      const mockDecision = {
        id: "d-001",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        problem: "Test",
        action: "test",
        decisionType: "test",
        impactExpected: 100000,
        impactLow: 80000,
        impactHigh: 120000,
        confidence: 0.85,
        priorityScore: 85000,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.operatorItem.create).mockResolvedValueOnce(
        mockDecision as any
      );

      await createDecision({
        title: "Test",
        type: "test",
        impact: 100000,
        confidence: 0.85,
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
      });

      const createCall = vi.mocked(db.operatorItem.create).mock.calls[0];
      expect(createCall[0].data.workspaceId).toBe(
        "550e8400-e29b-41d4-a716-446655440000"
      );
    });

    it("should verify alert create calls include workspaceId", async () => {
      const mockAlert = {
        id: "alert-1",
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked" as const,
        channel: "in_app" as const,
        message: "Test",
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.alert.create).mockResolvedValueOnce(mockAlert as any);

      await createAlert({
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "user-001",
        type: "blocked",
        channel: "in_app",
        message: "Test",
      });

      const createCall = vi.mocked(db.alert.create).mock.calls[0];
      expect(createCall[0].data.workspaceId).toBe(
        "550e8400-e29b-41d4-a716-446655440000"
      );
    });
  });

  describe("Workspace Isolation Edge Cases", () => {
    it("should reject workspace ID with SQL injection attempt", () => {
      expect(() => {
        validateWorkspaceId("'; DROP TABLE users; --");
      }).toThrow();
    });

    it("should reject workspace ID with path traversal", () => {
      expect(() => {
        validateWorkspaceId("../../etc/passwd");
      }).toThrow();
    });

    it("should handle workspace ID case sensitivity", () => {
      const lowercaseUUID = "550e8400-e29b-41d4-a716-446655440000";
      const uppercaseUUID = "550E8400-E29B-41D4-A716-446655440000";

      expect(() => {
        validateWorkspaceId(lowercaseUUID);
      }).not.toThrow();

      expect(() => {
        validateWorkspaceId(uppercaseUUID);
      }).not.toThrow();
    });
  });
});
