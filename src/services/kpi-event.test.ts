import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    kpi: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    action: {
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
    },
    kpiEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("KPI Event Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Record KPI change", () => {
    it("records KPI change successfully", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        baselineValue: 100,
        currentValue: 110,
        targetValue: null,
        status: "improving",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpiEvent.create.mockResolvedValue({
        id: "event-1",
        kpiId: "kpi-1",
        previousValue: 110,
        newValue: 120,
        delta: 10,
      });
      mockDb.kpi.update.mockResolvedValue({
        id: "kpi-1",
        currentValue: 120,
        status: "improving",
      });

      const { recordKPIChange } = await import("./kpi-event");
      await recordKPIChange("kpi-1", 120, "user-1", undefined, "eng-1");

      expect(mockDb.kpiEvent.create).toHaveBeenCalled();
      const eventCall = mockDb.kpiEvent.create.mock.calls[0][0];
      expect(eventCall.data.previousValue).toBe(110);
      expect(eventCall.data.newValue).toBe(120);
      expect(eventCall.data.delta).toBe(10);

      expect(mockDb.kpi.update).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalled();
      const auditCall = mockEmit.mock.calls[0][0];
      expect(auditCall.eventName).toBe("kpi.change_recorded");
      expect(auditCall.payload.delta).toBe(10);
    });

    it("records KPI change with action linkage", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        baselineValue: 100,
        currentValue: 110,
        targetValue: null,
        status: "improving",
      });
      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpiEvent.create.mockResolvedValue({
        id: "event-1",
        kpiId: "kpi-1",
        actionId: "action-1",
        previousValue: 110,
        newValue: 120,
        delta: 10,
      });
      mockDb.kpi.update.mockResolvedValue({
        id: "kpi-1",
        currentValue: 120,
        status: "improving",
      });

      const { recordKPIChange } = await import("./kpi-event");
      await recordKPIChange("kpi-1", 120, "user-1", "action-1", "eng-1");

      expect(mockDb.kpiEvent.create).toHaveBeenCalled();
      const eventCall = mockDb.kpiEvent.create.mock.calls[0][0];
      expect(eventCall.data.actionId).toBe("action-1");
    });

    it("computes delta correctly", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        baselineValue: 100,
        currentValue: 50,
        targetValue: null,
        status: "worsening",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpiEvent.create.mockResolvedValue({
        id: "event-1",
        kpiId: "kpi-1",
        previousValue: 50,
        newValue: 75,
        delta: 25,
      });
      mockDb.kpi.update.mockResolvedValue({
        id: "kpi-1",
        currentValue: 75,
        status: "improving",
      });

      const { recordKPIChange } = await import("./kpi-event");
      await recordKPIChange("kpi-1", 75, "user-1", undefined, "eng-1");

      expect(mockDb.kpiEvent.create).toHaveBeenCalled();
      const eventCall = mockDb.kpiEvent.create.mock.calls[0][0];
      expect(eventCall.data.delta).toBe(25); // 75 - 50
    });

    it("updates KPI status after recording change", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        baselineValue: 100,
        currentValue: 90,
        targetValue: 120,
        status: "worsening",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpiEvent.create.mockResolvedValue({
        id: "event-1",
        kpiId: "kpi-1",
        previousValue: 90,
        newValue: 150,
        delta: 60,
      });
      mockDb.kpi.update.mockResolvedValue({
        id: "kpi-1",
        currentValue: 150,
        status: "target_met",
      });

      const { recordKPIChange } = await import("./kpi-event");
      await recordKPIChange("kpi-1", 150, "user-1", undefined, "eng-1");

      expect(mockDb.kpi.update).toHaveBeenCalled();
      const updateCall = mockDb.kpi.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe("target_met");
      expect(updateCall.data.currentValue).toBe(150);
    });

    it("throws error if intervention phase is closed", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "closed",
      });

      const { recordKPIChange } = await import("./kpi-event");

      try {
        await recordKPIChange("kpi-1", 120, "user-1");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("closed phase");
      }
    });

    it("throws error if action does not exist", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
      });
      mockDb.action.findUnique.mockResolvedValue(null);

      const { recordKPIChange } = await import("./kpi-event");

      try {
        await recordKPIChange("kpi-1", 120, "user-1", "nonexistent-action");
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("Action not found");
      }
    });

    it("throws error if action belongs to different engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
      });
      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-2",
      });

      const { recordKPIChange } = await import("./kpi-event");

      try {
        await recordKPIChange("kpi-1", 120, "user-1", "action-1");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to the same engagement");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits KPI_CHANGE_RECORDED audit event with delta", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        baselineValue: 100,
        currentValue: 110,
        targetValue: null,
        status: "improving",
      });
      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpiEvent.create.mockResolvedValue({
        id: "event-1",
        kpiId: "kpi-1",
        previousValue: 110,
        newValue: 120,
        delta: 10,
      });
      mockDb.kpi.update.mockResolvedValue({
        id: "kpi-1",
        currentValue: 120,
        status: "improving",
      });

      const { recordKPIChange } = await import("./kpi-event");
      await recordKPIChange("kpi-1", 120, "user-1", "action-1", "eng-1");

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("kpi.change_recorded");
      expect(call.payload.kpiId).toBe("kpi-1");
      expect(call.payload.actionId).toBe("action-1");
      expect(call.payload.previousValue).toBe(110);
      expect(call.payload.newValue).toBe(120);
      expect(call.payload.delta).toBe(10);
      expect(call.payload.status).toBe("improving");
      expect(call.visibility).toBe("internal");
    });
  });
});
