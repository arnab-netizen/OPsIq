import { describe, it, expect, beforeEach, vi } from "vitest";
import * as leadService from "./lead";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "./re-evaluation";

vi.mock("@/lib/db");
vi.mock("@/infra/audit");
vi.mock("@/infra/logger");
vi.mock("./re-evaluation");

const mockUserId = "user-123";
const mockLeadId = "lead-123";
const mockClientId = "client-123";
const mockEngagementId = "eng-123";
const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

const mockAuthContext = {
  session: {
    user: {
      id: mockUserId,
      email: "test@example.com",
      name: "Test User",
      isActive: true,
    },
    sessionId: "session-123",
    expiresAt: new Date(),
  },
  policy: {
    userId: mockUserId,
    roles: [],
  },
};

describe("lead service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createLead", () => {
    it("creates lead and emits audit event", async () => {
      const input = {
        companyName: "Prospect Inc",
        contactName: "John Doe",
      };

      const mockDb = db as any;
      mockDb.leadRecord = {
        create: vi.fn().mockResolvedValue({
          id: mockLeadId,
          companyName: input.companyName,
        }),
      };
      mockDb.idempotencyRecord = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };

      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "lead.created",
          entityId: mockLeadId,
        })
      );
    });
  });

  describe("updateLead", () => {
    it("updates lead status with valid transition", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "new",
          version: 1,
        }),
        update: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "qualifying",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      };

      expect(emitAuditEvent).toHaveBeenCalled();
    });

    it("throws ValidationError when updating converted lead", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "converted",
          version: 1,
        }),
      };

      await expect(
        leadService.updateLead(
          mockLeadId,
          { contactName: "New Name", version: 1 },
          mockAuthContext,
          mockWorkspaceId
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("linkLeadToEngagement", () => {
    it("links qualified lead to engagement and triggers re-evaluation", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "qualified",
          version: 1,
        }),
        update: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "converted",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      };
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          clientId: mockClientId,
        }),
      };
      mockDb.idempotencyRecord = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");
      vi.mocked(triggerReEvaluation).mockResolvedValue({
        targets: {} as any,
        auditEventId: "eval-id",
      });

      await leadService.linkLeadToEngagement(
        mockLeadId,
        mockEngagementId,
        mockClientId,
        mockUserId,
        mockWorkspaceId
      );

      expect(triggerReEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: "new_critical_evidence",
          severity: "medium",
        })
      );
    });

    it("validates engagement belongs to client", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "qualified",
          version: 1,
        }),
      };
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          clientId: "different-client-id",
        }),
      };

      await expect(
        leadService.linkLeadToEngagement(
          mockLeadId,
          mockEngagementId,
          mockClientId,
          mockUserId,
          mockWorkspaceId
        )
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when lead not qualified", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockLeadId,
          status: "new",
          version: 1,
        }),
      };

      await expect(
        leadService.linkLeadToEngagement(
          mockLeadId,
          mockEngagementId,
          mockClientId,
          mockUserId,
          mockWorkspaceId
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getLeadById", () => {
    it("returns lead with relations", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockLeadId,
          companyName: "Test Corp",
          client: { id: mockClientId },
          engagement: { id: mockEngagementId },
        }),
      };

      const result = await leadService.getLeadById(mockLeadId, mockWorkspaceId);

      expect(result.id).toBe(mockLeadId);
      expect(result.client).toBeDefined();
    });
  });

  describe("listLeads", () => {
    it("returns paginated leads", async () => {
      const mockDb = db as any;
      mockDb.leadRecord = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "lead-1",
            companyName: "Prospect 1",
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      };

      const result = await leadService.listLeads(mockWorkspaceId, { limit: 25, offset: 0 });

      expect(result.leads).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
