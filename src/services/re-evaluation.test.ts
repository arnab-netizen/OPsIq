import { describe, it, expect, beforeEach, vi } from "vitest";
import { triggerReEvaluation } from "./re-evaluation";

vi.mock("@/lib/db", () => ({
  db: {
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
    shockEvent: {
      findMany: vi.fn(),
    },
    engagement: {
      findUnique: vi.fn(),
    },
    interventionState: {
      findUnique: vi.fn(),
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

describe("Re-evaluation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("triggerReEvaluation", () => {
    it("requires engagementId", async () => {
      try {
        await triggerReEvaluation({
          changeType: "shock_event",
          entityType: "shock_event",
          entityId: "shock-1",
          severity: "critical",
          description: "Test",
          triggeredBy: "user-1",
        });
        expect.fail("Should throw");
      } catch (error: any) {
        expect(error.message).toContain("engagementId");
      }
    });

    it("returns ReEvaluationResult with all impact areas", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "challenged",
        severityScore: 6,
        cashPressureLevel: "medium",
        marginPressureLevel: "medium",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });

      mockDb.kpi.findMany.mockResolvedValue([
        { id: "kpi-1", status: "improving" },
        { id: "kpi-2", status: "stable" },
      ]);

      mockDb.action.findMany.mockResolvedValue([
        { id: "action-1", status: "completed", priority: "high" },
        { id: "action-2", status: "in_progress", priority: "medium" },
      ]);
      mockDb.action.count.mockResolvedValue(0);

      mockDb.shockEvent.findMany.mockResolvedValue([]);

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "stabilization",
      });

      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "planning",
      });

      mockDb.recommendation.findMany.mockResolvedValue([
        { id: "rec-1", status: "approved" },
      ]);

      const result = await triggerReEvaluation({
        changeType: "shock_event",
        entityType: "shock_event",
        entityId: "shock-1",
        engagementId: "eng-1",
        severity: "critical",
        description: "Critical shock event",
        triggeredBy: "user-1",
        correlationId: "shock-1",
      });

      expect(result).toHaveProperty("targets");
      expect(result).toHaveProperty("businessConditionImpact");
      expect(result).toHaveProperty("interventionModeImpact");
      expect(result).toHaveProperty("interventionPhaseImpact");
      expect(result).toHaveProperty("priorityImpact");
      expect(result).toHaveProperty("reviewCadenceImpact");
      expect(result).toHaveProperty("healthStatusImpact");
      expect(result).toHaveProperty("auditEventId");
    });

    it("deterministically computes same output for same input", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      const mockSetup = () => {
        mockDb.businessConditionProfile.findFirst.mockResolvedValue({
          businessStatus: "stable",
          severityScore: 5,
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
          moraleFragilityLevel: "low",
        });

        mockDb.kpi.findMany.mockResolvedValue([]);
        mockDb.action.findMany.mockResolvedValue([]);
        mockDb.action.count.mockResolvedValue(0);
        mockDb.shockEvent.findMany.mockResolvedValue([]);
        mockDb.engagement.findUnique.mockResolvedValue({
          id: "eng-1",
          interventionMode: "growth",
        });
        mockDb.interventionState.findUnique.mockResolvedValue({
          engagementId: "eng-1",
          currentPhase: "execution",
        });
        mockDb.recommendation.findMany.mockResolvedValue([]);
      };

      mockSetup();
      const result1 = await triggerReEvaluation({
        changeType: "new_critical_evidence",
        entityType: "evidence",
        entityId: "ev-1",
        engagementId: "eng-1",
        severity: "low",
        description: "Minor evidence",
        triggeredBy: "user-1",
      });

      mockSetup();
      const result2 = await triggerReEvaluation({
        changeType: "new_critical_evidence",
        entityType: "evidence",
        entityId: "ev-1",
        engagementId: "eng-1",
        severity: "low",
        description: "Minor evidence",
        triggeredBy: "user-1",
      });

      expect(result1.businessConditionImpact.recommendedRating).toBe(
        result2.businessConditionImpact.recommendedRating
      );
      expect(result1.interventionModeImpact.recommendedMode).toBe(
        result2.interventionModeImpact.recommendedMode
      );
    });

    it("escalates condition rating on critical risks", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "stable",
        severityScore: 3,
        cashPressureLevel: "critical",
        marginPressureLevel: "low",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });

      mockDb.kpi.findMany.mockResolvedValue([]);
      mockDb.action.findMany.mockResolvedValue([]);
      mockDb.action.count.mockResolvedValue(0);
      mockDb.shockEvent.findMany.mockResolvedValue([]);
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "stabilization",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.recommendation.findMany.mockResolvedValue([]);

      const result = await triggerReEvaluation({
        changeType: "kpi_deterioration",
        entityType: "kpi",
        entityId: "kpi-1",
        engagementId: "eng-1",
        severity: "high",
        description: "KPI deterioration",
        triggeredBy: "user-1",
      });

      expect(result.businessConditionImpact.recommendedRating).toBe("critical");
    });

    it("shifts mode to recovery on distressed condition", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "distressed",
        severityScore: 8,
        cashPressureLevel: "critical",
        marginPressureLevel: "low",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });

      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "growth",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });

      const result = await triggerReEvaluation({
        changeType: "shock_event",
        entityType: "shock_event",
        entityId: "shock-1",
        engagementId: "eng-1",
        severity: "critical",
        description: "Shock event",
        triggeredBy: "user-1",
      });

      expect(result.interventionModeImpact.recommendedMode).toBe("recovery");
    });

    it("escalates review cadence on critical condition", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "critical",
        severityScore: 10,
        cashPressureLevel: "critical",
        marginPressureLevel: "critical",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });

      mockDb.kpi.findMany.mockResolvedValue([]);
      mockDb.action.findMany.mockResolvedValue([]);
      mockDb.action.count.mockResolvedValue(0);
      mockDb.shockEvent.findMany.mockResolvedValue([]);
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "recovery",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.recommendation.findMany.mockResolvedValue([]);

      const result = await triggerReEvaluation({
        changeType: "shock_event",
        entityType: "shock_event",
        entityId: "shock-1",
        engagementId: "eng-1",
        severity: "critical",
        description: "Shock event",
        triggeredBy: "user-1",
      });

      expect(result.reviewCadenceImpact.riskLevel).toBe("critical");
      expect(result.reviewCadenceImpact.recommendedDaysUntilReview).toBe(3);
    });

    it("computes health score based on condition and overdue tasks", async () => {
      const { db } = await import("@/lib/db");
      const mockDb = db as any;

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "challenged",
        severityScore: 6,
        cashPressureLevel: "medium",
        marginPressureLevel: "medium",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });

      mockDb.kpi.findMany.mockResolvedValue([]);
      mockDb.action.findMany.mockResolvedValue([]);
      mockDb.action.count.mockResolvedValue(0);
      mockDb.shockEvent.findMany.mockResolvedValue([]);
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "stabilization",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.recommendation.findMany.mockResolvedValue([]);

      const result = await triggerReEvaluation({
        changeType: "unresolved_critical_blocker",
        entityType: "action",
        entityId: "action-1",
        engagementId: "eng-1",
        severity: "high",
        description: "Blocker",
        triggeredBy: "user-1",
      });

      expect(result.healthStatusImpact.healthScore).toBeGreaterThan(0);
      expect(result.healthStatusImpact.healthScore).toBeLessThanOrEqual(100);
      expect(["healthy", "at_risk", "critical", "unknown"]).toContain(
        result.healthStatusImpact.recommendedStatus
      );
    });

    it("emits audit event with full re-evaluation payload", async () => {
      const { db } = await import("@/lib/db");
      const { emitAuditEvent } = await import("@/infra/audit");
      const mockDb = db as any;
      const mockAudit = emitAuditEvent as any;

      mockDb.businessConditionProfile.findFirst.mockResolvedValue({
        businessStatus: "stable",
        severityScore: 5,
        cashPressureLevel: "low",
        marginPressureLevel: "low",
        ownerDependencyRisk: "low",
        moraleFragilityLevel: "low",
      });

      mockDb.kpi.findMany.mockResolvedValue([]);
      mockDb.action.findMany.mockResolvedValue([]);
      mockDb.action.count.mockResolvedValue(0);
      mockDb.shockEvent.findMany.mockResolvedValue([]);
      mockDb.engagement.findUnique.mockResolvedValue({
        id: "eng-1",
        interventionMode: "stabilization",
      });
      mockDb.interventionState.findUnique.mockResolvedValue({
        engagementId: "eng-1",
        currentPhase: "execution",
      });
      mockDb.recommendation.findMany.mockResolvedValue([]);

      await triggerReEvaluation({
        changeType: "new_critical_evidence",
        entityType: "evidence",
        entityId: "ev-1",
        engagementId: "eng-1",
        severity: "high",
        description: "Evidence",
        triggeredBy: "user-1",
        correlationId: "corr-1",
      });

      expect(mockAudit).toHaveBeenCalled();
      const call = mockAudit.mock.calls[0][0];
      expect(call.payload).toHaveProperty("businessConditionImpact");
      expect(call.payload).toHaveProperty("interventionModeImpact");
      expect(call.payload).toHaveProperty("reviewCadenceImpact");
      expect(call.payload).toHaveProperty("healthStatusImpact");
      expect(call.correlationId).toBe("corr-1");
    });
  });
});
