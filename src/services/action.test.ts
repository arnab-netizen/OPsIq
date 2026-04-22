import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTION_STATUSES } from "@/domain/constants/statuses";

// Mock the db and audit modules
vi.mock("@/lib/db", () => ({
  db: {
    engagement: {
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
    },
    recommendation: {
      findUnique: vi.fn(),
    },
    action: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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

describe("Action Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Status validation", () => {
    it("includes required statuses", () => {
      expect(ACTION_STATUSES).toContain("open");
      expect(ACTION_STATUSES).toContain("in_progress");
      expect(ACTION_STATUSES).toContain("completed");
    });
  });

  describe("Service creation", () => {
    it("creates action with valid input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.recommendation.findUnique.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
      });
      mockDb.action.create.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
        recommendationId: "rec-1",
        title: "Execute task",
        description: "Complete the task",
        status: "open",
        version: 1,
      });

      const { createAction } = await import("./action");
      const result = await createAction(
        {
          engagementId: "eng-1",
          recommendationId: "rec-1",
          title: "Execute task",
          description: "Complete the task",
        },
        "user-1"
      );

      expect(result.id).toBe("action-1");
      expect(result.status).toBe("open");
      expect(result.recommendationId).toBe("rec-1");
    });

    it("throws error if engagement not found", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue(null);

      const { createAction } = await import("./action");

      try {
        await createAction(
          {
            engagementId: "nonexistent",
            recommendationId: "rec-1",
            title: "Test",
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

      const { createAction } = await import("./action");

      try {
        await createAction(
          {
            engagementId: "eng-1",
            recommendationId: "rec-1",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("closed phase");
      }
    });

    it("throws error if recommendation belongs to different engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.recommendation.findUnique.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-2",
      });

      const { createAction } = await import("./action");

      try {
        await createAction(
          {
            engagementId: "eng-1",
            recommendationId: "rec-1",
            title: "Test",
          },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });
  });

  describe("List actions", () => {
    it("lists actions for engagement", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.engagement.findUnique.mockResolvedValue({ id: "eng-1" });
      mockDb.action.findMany.mockResolvedValue([
        {
          id: "action-1",
          title: "Execute task",
          status: "open",
          recommendationId: "rec-1",
          createdAt: new Date(),
        },
      ]);
      mockDb.action.count.mockResolvedValue(1);

      const { listActions } = await import("./action");
      const result = await listActions("eng-1");

      expect(result.actions.length).toBe(1);
      expect(result.total).toBe(1);
      expect(result.actions[0].status).toBe("open");
    });
  });

  describe("Get action", () => {
    it("retrieves action by id", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
        recommendationId: "rec-1",
        title: "Execute task",
        description: "Complete the task",
        status: "open",
        version: 1,
        createdBy: "user-1",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      });

      const { getActionById } = await import("./action");
      const result = await getActionById("action-1");

      expect(result.id).toBe("action-1");
      expect(result.status).toBe("open");
      expect(result.recommendationId).toBe("rec-1");
    });

    it("rejects action if engagementId doesn't match", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
        recommendationId: "rec-1",
        title: "Test",
        description: null,
        status: "open",
        version: 1,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const { getActionById } = await import("./action");

      try {
        await getActionById("action-1", "eng-2");
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("does not belong to");
      }
    });
  });

  describe("Update action status", () => {
    it("updates action status with version check", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockEmit = emitAuditEvent as any;

      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
        recommendationId: "rec-1",
        status: "open",
        version: 1,
      });
      mockDb.action.update.mockResolvedValue({
        id: "action-1",
        status: "in_progress",
        version: 2,
      });

      const { updateActionStatus } = await import("./action");
      await updateActionStatus(
        "action-1",
        { status: "in_progress", version: 1 },
        "user-1",
        "eng-1"
      );

      expect(mockDb.action.update).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalled();
      const auditCall = mockEmit.mock.calls[0][0];
      expect(auditCall.eventName).toBe("action.status_updated");
      expect(auditCall.payload.newStatus).toBe("in_progress");
      expect(auditCall.payload.previousStatus).toBe("open");
    });

    it("throws error if version mismatch", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;
      mockDb.action.findUnique.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
        status: "open",
        version: 2,
      });

      const { updateActionStatus } = await import("./action");

      try {
        await updateActionStatus(
          "action-1",
          { status: "in_progress", version: 1 },
          "user-1"
        );
        expect.fail("Should throw ValidationError");
      } catch (error) {
        expect((error as any).message).toContain("version mismatch");
      }
    });
  });

  describe("Audit emission", () => {
    it("emits ACTION_CREATED audit event", async () => {
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
      mockDb.recommendation.findUnique.mockResolvedValue({
        id: "rec-1",
        engagementId: "eng-1",
      });
      mockDb.action.create.mockResolvedValue({
        id: "action-1",
        engagementId: "eng-1",
        recommendationId: "rec-1",
        title: "Test action",
        description: null,
        status: "open",
        version: 1,
      });

      const { createAction } = await import("./action");
      await createAction(
        {
          engagementId: "eng-1",
          recommendationId: "rec-1",
          title: "Test action",
        },
        "user-1"
      );

      expect(mockEmit).toHaveBeenCalled();
      const call = mockEmit.mock.calls[0][0];
      expect(call.eventName).toBe("action.created");
      expect(call.payload.actionId).toBe("action-1");
      expect(call.payload.engagementId).toBe("eng-1");
      expect(call.payload.recommendationId).toBe("rec-1");
      expect(call.payload.status).toBe("open");
      expect(call.visibility).toBe("internal");
    });
  });
});
