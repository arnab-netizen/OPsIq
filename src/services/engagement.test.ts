import { describe, it, expect, beforeEach, vi } from "vitest";
import * as engagementService from "./engagement";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { triggerReEvaluation } from "./re-evaluation";
import { NotFoundError, ValidationError } from "@/infra/errors";
import type { AuthContext } from "@/lib/auth-guard";

vi.mock("@/lib/db");
vi.mock("@/infra/audit");
vi.mock("./re-evaluation");
vi.mock("./engagement-health");
vi.mock("@/infra/logger");

// Import mocked modules to set up default behavior
import { computeEngagementHealth, enforceEngagementHealth } from "./engagement-health";

const mockUserId = "user-123";
const mockClientId = "client-123";
const mockEngagementId = "eng-123";
const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";

// Helper to create mock authContext for tests
function createMockAuthContext(userId: string = mockUserId): AuthContext {
  return {
    session: {
      user: {
        id: userId,
        email: "test@example.com",
        name: "Test User",
        isActive: true,
      },
      sessionId: "session-123",
      expiresAt: new Date(Date.now() + 86400000),
    },
    policy: {
      userId,
      roles: [{ role: "admin" as const }],
    },
  };
}

describe("engagement service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default mocks for engagement-health
    vi.mocked(enforceEngagementHealth).mockResolvedValue(true);
    vi.mocked(computeEngagementHealth).mockResolvedValue({
      status: "healthy",
      reasons: [],
      requiresIntervention: false,
      details: {
        criticalFindings: 0,
        criticalActions: 0,
        overdueActions: 0,
        blockedCriticalActions: 0,
        highPriorityActions: 0,
      },
    });
  });

  describe("createEngagement", () => {
    it("creates engagement with valid intervention mode", async () => {
      const input = {
        title: "Recovery",
        clientId: mockClientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      };

      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockClientId,
          name: "Test Client",
          status: "active",
        }),
      };
      mockDb.engagement = {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === mockEngagementId) {
            return Promise.resolve({
              id: mockEngagementId,
              code: "TEST-001",
              title: input.title,
              interventionMode: null,
            });
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          code: "TEST-001",
          title: input.title,
        }),
        update: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          code: "TEST-001",
          title: input.title,
          interventionMode: input.interventionMode,
          interventionPhase: "triage",
          version: 1,
        }),
      };
      mockDb.idempotencyRecord = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      const result = await engagementService.createEngagement(input, createMockAuthContext(mockUserId), '550e8400-e29b-41d4-a716-446655440000');

      expect(result.id).toBe(mockEngagementId);
      expect(emitAuditEvent).toHaveBeenCalled();
    });

    it("throws on invalid intervention mode", async () => {
      const input = {
        title: "Test",
        clientId: mockClientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "invalid",
      };

      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({
          status: "active",
          name: "Test Client",
        }),
      };

      await expect(
        engagementService.createEngagement(input, createMockAuthContext(mockUserId), '550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow(ValidationError);
    });

    it("throws when client archived", async () => {
      const input = {
        title: "Test",
        clientId: mockClientId,
        serviceTier: "premium",
        engagementMode: "expert",
        interventionMode: "recovery",
      };

      const mockDb = db as any;
      mockDb.clientAccount = {
        findUnique: vi.fn().mockResolvedValue({ status: "archived" }),
      };

      await expect(
        engagementService.createEngagement(input, createMockAuthContext(mockUserId), '550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("updateEngagement", () => {
    it("updates status and emits event", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "draft",
          interventionMode: "recovery",
        }),
        update: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
        }),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      await engagementService.updateEngagement(
        mockEngagementId,
        { status: "active", version: 1 },
        createMockAuthContext(mockUserId),
        "550e8400-e29b-41d4-a716-446655440000"
      );

      expect(emitAuditEvent).toHaveBeenCalled();
    });

    it("triggers re-evaluation on intervention mode change", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
          interventionMode: "recovery",
        }),
        update: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          interventionMode: "growth",
        }),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");
      vi.mocked(triggerReEvaluation).mockResolvedValue({
        targets: {} as any,
        auditEventId: "eval-id",
      });

      const response = await engagementService.updateEngagement(
        mockEngagementId,
        { interventionMode: "growth", version: 1 },
        createMockAuthContext(mockUserId),
        "550e8400-e29b-41d4-a716-446655440000"
      );

      expect(triggerReEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          changeType: "intervention_override",
        })
      );
    });

    it("emits completed event on status transition", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
          interventionMode: "recovery",
        }),
        update: vi.fn().mockResolvedValue({
          status: "completed",
        }),
      };

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");

      await engagementService.updateEngagement(
        mockEngagementId,
        { status: "completed", version: 1 },
        createMockAuthContext(mockUserId),
        "550e8400-e29b-41d4-a716-446655440000"
      );

      // Should emit both ENGAGEMENT_UPDATED and ENGAGEMENT_COMPLETED
      expect(emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "engagement.completed",
        })
      );
    });
  });

  describe("getEngagementById", () => {
    it("returns engagement with relations", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          code: "TEST-001",
          visibility: "internal",
          client: { id: mockClientId },
          conditionProfiles: [],
          memberships: [],
          parent: null,
          children: [],
          _count: { leads: 0 },
        }),
      };

      const result = await engagementService.getEngagementById(mockEngagementId, '550e8400-e29b-41d4-a716-446655440000', true);

      expect(result.id).toBe(mockEngagementId);
    });
  });

  describe("listEngagements", () => {
    it("returns paginated engagements", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findMany: vi.fn().mockResolvedValue([
          { id: "eng-1", code: "TEST-001" },
        ]),
        count: vi.fn().mockResolvedValue(1),
      };

      const result = await engagementService.listEngagements('550e8400-e29b-41d4-a716-446655440000', {});

      expect(result.engagements).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
