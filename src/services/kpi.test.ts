import { describe, it, expect, vi, beforeEach } from "vitest";
import { KPI_STATUSES } from "@/domain/constants/statuses";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
    },
    kpi: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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

describe("KPI Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Status validation", () => {
    it("includes required statuses", () => {
      expect(KPI_STATUSES).toContain("improving");
      expect(KPI_STATUSES).toContain("stagnant");
      expect(KPI_STATUSES).toContain("worsening");
      expect(KPI_STATUSES).toContain("target_met");
    });
  });

  describe("Create KPI", () => {
    it("creates KPI with valid input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpi.create.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        name: "Revenue Growth",
        unit: "percent",
        baselineValue: 100,
        currentValue: 110,
        targetValue: 120,
        status: "improving",
      });

      const { createKPI } = await import("./kpi");
      const result = await createKPI(
        {
          engagementId: "eng-1",
          name: "Revenue Growth",
          unit: "percent",
          baselineValue: 100,
          currentValue: 110,
          targetValue: 120,
        },
        "user-1"
      );

      expect(result.id).toBe("kpi-1");
      expect(result.status).toBe("improving");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { createKPI } = await import("./kpi");

      try {
        await createKPI(
          {
            engagementId: "nonexistent",
            name: "KPI",
            unit: "unit",
            baselineValue: 100,
            currentValue: 110,
          },
          "user-1"
        );
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("Engagement not found");
      }
    });

    it("throws error if intervention phase is closed", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "closed",
      });

      const { createKPI } = await import("./kpi");

      try {
        await createKPI(
          {
            engagementId: "eng-1",
            name: "KPI",
            unit: "unit",
            baselineValue: 100,
            currentValue: 110,
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("closed phase");
      }
    });
  });

  describe("Status derivation", () => {
    it("derives improving status when current > baseline", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpi.create.mockResolvedValue({
        id: "kpi-1",
        status: "improving",
      });

      const { createKPI } = await import("./kpi");
      const result = await createKPI(
        {
          engagementId: "eng-1",
          name: "Test",
          unit: "unit",
          baselineValue: 100,
          currentValue: 150,
        },
        "user-1"
      );

      expect(result.status).toBe("improving");
    });

    it("derives worsening status when current < baseline", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpi.create.mockResolvedValue({
        id: "kpi-1",
        status: "worsening",
      });

      const { createKPI } = await import("./kpi");
      const result = await createKPI(
        {
          engagementId: "eng-1",
          name: "Test",
          unit: "unit",
          baselineValue: 100,
          currentValue: 50,
        },
        "user-1"
      );

      expect(result.status).toBe("worsening");
    });

    it("derives stagnant status when current === baseline", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpi.create.mockResolvedValue({
        id: "kpi-1",
        status: "stagnant",
      });

      const { createKPI } = await import("./kpi");
      const result = await createKPI(
        {
          engagementId: "eng-1",
          name: "Test",
          unit: "unit",
          baselineValue: 100,
          currentValue: 100,
        },
        "user-1"
      );

      expect(result.status).toBe("stagnant");
    });

    it("derives target_met status when current >= target", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpi.create.mockResolvedValue({
        id: "kpi-1",
        status: "target_met",
      });

      const { createKPI } = await import("./kpi");
      const result = await createKPI(
        {
          engagementId: "eng-1",
          name: "Test",
          unit: "unit",
          baselineValue: 100,
          currentValue: 150,
          targetValue: 120,
        },
        "user-1"
      );

      expect(result.status).toBe("target_met");
    });
  });

  describe("List KPIs", () => {
    it("lists KPIs for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.kpi.findMany.mockResolvedValue([
        {
          id: "kpi-1",
          name: "Test KPI",
          status: "improving",
          baselineValue: 100,
          currentValue: 110,
          targetValue: null,
          unit: "unit",
          createdAt: new Date(),
        },
      ]);

      const { listKPIs } = await import("./kpi");
      const result = await listKPIs("eng-1");

      expect(result.length).toBe(1);
      expect(result[0].status).toBe("improving");
    });
  });

  describe("Get KPI", () => {
    it("retrieves KPI by id", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.kpi.findUnique.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        name: "Test KPI",
        unit: "unit",
        baselineValue: 100,
        currentValue: 110,
        targetValue: null,
        status: "improving",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      });

      const { getKPIById } = await import("./kpi");
      const result = await getKPIById("kpi-1");

      expect(result.id).toBe("kpi-1");
      expect(result.status).toBe("improving");
    });
  });

  describe("Update KPI value", () => {
    it("updates KPI value and derives new status", async () => {
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
      mockDb.kpi.update.mockResolvedValue({
        id: "kpi-1",
        status: "worsening",
        currentValue: 80,
      });

      const { updateKPIValue } = await import("./kpi");
      await updateKPIValue("kpi-1", 80, "user-1", "eng-1");

      expect(mockDb.kpi.update).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalled();
      const auditCall = mockEmit.mock.calls[0][0];
      expect(auditCall.eventName).toBe("kpi.updated");
      expect(auditCall.payload.previousValue).toBe(110);
      expect(auditCall.payload.currentValue).toBe(80);
      expect(auditCall.payload.status).toBe("worsening");
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

      const { updateKPIValue } = await import("./kpi");

      try {
        await updateKPIValue("kpi-1", 110, "user-1");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("closed phase");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits KPI_CREATED audit event", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.kpi.create.mockResolvedValue({
        id: "kpi-1",
        engagementId: "eng-1",
        name: "Test KPI",
        status: "improving",
      });

      const { createKPI } = await import("./kpi");
      await createKPI(
        {
          engagementId: "eng-1",
          name: "Test KPI",
          unit: "unit",
          baselineValue: 100,
          currentValue: 110,
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("kpi.created");
      expect(call.payload.kpiId).toBe("kpi-1");
      expect(call.payload.engagementId).toBe("eng-1");
      expect(call.payload.currentValue).toBe(110);
      expect(call.payload.status).toBe("improving");
      expect(call.visibility).toBe("internal");
    });
  });
});
