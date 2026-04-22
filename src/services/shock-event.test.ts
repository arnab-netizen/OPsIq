import { describe, it, expect, beforeEach, vi } from "vitest";
import { createShockEvent, listShockEvents, getShockEvent } from "./shock-event";

vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    shockEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
    },
    businessConditionProfile: {
      findFirst: vi.fn(),
    },
    kpi: {
      findMany: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    recommendation: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue({ id: "audit-1" }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
  },
}));

vi.mock("./intervention-state", () => ({
  getInterventionState: vi.fn(),
}));

vi.mock("./re-evaluation", () => ({
  triggerReEvaluation: vi.fn().mockResolvedValue({}),
}));

describe("Shock Event Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createShockEvent", () => {
    it("creates shock event successfully", async () => {
      const { db } = await import("@/lib/db");
      const { getInterventionState } = await import("./intervention-state");
      const mockDb = db as any;
      const mockGetState = getInterventionState as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        code: "ENG-001",
      });

      mockGetState.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });

      mockDb.shockEvent.create.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        description: "Major client complaint",
        severity: "high",
        detectedBy: "user-1",
        detectedAt: new Date("2024-01-15T10:00:00Z"),
        version: 1,
        createdAt: new Date("2024-01-15T10:00:00Z"),
        updatedAt: new Date("2024-01-15T10:00:00Z"),
      });

      const result = await createShockEvent(
        {
          engagementId: "eng-1",
          description: "Major client complaint",
          severity: "high",
          detectedAt: "2024-01-15T10:00:00Z",
        },
        "user-1"
      );

      expect(result.id).toBe("shock-1");
      expect(result.severity).toBe("high");
      expect(mockDb.shockEvent.create).toHaveBeenCalled();
    });

    it("rejects if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue(null);

      try {
        await createShockEvent(
          {
            engagementId: "nonexistent",
            description: "Test",
            severity: "medium",
            detectedAt: "2024-01-15T10:00:00Z",
          },
          "user-1"
        );
        expect.fail("Should throw NotFoundError");
      } catch (error: any) {
        expect(error.message).toContain("not found");
      }
    });

    it("rejects if engagement phase is CLOSED", async () => {
      const { db } = await import("@/lib/db");
      const { getInterventionState } = await import("./intervention-state");
      const mockDb = db as any;
      const mockGetState = getInterventionState as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        code: "ENG-001",
      });

      mockGetState.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "closed",
      });

      try {
        await createShockEvent(
          {
            engagementId: "eng-1",
            description: "Test shock",
            severity: "critical",
            detectedAt: "2024-01-15T10:00:00Z",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error: any) {
        expect(error.message).toContain("CLOSED phase");
      }
    });

    it("emits audit event on creation", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const { getInterventionState } = await import("./intervention-state");
      const mockDb = db as any;
      const mockAudit = emitAuditEvent as any;
      const mockGetState = getInterventionState as any;

      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockGetState.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.shockEvent.create.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        description: "Test",
        severity: "high",
        detectedBy: "user-1",
        detectedAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await createShockEvent(
        {
          engagementId: "eng-1",
          description: "Test",
          severity: "high",
          detectedAt: "2024-01-15T10:00:00Z",
        },
        "user-1"
      );

      expect(mockAudit).toHaveBeenCalled();
      const call = mockAudit.mock.calls[0][0];
      expect(call.eventName).toBe("shock.event_recorded");
      expect(call.payload.engagementId).toBe("eng-1");
    });

    it("records actor context in shock event", async () => {
      const { db } = await import("@/lib/db");
      const { getInterventionState } = await import("./intervention-state");
      const mockDb = db as any;
      const mockGetState = getInterventionState as any;

      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockGetState.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.shockEvent.create.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        description: "Test",
        severity: "critical",
        detectedBy: "user-1",
        detectedAt: new Date(),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createShockEvent(
        {
          engagementId: "eng-1",
          description: "Test",
          severity: "critical",
          detectedAt: "2024-01-15T10:00:00Z",
        },
        "user-1"
      );

      expect(result.detectedBy).toBe("user-1");
    });
  });

  describe("listShockEvents", () => {
    it("lists all shock events for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.shockEvent.findMany.mockResolvedValue([
        {
          id: "shock-1",
          engagementId: "eng-1",
          description: "First event",
          severity: "high",
          detectedBy: "user-1",
          detectedAt: new Date("2024-01-15T10:00:00Z"),
          version: 1,
          createdAt: new Date("2024-01-15T10:00:00Z"),
          updatedAt: new Date("2024-01-15T10:00:00Z"),
        },
        {
          id: "shock-2",
          engagementId: "eng-1",
          description: "Second event",
          severity: "medium",
          detectedBy: "user-1",
          detectedAt: new Date("2024-01-14T10:00:00Z"),
          version: 1,
          createdAt: new Date("2024-01-14T10:00:00Z"),
          updatedAt: new Date("2024-01-14T10:00:00Z"),
        },
      ]);

      const result = await listShockEvents("eng-1");

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("shock-1");
      expect(result[1].id).toBe("shock-2");
    });

    it("rejects if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.engagement.findUnique.mockResolvedValue(null);

      try {
        await listShockEvents("nonexistent");
        expect.fail("Should throw NotFoundError");
      } catch (error: any) {
        expect(error.message).toContain("not found");
      }
    });
  });

  describe("getShockEvent", () => {
    it("retrieves shock event by id", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        description: "Test event",
        severity: "critical",
        detectedBy: "user-1",
        detectedAt: new Date("2024-01-15T10:00:00Z"),
        version: 1,
        createdAt: new Date("2024-01-15T10:00:00Z"),
        updatedAt: new Date("2024-01-15T10:00:00Z"),
      });

      const result = await getShockEvent("shock-1");

      expect(result.id).toBe("shock-1");
      expect(result.description).toBe("Test event");
    });

    it("throws if shock event not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.shockEvent.findUnique.mockResolvedValue(null);

      try {
        await getShockEvent("nonexistent");
        expect.fail("Should throw NotFoundError");
      } catch (error: any) {
        expect(error.message).toContain("not found");
      }
    });
  });
});
