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

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");
      vi.mocked(triggerReEvaluation).mockResolvedValue({
        targets: {} as any,
        auditEventId: "eval-id",
      });

      const result = await bcService.assessCondition(input, mockUserId);

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

      vi.mocked(emitAuditEvent).mockResolvedValue("event-id");
      vi.mocked(triggerReEvaluation).mockResolvedValue({
        targets: {} as any,
        auditEventId: "eval-id",
      });

      await bcService.assessCondition(input, mockUserId);

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

      await expect(bcService.assessCondition(input, mockUserId)).rejects.toThrow(
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

      await expect(bcService.assessCondition(input, mockUserId)).rejects.toThrow(
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

      const result = await bcService.getConditionHistory(mockEngagementId);

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

      const result = await bcService.getCurrentCondition(mockEngagementId);

      expect(result?.id).toBe(mockProfileId);
    });

    it("returns null when no current", async () => {
      const mockDb = db as any;
      mockDb.businessConditionProfile = {
        findFirst: vi.fn().mockResolvedValue(null),
      };

      const result = await bcService.getCurrentCondition(mockEngagementId);

      expect(result).toBeNull();
    });
  });
});
