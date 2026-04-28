import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import * as operatorStore from "@/services/operator/store";
import * as calibrationEngine from "@/services/calibration/engine";
import * as authServerRole from "@/services/auth/server-role";
import * as auth from "@/services/auth";
import * as auditLog from "@/services/audit/audit-log";
import type { OperatorItem } from "@/domain/operator/types";

// Mock dependencies
vi.mock("@/services/operator/store");
vi.mock("@/services/calibration/engine");
vi.mock("@/services/auth/server-role");
vi.mock("@/services/auth");
vi.mock("@/services/audit/audit-log");

describe("GET /api/calibration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication and Authorization", () => {
    it("should return 403 when role cannot be resolved", async () => {
      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Unauthorized");
    });

    it("should allow viewing calibration for authenticated users", async () => {
      const mockItems: OperatorItem[] = [
        {
          id: "1",
          problem: "test",
          action: "test",
          impactExpected: 100,
          impactLow: 50,
          impactHigh: 150,
          confidence: 0.8,
          priorityScore: 10,
          status: "done",
          dueAt: null,
          blockingDependencies: [],
          expectedOutcome: null,
          actualOutcome: null,
          actualOutcomeValue: 100,
          outcomeDelta: 0,
          decisionAccuracy: 1.0,
          decisionError: 0,
          createdAt: new Date().toISOString(),
          engineVersion: "v1.0.0",
        },
      ];

      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("viewer");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
      vi.mocked(operatorStore.getItems).mockResolvedValue(mockItems);
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: 1.0,
        avgError: 0,
        weightedAccuracy: 1.0,
        successRate: 100,
        itemsAnalyzed: 1,
        successCount: 1,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.avgAccuracy).toBe(1.0);
      expect(data.successRate).toBe(100);
    });
  });

  describe("Calibration Metrics Computation", () => {
    beforeEach(() => {
      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("admin");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
    });

    it("should return computed calibration metrics", async () => {
      const mockItems: OperatorItem[] = [];

      vi.mocked(operatorStore.getItems).mockResolvedValue(mockItems);
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: 1.05,
        avgError: 5,
        weightedAccuracy: 1.02,
        successRate: 75,
        itemsAnalyzed: 20,
        successCount: 15,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.avgAccuracy).toBe(1.05);
      expect(data.avgError).toBe(5);
      expect(data.weightedAccuracy).toBe(1.02);
      expect(data.successRate).toBe(75);
      expect(data.itemsAnalyzed).toBe(20);
      expect(data.successCount).toBe(15);
      expect(data.valid).toBe(true);
    });

    it("should return null metrics when no items are available", async () => {
      vi.mocked(operatorStore.getItems).mockResolvedValue([]);
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: null,
        avgError: null,
        weightedAccuracy: null,
        successRate: null,
        itemsAnalyzed: 0,
        successCount: 0,
        valid: false,
        reason: "No completed items with outcome data",
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(false);
      expect(data.avgAccuracy).toBeNull();
      expect(data.successRate).toBeNull();
      expect(data.weightedAccuracy).toBeNull();
    });

    it("should fetch all items and pass to calibration", async () => {
      const mockItems: OperatorItem[] = [
        {
          id: "1",
          problem: "test",
          action: "test",
          impactExpected: 100,
          impactLow: 50,
          impactHigh: 150,
          confidence: 0.8,
          priorityScore: 10,
          status: "done",
          dueAt: null,
          blockingDependencies: [],
          expectedOutcome: null,
          actualOutcome: null,
          actualOutcomeValue: 150,
          outcomeDelta: 50,
          decisionAccuracy: 1.5,
          decisionError: 50,
          createdAt: new Date().toISOString(),
          engineVersion: "v1.0.0",
        },
      ];

      vi.mocked(operatorStore.getItems).mockResolvedValue(mockItems);
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: 1.5,
        avgError: 50,
        weightedAccuracy: 1.5,
        successRate: 100,
        itemsAnalyzed: 1,
        successCount: 1,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(operatorStore.getItems).toHaveBeenCalled();
      expect(calibrationEngine.computeCalibration).toHaveBeenCalledWith(
        mockItems
      );
    });
  });

  describe("Audit Logging", () => {
    beforeEach(() => {
      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("admin");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
      vi.mocked(operatorStore.getItems).mockResolvedValue([]);
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: null,
        avgError: null,
        weightedAccuracy: null,
        successRate: null,
        itemsAnalyzed: 0,
        successCount: 0,
        valid: false,
      });
    });

    it("should log CALIBRATION_VIEWED audit event", async () => {
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(auditLog.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "CALIBRATION_VIEWED",
          entityType: "Calibration",
          entityId: "system",
          actorId: "user-123",
          role: "admin",
          before: null,
          after: null,
        })
      );
    });

    it("should include metrics in audit metadata", async () => {
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: 1.0,
        avgError: 0,
        weightedAccuracy: 0.98,
        successRate: 85,
        itemsAnalyzed: 20,
        successCount: 17,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(auditLog.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            itemsAnalyzed: 20,
            successRate: 85,
            avgAccuracy: 1.0,
            avgError: 0,
            weightedAccuracy: 0.98,
          }),
        })
      );
    });

    it("should log with null actorId when session is unavailable", async () => {
      vi.mocked(auth.getSession).mockResolvedValue(null);
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(auditLog.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: null,
        })
      );
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("admin");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
    });

    it("should handle errors from getItems", async () => {
      const error = new Error("Database connection failed");
      vi.mocked(operatorStore.getItems).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Database connection failed");
    });

    it("should handle errors from logAuditEvent", async () => {
      const error = new Error("Audit logging failed");
      vi.mocked(operatorStore.getItems).mockResolvedValue([]);
      vi.mocked(calibrationEngine.computeCalibration).mockReturnValue({
        avgAccuracy: null,
        avgError: null,
        weightedAccuracy: null,
        successRate: null,
        itemsAnalyzed: 0,
        successCount: 0,
        valid: false,
      });
      vi.mocked(auditLog.logAuditEvent).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Audit logging failed");
    });

    it("should handle non-Error exceptions", async () => {
      vi.mocked(operatorStore.getItems).mockRejectedValue("Unknown error");

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Unknown error");
    });
  });
});
