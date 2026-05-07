import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "../route";
import * as operatorStore from "@/services/operator/store";
import * as valueTracker from "@/services/value/tracker";
import * as authServerRole from "@/services/auth/server-role";
import * as auth from "@/services/auth";
import * as auditLog from "@/services/audit/audit-log";
import type { OperatorItem } from "@/domain/operator/types";

// Mock dependencies
vi.mock("@/services/operator/store");
vi.mock("@/services/value/tracker");
vi.mock("@/services/auth/server-role");
vi.mock("@/services/auth");
vi.mock("@/services/audit/audit-log");

describe("GET /api/value", () => {
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

    it("should allow viewing value metrics for authenticated users", async () => {
      const mockItems: OperatorItem[] = [];

      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("viewer");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
      vi.mocked(operatorStore.getItems).mockResolvedValue(mockItems);
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 100000,
        totalActual: 120000,
        totalDelta: 20000,
        roi: 1.2,
        lossFromWrongDecisions: 0,
        itemsAnalyzed: 5,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalExpected).toBe(100000);
      expect(data.totalDelta).toBe(20000);
    });
  });

  describe("Value Metrics Computation", () => {
    beforeEach(() => {
      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("admin");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
    });

    it("should return computed value metrics", async () => {
      const mockItems: OperatorItem[] = [];

      vi.mocked(operatorStore.getItems).mockResolvedValue(mockItems);
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 500000,
        totalActual: 650000,
        totalDelta: 150000,
        roi: 1.3,
        lossFromWrongDecisions: 0,
        itemsAnalyzed: 10,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalExpected).toBe(500000);
      expect(data.totalActual).toBe(650000);
      expect(data.totalDelta).toBe(150000);
      expect(data.roi).toBe(1.3);
      expect(data.lossFromWrongDecisions).toBe(0);
      expect(data.itemsAnalyzed).toBe(10);
      expect(data.valid).toBe(true);
    });

    it("should return invalid metrics when no items are available", async () => {
      vi.mocked(operatorStore.getItems).mockResolvedValue([]);
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 0,
        totalActual: 0,
        totalDelta: 0,
        roi: null,
        lossFromWrongDecisions: 0,
        itemsAnalyzed: 0,
        valid: false,
        reason: "No completed items with outcome data",
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.valid).toBe(false);
      expect(data.totalExpected).toBe(0);
    });

    it("should fetch all items and pass to value tracker", async () => {
      const mockItems: OperatorItem[] = [
        {
          id: "1",
          problem: "test",
          action: "test",
          impactExpected: 100000,
          impactLow: 50000,
          impactHigh: 150000,
          confidence: 0.8,
          priorityScore: 10,
          status: "done",
          dueAt: null,
          blockingDependencies: [],
          expectedOutcome: null,
          actualOutcome: null,
          actualOutcomeValue: 120000,
          outcomeDelta: 20000,
          decisionAccuracy: 1.2,
          decisionError: 20000,
          createdAt: new Date().toISOString(),
          engineVersion: "v1.0.0",
        },
      ];

      vi.mocked(operatorStore.getItems).mockResolvedValue(mockItems);
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 100000,
        totalActual: 120000,
        totalDelta: 20000,
        roi: 1.2,
        lossFromWrongDecisions: 0,
        itemsAnalyzed: 1,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(operatorStore.getItems).toHaveBeenCalled();
      expect(valueTracker.calculateValue).toHaveBeenCalledWith(mockItems);
    });

    it("should handle negative delta (value loss)", async () => {
      vi.mocked(operatorStore.getItems).mockResolvedValue([]);
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 100000,
        totalActual: 80000,
        totalDelta: -20000,
        roi: 0.8,
        lossFromWrongDecisions: 20000,
        itemsAnalyzed: 1,
        valid: true,
      });
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      const response = await GET();
      const data = await response.json();

      expect(data.totalDelta).toBe(-20000);
      expect(data.roi).toBe(0.8);
      expect(data.lossFromWrongDecisions).toBe(20000);
      expect(data.valid).toBe(true);
    });
  });

  describe("Audit Logging", () => {
    beforeEach(() => {
      vi.mocked(authServerRole.resolveServerRole).mockResolvedValue("admin");
      vi.mocked(auth.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any);
      vi.mocked(operatorStore.getItems).mockResolvedValue([]);
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 100000,
        totalActual: 120000,
        totalDelta: 20000,
        roi: 1.2,
        lossFromWrongDecisions: 0,
        itemsAnalyzed: 5,
        valid: true,
      });
    });

    it("should log VALUE_VIEWED audit event", async () => {
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(auditLog.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "VALUE_VIEWED",
          entityType: "Value",
          entityId: "system",
          actorId: "user-123",
          role: "admin",
          before: null,
          after: null,
        })
      );
    });

    it("should include value metrics in audit metadata", async () => {
      vi.mocked(auditLog.logAuditEvent).mockResolvedValue(undefined);

      await GET();

      expect(auditLog.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            totalExpected: 100000,
            totalActual: 120000,
            totalDelta: 20000,
            roi: 1.2,
            lossFromWrongDecisions: 0,
            itemsAnalyzed: 5,
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
      vi.mocked(valueTracker.calculateValue).mockReturnValue({
        totalExpected: 0,
        totalActual: 0,
        totalDelta: 0,
        roi: null,
        lossFromWrongDecisions: 0,
        itemsAnalyzed: 0,
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
