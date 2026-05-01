import { describe, it, expect, beforeEach, vi } from "vitest";
import * as bcService from "./business-condition";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { triggerReEvaluation } from "./re-evaluation";
import { NotFoundError, ValidationError } from "@/infra/errors";

vi.mock("@/lib/db");
vi.mock("@/infra/audit");
vi.mock("./re-evaluation");
vi.mock("@/infra/logger");

const mockUserId = "user-123";
const mockEngagementId = "eng-123";
const mockProfileId = "profile-123";
const mockWorkspaceId = "550e8400-e29b-41d4-a716-446655440000";
const mockAuthContext = {
  session: {
    user: { id: mockUserId, email: "test@test.com", name: "Test", isActive: true },
    sessionId: "session-123",
    expiresAt: new Date(),
  },
  policy: { userId: mockUserId, roles: [] },
};

describe("business-condition service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assessCondition", () => {
    it("creates profile and marks previous as non-current", async () => {
      const input = {
        engagementId: mockEngagementId,
        businessStatus: "stable",
        severityScore: 5,
        urgencyLevel: "medium",
        cashPressureLevel: "low",
        marginPressureLevel: "medium",
        clientConcentrationRisk: "low",
        ownerDependencyRisk: "medium",
        keyPersonDependencyRisk: "high",
        processMaturityLevel: "medium",
        managementMaturityLevel: "high",
        executionCapacityLevel: "medium",
        moraleFragilityLevel: "low",
        resilienceLevel: "high",
        growthReadinessLevel: "medium",
      };

      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
        }),
      };
      mockDb.businessConditionProfile = {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({
          id: mockProfileId,
          isCurrent: true,
        }),
      };
      mockDb.idempotencyRecord = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };
      mockDb.$transaction = vi.fn(async (callback) => {
        return callback(mockDb);
      });

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");
      vi.mocked(triggerReEvaluation).mockResolvedValue({
        targets: {} as any,
        auditEventId: "eval-id",
      });

      const result = await bcService.assessCondition(input, mockAuthContext as any);

      expect(result.id).toBe(mockProfileId);
      // Verify append-only: old ones marked as non-current
      expect(mockDb.businessConditionProfile.updateMany).toHaveBeenCalled();
    });

    it("triggers re-evaluation with high severity", async () => {
      const input = {
        engagementId: mockEngagementId,
        businessStatus: "critical",
        severityScore: 9,
        urgencyLevel: "critical",
        cashPressureLevel: "critical",
        marginPressureLevel: "high",
        clientConcentrationRisk: "high",
        ownerDependencyRisk: "medium",
        keyPersonDependencyRisk: "low",
        processMaturityLevel: "low",
        managementMaturityLevel: "low",
        executionCapacityLevel: "low",
        moraleFragilityLevel: "high",
        resilienceLevel: "low",
        growthReadinessLevel: "low",
      };

      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
        }),
      };
      mockDb.businessConditionProfile = {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({
          id: mockProfileId,
          severityScore: 9,
        }),
      };
      mockDb.idempotencyRecord = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };
      mockDb.$transaction = vi.fn(async (callback) => {
        return callback(mockDb);
      });

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");
      vi.mocked(triggerReEvaluation).mockResolvedValue({
        targets: {} as any,
        auditEventId: "eval-id",
      });

      await bcService.assessCondition(input, mockAuthContext as any);

      expect(triggerReEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "high",
        })
      );
    });

    it("validates business status", async () => {
      const input = {
        engagementId: mockEngagementId,
        businessStatus: "invalid",
        severityScore: 5,
        urgencyLevel: "medium",
        cashPressureLevel: "low",
        marginPressureLevel: "medium",
        clientConcentrationRisk: "low",
        ownerDependencyRisk: "medium",
        keyPersonDependencyRisk: "high",
        processMaturityLevel: "medium",
        managementMaturityLevel: "high",
        executionCapacityLevel: "medium",
        moraleFragilityLevel: "low",
        resilienceLevel: "high",
        growthReadinessLevel: "medium",
      };

      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
        }),
      };

      await expect(bcService.assessCondition(input, mockAuthContext as any)).rejects.toThrow(
        ValidationError
      );
    });

    it("validates severity score bounds", async () => {
      const input = {
        engagementId: mockEngagementId,
        businessStatus: "stable",
        severityScore: 11,
        urgencyLevel: "medium",
        cashPressureLevel: "low",
        marginPressureLevel: "medium",
        clientConcentrationRisk: "low",
        ownerDependencyRisk: "medium",
        keyPersonDependencyRisk: "high",
        processMaturityLevel: "medium",
        managementMaturityLevel: "high",
        executionCapacityLevel: "medium",
        moraleFragilityLevel: "low",
        resilienceLevel: "high",
        growthReadinessLevel: "medium",
      };

      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({
          id: mockEngagementId,
          status: "active",
        }),
      };

      await expect(bcService.assessCondition(input, mockAuthContext as any)).rejects.toThrow(
        ValidationError
      );
    });
  });

  describe("getConditionHistory", () => {
    it("returns profiles in recency order", async () => {
      const mockDb = db as any;
      mockDb.engagement = {
        findUnique: vi.fn().mockResolvedValue({ id: mockEngagementId }),
      };
      mockDb.businessConditionProfile = {
        findMany: vi.fn().mockResolvedValue([
          { id: "p1" },
          { id: "p2" },
        ]),
      };

      const result = await bcService.getConditionHistory(mockEngagementId, mockWorkspaceId);

      expect(result).toHaveLength(2);
    });
  });

  describe("getCurrentCondition", () => {
    it("returns current profile", async () => {
      const mockDb = db as any;
      mockDb.businessConditionProfile = {
        findFirst: vi.fn().mockResolvedValue({
          id: mockProfileId,
          isCurrent: true,
        }),
      };

      const result = await bcService.getCurrentCondition(mockEngagementId, mockWorkspaceId);

      expect(result?.id).toBe(mockProfileId);
    });

    it("returns null when no current", async () => {
      const mockDb = db as any;
      mockDb.businessConditionProfile = {
        findFirst: vi.fn().mockResolvedValue(null),
      };

      const result = await bcService.getCurrentCondition(mockEngagementId, mockWorkspaceId);

      expect(result).toBeNull();
    });
  });
});
