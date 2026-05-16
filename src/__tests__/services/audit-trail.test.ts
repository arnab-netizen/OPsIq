import { describe, it, expect, beforeEach } from "vitest";
import {
  queryAuditTrail,
  getAuditTrailForEntity,
  getAuditTrailForActor,
  getAuditStatistics,
  exportAuditTrail,
  addAuditEvent,
  clearAuditTrail,
} from "@/services/audit-trail";

describe("STAGE 17 Slice 3: Audit Trail Queryability", () => {
  const workspaceId = "550e8400-e29b-41d4-a716-446655440000";
  const entityId = "650e8400-e29b-41d4-a716-446655440001";
  const actorId = "750e8400-e29b-41d4-a716-446655440002";

  beforeEach(() => {
    clearAuditTrail();
  });

  describe("Audit Trail Query", () => {
    it("should query empty audit trail", async () => {
      const filter = { workspaceId };
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.pageSize).toBe(0);
    });

    it("should filter by entity type", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440020",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const filter = { workspaceId, entityType: "action" };
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].entityType).toBe("action");
    });

    it("should filter by entity ID", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440030",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const filter = { workspaceId, entityId };
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].entityId).toBe(entityId);
    });

    it("should filter by action", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440050",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "update" as const,
        beforeSnapshot: { status: "original" },
        afterSnapshot: { status: "updated" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const filter = { workspaceId, action: "update" as const };
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].action).toBe("update");
    });

    it("should filter by status", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440060",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "delete" as const,
        beforeSnapshot: { status: "deleted" },
        status: "failure" as const,
        reason: "Insufficient permissions",
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const filter = { workspaceId, status: "failure" as const };
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].status).toBe("failure");
    });

    it("should enforce workspace scope", async () => {
      const otherWorkspaceId = "950e8400-e29b-41d4-a716-446655440006";
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440080",
        workspaceId: otherWorkspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const filter = { workspaceId }; // Different workspace
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(0);
    });

    it("should paginate results", async () => {
      for (let i = 0; i < 5; i++) {
        const event = {
          id: `550e8400-e29b-41d4-a716-44665544009${i}`,
          workspaceId,
          entityType: "action",
          entityId,
          actorId,
          actorRole: "user" as const,
          action: "create" as const,
        afterSnapshot: { status: "created" },
          status: "success" as const,
          payload: {},
          occurredAt: new Date(Date.now() - i * 1000),
          recordedAt: new Date(Date.now() - i * 1000),
        };
        addAuditEvent(event as any);
      }

      const filter = { workspaceId };
      const result = await queryAuditTrail(filter, 2);

      expect(result.events).toHaveLength(2);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBeDefined();
    });
  });

  describe("Entity-Specific Audit Trail", () => {
    it("should get audit trail for specific entity", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440100",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const trail = await getAuditTrailForEntity(workspaceId, entityId);
      expect(trail).toHaveLength(1);
      expect(trail[0].entityId).toBe(entityId);
    });

    it("should get audit trail for specific actor", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440110",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const trail = await getAuditTrailForActor(workspaceId, actorId);
      expect(trail).toHaveLength(1);
      expect(trail[0].actorId).toBe(actorId);
    });
  });

  describe("Audit Statistics", () => {
    it("should calculate audit statistics", async () => {
      const event1 = {
        id: "550e8400-e29b-41d4-a716-446655440120",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      const event2 = {
        id: "550e8400-e29b-41d4-a716-446655440121",
        workspaceId,
        entityType: "decision",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "failure" as const,
        reason: "Invalid data",
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event1 as any);
      addAuditEvent(event2 as any);

      const stats = await getAuditStatistics(workspaceId);

      expect(stats.totalEvents).toBe(2);
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(1);
    });
  });

  describe("Audit Trail Export", () => {
    it("should export audit trail as rows", async () => {
      const event = {
        id: "550e8400-e29b-41d4-a716-446655440140",
        workspaceId,
        entityType: "action",
        entityId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event as any);

      const rows = await exportAuditTrail(workspaceId);

      expect(rows).toHaveLength(1);
      expect(rows[0].entityType).toBe("action");
    });
  });

  describe("Real-World Scenarios", () => {
    it("should track complete action lifecycle", async () => {
      const actionId = "650e8400-e29b-41d4-a716-446655440008";
      const event1 = {
        id: "550e8400-e29b-41d4-a716-446655440160",
        workspaceId,
        entityType: "action",
        entityId: actionId,
        actorId,
        actorRole: "user" as const,
        action: "create" as const,
        afterSnapshot: { status: "created" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      const event2 = {
        id: "550e8400-e29b-41d4-a716-446655440161",
        workspaceId,
        entityType: "action",
        entityId: actionId,
        actorId,
        actorRole: "user" as const,
        action: "update" as const,
        beforeSnapshot: { status: "original" },
        afterSnapshot: { status: "updated" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(Date.now() + 1000),
        recordedAt: new Date(Date.now() + 1000),
      };

      addAuditEvent(event1 as any);
      addAuditEvent(event2 as any);

      const trail = await getAuditTrailForEntity(workspaceId, actionId);
      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe("update");
      expect(trail[1].action).toBe("create");
    });

    it("should detect admin vs user activity", async () => {
      const adminActorId = "a50e8400-e29b-41d4-a716-446655440009";
      const event1 = {
        id: "550e8400-e29b-41d4-a716-446655440170",
        workspaceId,
        entityType: "action",
        entityId,
        actorId: adminActorId,
        actorRole: "admin" as const,
        action: "delete" as const,
        beforeSnapshot: { status: "deleted" },
        status: "success" as const,
        payload: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      addAuditEvent(event1 as any);

      const result = await queryAuditTrail({
        workspaceId,
        actorRole: "admin",
      });
      expect(result.events).toHaveLength(1);
      expect(result.events[0].actorRole).toBe("admin");
    });
  });

  describe("Compliance + Edge Cases", () => {
    it("should handle empty search results gracefully", async () => {
      const filter = { workspaceId, entityType: "nonexistent" };
      const result = await queryAuditTrail(filter);

      expect(result.events).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    it("should limit query results", async () => {
      const filter = { workspaceId };
      const result = await queryAuditTrail(filter, 1000);

      expect(result.pagination.pageSize).toBeLessThanOrEqual(1000);
    });
  });
});
