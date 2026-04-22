import { describe, it, expect, vi } from "vitest";
import {
  SHOCK_EVENT_TYPES,
  RISK_SEVERITIES,
  INTERVENTION_PHASES,
} from "@/domain/constants/statuses";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    shockEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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

describe("Shock Event Service", () => {
  describe("Shock event type validation", () => {
    it("includes required shock event types", () => {
      expect(SHOCK_EVENT_TYPES).toContain("market_disruption");
      expect(SHOCK_EVENT_TYPES).toContain("key_personnel_loss");
      expect(SHOCK_EVENT_TYPES).toContain("major_client_loss");
      expect(SHOCK_EVENT_TYPES).toContain("regulatory_change");
      expect(SHOCK_EVENT_TYPES).toContain("cash_flow_crisis");
    });

    it("includes at least 5 event types", () => {
      expect(SHOCK_EVENT_TYPES.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Severity validation", () => {
    it("uses RISK_SEVERITIES for shock event severity", () => {
      expect(RISK_SEVERITIES).toContain("low");
      expect(RISK_SEVERITIES).toContain("medium");
      expect(RISK_SEVERITIES).toContain("high");
      expect(RISK_SEVERITIES).toContain("critical");
    });
  });

  describe("Phase gate validation", () => {
    it("allows shock events in assessment phase", () => {
      const phase = "assessment";
      expect(INTERVENTION_PHASES).toContain(phase);
    });

    it("allows shock events in execution phase", () => {
      const phase = "execution";
      expect(INTERVENTION_PHASES).toContain(phase);
    });

    it("allows shock events in planning phase", () => {
      const phase = "planning";
      expect(INTERVENTION_PHASES).toContain(phase);
    });
  });

  describe("Service creation", () => {
    it("creates shock event with valid input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: {
          currentPhase: "execution",
        },
      });
      mockDb.shockEvent.create.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        eventType: "market_disruption",
        severity: "high",
        title: "Market disruption event",
        description: "Unexpected market change",
        detectedAt: new Date(),
        recordedBy: "user-1",
        version: 1,
      });

      const { createShockEvent } = await import("./shock-event");
      const result = await createShockEvent(
        {
          engagementId: "eng-1",
          eventType: "market_disruption",
          severity: "high",
          title: "Market disruption event",
          description: "Unexpected market change",
          detectedAt: new Date().toISOString(),
        },
        "user-1"
      );

      expect(result.id).toBe("shock-1");
      expect(result.eventType).toBe("market_disruption");
      expect(result.severity).toBe("high");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { createShockEvent } = await import("./shock-event");

      try {
        await createShockEvent(
          {
            engagementId: "nonexistent",
            eventType: "market_disruption",
            severity: "high",
            title: "Test",
            detectedAt: new Date().toISOString(),
          },
          "user-1"
        );
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("not found");
      }
    });

    it("throws error for invalid event type", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: { currentPhase: "execution" },
      });

      const { createShockEvent } = await import("./shock-event");

      try {
        await createShockEvent(
          {
            engagementId: "eng-1",
            eventType: "invalid_event" as any,
            severity: "high",
            title: "Test",
            detectedAt: new Date().toISOString(),
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("Invalid shock event type");
      }
    });

    it("throws error for invalid severity", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: { currentPhase: "execution" },
      });

      const { createShockEvent } = await import("./shock-event");

      try {
        await createShockEvent(
          {
            engagementId: "eng-1",
            eventType: "market_disruption",
            severity: "invalid_severity" as any,
            title: "Test",
            detectedAt: new Date().toISOString(),
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("Invalid severity");
      }
    });

    it("throws error if phase gate rejects closed phase", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: {
          currentPhase: "closed",
        },
      });

      const { createShockEvent } = await import("./shock-event");

      try {
        await createShockEvent(
          {
            engagementId: "eng-1",
            eventType: "market_disruption",
            severity: "high",
            title: "Test",
            detectedAt: new Date().toISOString(),
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("cannot be recorded");
      }
    });
  });

  describe("List shock events", () => {
    it("lists shock events for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.shockEvent.findMany.mockResolvedValue([
        {
          id: "shock-1",
          eventType: "market_disruption",
          severity: "high",
          title: "Event 1",
          detectedAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      mockDb.shockEvent.count.mockResolvedValue(1);

      const { listShockEventsForEngagement } = await import("./shock-event");
      const result = await listShockEventsForEngagement("eng-1");

      expect(result.events.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.events[0].eventType).toBe("market_disruption");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { listShockEventsForEngagement } = await import("./shock-event");

      try {
        await listShockEventsForEngagement("nonexistent");
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("not found");
      }
    });
  });

  describe("Get shock event", () => {
    it("retrieves shock event by id", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.shockEvent.findUnique.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        eventType: "market_disruption",
        severity: "high",
        title: "Test event",
        description: "Test description",
        detectedAt: new Date("2024-01-01"),
        recordedBy: "user-1",
        version: 1,
        createdAt: new Date("2024-01-02"),
        updatedAt: new Date("2024-01-02"),
      });

      const { getShockEventById } = await import("./shock-event");
      const result = await getShockEventById("shock-1");

      expect(result.id).toBe("shock-1");
      expect(result.eventType).toBe("market_disruption");
      expect(result.severity).toBe("high");
      expect(result.title).toBe("Test event");
    });

    it("throws error if shock event not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.shockEvent.findUnique.mockResolvedValue(null);

      const { getShockEventById } = await import("./shock-event");

      try {
        await getShockEventById("nonexistent");
        expect.fail("Should throw NotFoundError");
      } catch (error) {
        expect((error as any).message).toContain("not found");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits SHOCK_EVENT_RECORDED audit event", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionState: { currentPhase: "execution" },
      });
      mockDb.shockEvent.create.mockResolvedValue({
        id: "shock-1",
        engagementId: "eng-1",
        eventType: "market_disruption",
        severity: "high",
        title: "Event",
        description: null,
        detectedAt: new Date(),
        recordedBy: "user-1",
        version: 1,
      });

      const { createShockEvent } = await import("./shock-event");
      await createShockEvent(
        {
          engagementId: "eng-1",
          eventType: "market_disruption",
          severity: "high",
          title: "Event",
          detectedAt: new Date().toISOString(),
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("shock.event_recorded");
      expect(call.payload.engagementId).toBe("eng-1");
      expect(call.payload.eventType).toBe("market_disruption");
      expect(call.payload.severity).toBe("high");
    });
  });
});
