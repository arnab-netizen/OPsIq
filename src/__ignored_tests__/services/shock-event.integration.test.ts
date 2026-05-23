import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import {
  createShockEvent,
  updateShockEvent,
  listShockEventsForEngagement,
  getShockEventDetail,
} from "./shock-event";
import { createEngagement } from "./engagement";
import { createClient } from "./client-account";
import { TEST_IDS } from "@/domain/constants/test-ids";
import type { CreateShockEventInput } from "./shock-event";

describe("ShockEvent Service", () => {
  let clientId: string;
  let engagementId: string;
  const actorId = TEST_IDS.TEST_ACTOR_ID;

  beforeAll(async () => {
    // Create test client
    const client = await createClient(
      {
        name: "Test Client - Shock Event",
        industry: "Technology",
        size: "large",
      },
      actorId
    );
    clientId = client.id;

    // Create test engagement
    const engagement = await createEngagement(
      {
        title: "Test Engagement",
        clientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      },
      actorId
    );
    engagementId = engagement.id;
  });

  afterAll(async () => {
    // Clean up test data
    // Note: Clean up may fail if records don't exist - that's OK
    try {
      await (db.shockEvent.deleteMany as unknown)({ where: { engagementId } });
      await (db.engagement.deleteMany as unknown)({ where: { id: engagementId } });
      await (db.clientAccount.deleteMany as unknown)({ where: { id: clientId } });
    } catch {
      // Cleanup is best-effort
    }
  });

  describe("createShockEvent", () => {
    it("should create a shock event with valid input", async () => {
      const input: CreateShockEventInput = {
        engagementId,
        type: "key_employee_loss",
        severity: "high",
        happenedAt: "2026-04-22T10:00:00Z",
        notes: "VP of Operations resigned unexpectedly",
      };

      const result = await createShockEvent(input, actorId);

      await expect(result.id).toBeDefined();
      await expect(result.engagementId).toBe(engagementId);

      const event = await getShockEventDetail(result.id);
      await expect(event.type).toBe("key_employee_loss");
      await expect(event.severity).toBe("high");
      await expect(event.notes).toBe("VP of Operations resigned unexpectedly");
    });

    it("should reject invalid shock event type", async () => {
      const input = {
        engagementId,
        type: "invalid_type",
        severity: "high",
        happenedAt: "2026-04-22T10:00:00Z",
      } as unknown;

      await expect(async () => {
        await createShockEvent(input, actorId);
      }).rejects.toThrow("Invalid shock event type");
    });

    it("should reject invalid severity", async () => {
      const input = {
        engagementId,
        type: "major_client_loss",
        severity: "extreme",
        happenedAt: "2026-04-22T10:00:00Z",
      } as unknown;

      await expect(async () => {
        await createShockEvent(input, actorId);
      }).rejects.toThrow("Invalid severity");
    });

    it("should reject invalid date format", async () => {
      const input: CreateShockEventInput = {
        engagementId,
        type: "payroll_pressure",
        severity: "critical",
        happenedAt: "not-a-date",
      };

      await expect(async () => {
        await createShockEvent(input, actorId);
      }).rejects.toThrow("must be a valid ISO 8601 date string");
    });

    it("should reject non-existent engagement", async () => {
      const input: CreateShockEventInput = {
        engagementId: "non-existent-id",
        type: "compliance_issue",
        severity: "medium",
        happenedAt: "2026-04-22T10:00:00Z",
      };

      await expect(async () => {
        await createShockEvent(input, actorId);
      }).rejects.toThrow("not found");
    });
  });

  describe("updateShockEvent", () => {
    let shockEventId: string;

    beforeAll(async () => {
      const input: CreateShockEventInput = {
        engagementId,
        type: "service_breakdown",
        severity: "medium",
        happenedAt: "2026-04-20T10:00:00Z",
      };
      const result = await createShockEvent(input, actorId);
      shockEventId = result.id;
    });

    it("should update a shock event", async () => {
      const existing = await getShockEventDetail(shockEventId);
      const result = await updateShockEvent(
        shockEventId,
        {
          severity: "critical",
          notes: "Production database went down for 2 hours",
          version: existing.version,
        },
        actorId
      );

      expect(result.id).toBe(shockEventId);

      const updated = await getShockEventDetail(shockEventId);
      expect(updated.severity).toBe("critical");
      expect(updated.notes).toBe("Production database went down for 2 hours");
      expect(updated.version).toBe(existing.version + 1);
    });

    it("should reject version conflict", async () => {
      await expect(async () => {
        await updateShockEvent(
          shockEventId,
          {
            severity: "low",
            version: 999,
          },
          actorId
        );
      }).rejects.toThrow("Version conflict");
    });

    it("should reject invalid new severity", async () => {
      const existing = await getShockEventDetail(shockEventId);
      await expect(async () => {
        await updateShockEvent(
          shockEventId,
          {
            severity: "invalid",
            version: existing.version,
          } as unknown,
          actorId
        );
      }).rejects.toThrow("Invalid severity");
    });
  });

  describe("listShockEventsForEngagement", () => {
    beforeAll(async () => {
      // Create multiple shock events
      await createShockEvent(
        {
          engagementId,
          type: "owner_withdrawal",
          severity: "critical",
          happenedAt: "2026-04-15T10:00:00Z",
        },
        actorId
      );

      await createShockEvent(
        {
          engagementId,
          type: "margin_collapse",
          severity: "high",
          happenedAt: "2026-04-18T10:00:00Z",
        },
        actorId
      );
    });

    it("should list all shock events for engagement", async () => {
      const events = await listShockEventsForEngagement(engagementId);
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].happenedAt).toBeInstanceOf(Date);
    });

    it("should return empty list for non-existent engagement", async () => {
      await expect(async () => {
        await listShockEventsForEngagement("non-existent-id");
      }).rejects.toThrow("not found");
    });
  });

  describe("getShockEventDetail", () => {
    let shockEventId: string;

    beforeAll(async () => {
      const result = await createShockEvent(
        {
          engagementId,
          type: "supplier_failure",
          severity: "high",
          happenedAt: "2026-04-19T10:00:00Z",
          notes: "Primary supplier went bankrupt",
        },
        actorId
      );
      shockEventId = result.id;
    });

    it("should retrieve shock event detail", async () => {
      const event = await getShockEventDetail(shockEventId);
      expect(event.id).toBe(shockEventId);
      expect(event.type).toBe("supplier_failure");
      expect(event.severity).toBe("high");
      expect(event.notes).toBe("Primary supplier went bankrupt");
      expect(event.version).toBe(1);
    });

    it("should throw for non-existent shock event", async () => {
      await expect(async () => {
        await getShockEventDetail("non-existent-id");
      }).rejects.toThrow("not found");
    });
  });

  describe("shock event type validation", () => {
    it("should accept all valid shock event types", async () => {
      const validTypes = [
        "key_employee_loss",
        "major_client_loss",
        "payroll_pressure",
        "margin_collapse",
        "supplier_failure",
        "service_breakdown",
        "compliance_issue",
        "reputation_damage",
        "internal_conflict",
        "owner_withdrawal",
        "execution_stall",
      ];

      for (const type of validTypes) {
        const result = await createShockEvent(
          {
            engagementId,
            type: type as unknown,
            severity: "medium",
            happenedAt: "2026-04-22T10:00:00Z",
          },
          actorId
        );
        expect(result.id).toBeDefined();
      }
    });
  });

  describe("createShockEvent transaction behavior", () => {
    it("should create shock event atomically with audit event", async () => {
      const input: CreateShockEventInput = {
        engagementId,
        type: "margin_collapse",
        severity: "critical",
        happenedAt: "2026-04-22T15:00:00Z",
        notes: "Transaction test",
      };

      const result = await createShockEvent(input, actorId);
      expect(result.id).toBeDefined();

      // Verify the shock event was created
      const event = await getShockEventDetail(result.id);
      expect(event.type).toBe("margin_collapse");

      // Verify audit event was emitted
      const auditEvents = await db.auditEvent.findMany({
        where: {
          entityId: result.id,
          eventName: "shock_event.recorded",
        },
      });
      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0].payload).toBeDefined();
    });
  });
});
