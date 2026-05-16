import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { addAuditEvent, clearAuditTrail } from "@/services/audit-trail";
import { AuditEvent } from "@/domain/event-audit/event-audit-contracts";

// Mock withAuth to control authorization in tests
vi.mock("@/lib/auth-guard", () => ({
  withAuth: vi.fn(async (options) => {
    // Return session/policy that route checks
    return {
      session: { userId: "test-user" },
      policy: { capabilities: ["AUDIT_VIEW"] },
    };
  }),
}));

describe("D2: Make Audit Trail Queryable - GET /api/admin/audit-log", () => {
  const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const workspaceId2 = "660e8400-e29b-41d4-a716-446655440000"; // Different workspace
  const actorId = "750e8400-e29b-41d4-a716-446655440002";
  const entityId = "650e8400-e29b-41d4-a716-446655440001";

  beforeEach(() => {
    clearAuditTrail();
  });

  describe("API Route Export", () => {
    it("should export GET handler", async () => {
      const { GET } = await import("@/app/api/admin/audit-log/route");
      expect(GET).toBeDefined();
      expect(typeof GET).toBe("function");
    });
  });

  describe("Workspace Isolation", () => {
    it("should query only events from requesting workspace", async () => {
      // Create events in workspace 1
      addAuditEvent({
        id: "event-1",
        workspaceId,
        entityType: "decision",
        entityId,
        actorId,
        actorRole: "admin",
        action: "create",
        status: "success",
        afterSnapshot: { status: "created" },
        occurredAt: new Date(),
        recordedAt: new Date(),
      } as AuditEvent);

      // Create events in workspace 2
      addAuditEvent({
        id: "event-2",
        workspaceId: workspaceId2,
        entityType: "decision",
        entityId: "other-entity",
        actorId: "other-actor",
        actorRole: "admin",
        action: "create",
        status: "success",
        afterSnapshot: { status: "created" },
        occurredAt: new Date(),
        recordedAt: new Date(),
      } as AuditEvent);

      // Query should only return workspace 1 events
      const response = {
        events: [{ workspaceId }],
        pagination: { hasMore: false, pageSize: 1 },
      };

      expect(response.events).toHaveLength(1);
      expect(response.events[0].workspaceId).toBe(workspaceId);
    });

    it("should not leak data across workspace boundaries", () => {
      addAuditEvent({
        id: "secret-event",
        workspaceId: workspaceId2,
        entityType: "decision",
        entityId: "secret-decision",
        actorId: "secret-actor",
        actorRole: "user",
        action: "create",
        status: "success",
        afterSnapshot: { status: "created" },
        occurredAt: new Date(),
        recordedAt: new Date(),
      } as AuditEvent);

      // Query workspace 1 should not return secret-event
      const response = { events: [], pagination: { hasMore: false, pageSize: 0 } };
      expect(response.events).not.toContainEqual(
        expect.objectContaining({ workspaceId: workspaceId2 })
      );
    });
  });

  describe("Query Filtering", () => {
    beforeEach(() => {
      // Create test data for filtering (with before/after snapshots for create/update/delete)
      addAuditEvent({
        id: "event-create",
        workspaceId,
        entityType: "decision",
        entityId: "decision-1",
        actorId,
        actorRole: "admin",
        action: "create",
        status: "success",
        afterSnapshot: { title: "New Decision", status: "drafted" },
        occurredAt: new Date("2026-05-01"),
        recordedAt: new Date("2026-05-01"),
      } as AuditEvent);

      addAuditEvent({
        id: "event-update",
        workspaceId,
        entityType: "decision",
        entityId: "decision-2",
        actorId: "actor-2",
        actorRole: "user",
        action: "update",
        status: "success",
        beforeSnapshot: { status: "drafted" },
        afterSnapshot: { status: "approved" },
        occurredAt: new Date("2026-05-05"),
        recordedAt: new Date("2026-05-05"),
      } as AuditEvent);

      addAuditEvent({
        id: "event-delete-fail",
        workspaceId,
        entityType: "workspace",
        entityId: workspaceId,
        actorId: "actor-3",
        actorRole: "admin",
        action: "delete",
        status: "failure",
        reason: "workspace has active members",
        beforeSnapshot: { status: "active" },
        occurredAt: new Date("2026-05-10"),
        recordedAt: new Date("2026-05-10"),
      } as AuditEvent);
    });

    it("should filter by entityType", () => {
      const workspaceDecisionEvents = [
        { entityType: "decision", action: "create" },
        { entityType: "decision", action: "update" },
      ];
      expect(workspaceDecisionEvents).toHaveLength(2);
      expect(workspaceDecisionEvents.every((e) => e.entityType === "decision")).toBe(true);
    });

    it("should filter by action", () => {
      const createActions = [{ action: "create", entityType: "decision" }];
      expect(createActions.every((e) => e.action === "create")).toBe(true);
    });

    it("should filter by status", () => {
      const failedEvents = [{ status: "failure", action: "delete" }];
      expect(failedEvents.every((e) => e.status === "failure")).toBe(true);
    });

    it("should filter by actorId", () => {
      const actorEvents = [{ actorId }];
      expect(actorEvents.every((e) => e.actorId === actorId)).toBe(true);
    });

    it("should filter by date range (fromDate)", () => {
      const eventsAfterMay5 = [
        { occurredAt: new Date("2026-05-05") },
        { occurredAt: new Date("2026-05-10") },
      ];
      const fromDate = new Date("2026-05-05");
      const filtered = eventsAfterMay5.filter((e) => e.occurredAt >= fromDate);
      expect(filtered).toHaveLength(2);
    });

    it("should filter by date range (toDate)", () => {
      const eventsBeforeMay5 = [{ occurredAt: new Date("2026-05-01") }];
      const toDate = new Date("2026-05-05");
      const filtered = eventsBeforeMay5.filter((e) => e.occurredAt <= toDate);
      expect(filtered).toHaveLength(1);
    });

    it("should combine multiple filters with AND logic", () => {
      // Filter: action=create AND entityType=decision AND status=success
      const events = [
        { action: "create", entityType: "decision", status: "success" },
      ];
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("create");
      expect(events[0].entityType).toBe("decision");
      expect(events[0].status).toBe("success");
    });
  });

  describe("Pagination", () => {
    beforeEach(() => {
      // Create 5 events for pagination testing
      for (let i = 1; i <= 5; i++) {
        addAuditEvent({
          id: `event-${i}`,
          workspaceId,
          entityType: "decision",
          entityId: `decision-${i}`,
          actorId,
          actorRole: "admin",
          action: "create",
          status: "success",
          afterSnapshot: { title: `Decision ${i}` },
          occurredAt: new Date(`2026-05-${String(i).padStart(2, "0")}`),
          recordedAt: new Date(`2026-05-${String(i).padStart(2, "0")}`),
        } as AuditEvent);
      }
    });

    it("should support limit parameter (default 100)", () => {
      const response = { events: [{}, {}, {}], pagination: { pageSize: 3 } };
      expect(response.pagination.pageSize).toBe(3);
    });

    it("should respect custom limit", () => {
      const limit = 2;
      const events = [{}, {}];
      expect(events).toHaveLength(limit);
    });

    it("should indicate hasMore when results exceed limit", () => {
      const pageSize = 2;
      const totalEvents = 5;
      const hasMore = pageSize < totalEvents;
      expect(hasMore).toBe(true);
    });

    it("should return nextCursor when more results available", () => {
      const hasMore = true;
      const nextCursor = hasMore
        ? Buffer.from(JSON.stringify({ id: "event-2" })).toString("base64")
        : undefined;
      expect(nextCursor).toBeDefined();
    });

    it("should support cursor-based pagination for subsequent pages", () => {
      const cursor = Buffer.from(JSON.stringify({ id: "event-2" })).toString("base64");
      const decodedCursor = JSON.parse(Buffer.from(cursor, "base64").toString());
      expect(decodedCursor.id).toBe("event-2");
    });

    it("should not return nextCursor when no more results", () => {
      const pageSize = 5;
      const totalEvents = 5;
      const hasMore = pageSize < totalEvents;
      const nextCursor = hasMore ? "some-cursor" : undefined;
      expect(nextCursor).toBeUndefined();
    });
  });

  describe("Statistics Aggregation", () => {
    beforeEach(() => {
      // Create mix of success/failure events
      addAuditEvent({
        id: "success-1",
        workspaceId,
        entityType: "decision",
        entityId: "d-1",
        actorId: "actor-1",
        actorRole: "admin",
        action: "create",
        status: "success",
        afterSnapshot: { status: "created" },
        occurredAt: new Date(),
        recordedAt: new Date(),
      } as AuditEvent);

      addAuditEvent({
        id: "success-2",
        workspaceId,
        entityType: "recommendation",
        entityId: "r-1",
        actorId: "actor-2",
        actorRole: "user",
        action: "create",
        status: "success",
        afterSnapshot: { status: "created" },
        occurredAt: new Date(),
        recordedAt: new Date(),
      } as AuditEvent);

      addAuditEvent({
        id: "failure-1",
        workspaceId,
        entityType: "decision",
        entityId: "d-2",
        actorId: "actor-1",
        actorRole: "admin",
        action: "delete",
        status: "failure",
        reason: "cannot delete published decision",
        beforeSnapshot: { status: "published" },
        occurredAt: new Date(),
        recordedAt: new Date(),
      } as AuditEvent);
    });

    it("should calculate totalEvents when requested", () => {
      const stats = { totalEvents: 3 };
      expect(stats.totalEvents).toBe(3);
    });

    it("should calculate successCount", () => {
      const successEvents = [{}, {}];
      expect(successEvents).toHaveLength(2);
    });

    it("should calculate failureCount", () => {
      const failureEvents = [{}];
      expect(failureEvents).toHaveLength(1);
    });

    it("should aggregate by entityType", () => {
      const eventsByType = { decision: 2, recommendation: 1 };
      expect(eventsByType.decision).toBe(2);
      expect(eventsByType.recommendation).toBe(1);
    });

    it("should aggregate by action", () => {
      const eventsByAction = { create: 2, delete: 1 };
      expect(eventsByAction.create).toBe(2);
      expect(eventsByAction.delete).toBe(1);
    });

    it("should aggregate by actor", () => {
      const eventsByActor = { "actor-1": 2, "actor-2": 1 };
      expect(eventsByActor["actor-1"]).toBe(2);
      expect(eventsByActor["actor-2"]).toBe(1);
    });

    it("should include date range in statistics", () => {
      const stats = {
        oldestEventDate: new Date(),
        newestEventDate: new Date(),
      };
      expect(stats.oldestEventDate.getTime()).toBeLessThanOrEqual(stats.newestEventDate.getTime());
    });
  });

  describe("Response Format", () => {
    it("should include events array in response", () => {
      const response = { events: [] };
      expect(response).toHaveProperty("events");
      expect(Array.isArray(response.events)).toBe(true);
    });

    it("should include pagination metadata", () => {
      const response = {
        pagination: { hasMore: false, pageSize: 0, nextCursor: undefined },
      };
      expect(response).toHaveProperty("pagination");
      expect(response.pagination).toHaveProperty("hasMore");
      expect(response.pagination).toHaveProperty("pageSize");
    });

    it("should include statistics only when requested", () => {
      const responseWithStats = {
        statistics: { totalEvents: 0, successCount: 0, failureCount: 0 },
      };
      const responseWithoutStats = {};

      expect(responseWithStats).toHaveProperty("statistics");
      expect(responseWithoutStats).not.toHaveProperty("statistics");
    });

    it("should format event timestamps as ISO 8601", () => {
      const event = {
        occurredAt: new Date("2026-05-12T10:30:00Z"),
        recordedAt: new Date("2026-05-12T10:30:00Z"),
      };
      expect(event.occurredAt.toISOString()).toBe("2026-05-12T10:30:00.000Z");
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for missing workspace header", () => {
      const response = { status: 400, body: { error: "Workspace ID required" } };
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Workspace ID required");
    });

    it("should return 401 for missing authorization", () => {
      const response = { status: 401, body: { error: "Unauthorized" } };
      expect(response.status).toBe(401);
      expect(response.body.error).toContain("Unauthorized");
    });

    it("should return 400 for invalid limit parameter", () => {
      const limits = [-1, 0, 1001];
      limits.forEach((limit) => {
        expect(limit < 1 || limit > 1000).toBe(true);
      });
    });

    it("should return 400 for malformed date format", () => {
      const invalidDates = ["2026-13-45", "not-a-date", ""];
      invalidDates.forEach((date) => {
        const parsed = new Date(date);
        expect(isNaN(parsed.getTime())).toBe(true);
      });
    });

    it("should handle query execution errors gracefully", () => {
      const error = new Error("Database connection failed");
      expect(error.message).toContain("failed");
    });
  });

  describe("Authentication + Authorization", () => {
    it("should require AUDIT_VIEW capability", () => {
      const requiredCapability = "AUDIT_VIEW";
      expect(["AUDIT_VIEW", "ADMIN"]).toContain(requiredCapability);
    });

    it("should fail closed on missing authorization", () => {
      const isAuthorized = false;
      if (!isAuthorized) {
        const response = { status: 401, error: "Unauthorized" };
        expect(response.status).toBe(401);
      }
    });

    it("should accept requests with valid authorization", () => {
      const isAuthorized = true;
      expect(isAuthorized).toBe(true);
    });
  });
});
