import { describe, it, expect, beforeEach } from "vitest";
import {
  toPublicEngagementDTO,
  toPublicActionDTO,
  toPublicKPIDTO,
  toPublicExperimentDTO,
  toPublicWorkspaceHealthDTO,
  PublicAPIError,
  assertPublicAccess,
} from "@/services/public-api.service";

describe("Public API Service", () => {
  describe("toPublicEngagementDTO", () => {
    it("should convert engagement to public DTO", () => {
      const engagement = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Market Expansion",
        status: "active",
        industry: "Tech",
        currentStage: "Execution",
        progress: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const dto = toPublicEngagementDTO(engagement);

      expect(dto.id).toBe(engagement.id);
      expect(dto.name).toBe(engagement.name);
      expect(dto.status).toBe(engagement.status);
      expect(dto.progress).toBe(engagement.progress);
    });

    it("should redact internal cost fields", () => {
      const engagement = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Market Expansion",
        status: "active",
        industry: "Tech",
        currentStage: "Execution",
        progress: 50,
        costBudget: 100000,
        actualCost: 45000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const dto = toPublicEngagementDTO(engagement);

      expect((dto as any).costBudget).toBeUndefined();
      expect((dto as any).actualCost).toBeUndefined();
    });
  });

  describe("toPublicActionDTO", () => {
    it("should convert action to public DTO", () => {
      const action = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Complete analysis",
        description: "Market research task",
        status: "in_progress",
        priority: "high",
        dueDate: new Date().toISOString(),
        assignee: "john@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const dto = toPublicActionDTO(action);

      expect(dto.id).toBe(action.id);
      expect(dto.name).toBe(action.name);
      expect(dto.status).toBe(action.status);
      expect(dto.priority).toBe(action.priority);
    });

    it("should map assignee to owner in DTO", () => {
      const action = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Complete analysis",
        status: "in_progress",
        priority: "high",
        assignee: "john@example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const dto = toPublicActionDTO(action);

      expect(dto.owner).toBe(action.assignee);
    });
  });

  describe("toPublicKPIDTO", () => {
    it("should convert KPI with UUID to public DTO", () => {
      const kpi = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Revenue Growth",
        currentValue: 100000,
        targetValue: 150000,
        direction: "increase",
        trend: "improving",
        percentOfTarget: 67,
        updatedAt: new Date().toISOString(),
      };

      const dto = toPublicKPIDTO(kpi);

      expect(dto.id).toBe(kpi.id);
      expect(dto.name).toBe(kpi.name);
      expect(dto.currentValue).toBe(kpi.currentValue);
    });

    it("should convert KPI with slug ID to public DTO", () => {
      const kpi = {
        slug: "revenue-growth-2024",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Revenue Growth",
        currentValue: 100000,
        targetValue: 150000,
        direction: "increase",
        trend: "improving",
      };

      const dto = toPublicKPIDTO(kpi);

      expect(dto.id).toBe("revenue-growth-2024");
      expect(dto.name).toBe(kpi.name);
    });
  });

  describe("toPublicExperimentDTO", () => {
    it("should convert experiment to public DTO", () => {
      const experiment = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Pricing Test",
        status: "completed",
        plan: {
          hypothesis: {
            statement: "Increasing price by 10% improves margin without volume loss",
            type: "revenue_growth",
            successCriterion: "Margin increase >=5%",
            successThreshold: 105,
            testDurationWeeks: 4,
          },
          primaryMetric: "Profit Margin",
        },
        execution: {
          startedAt: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
          actualEndDate: new Date().toISOString(),
        },
        result: {
          classification: "success",
          successThresholdMet: true,
          primaryMetricValue: 28,
          roi: 2.5,
        },
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const dto = toPublicExperimentDTO(experiment);

      expect(dto.id).toBe(experiment.id);
      expect(dto.name).toBe(experiment.name);
      expect(dto.status).toBe(experiment.status);
      expect(dto.hypothesis.statement).toBe(experiment.plan.hypothesis.statement);
      expect(dto.result?.roi).toBe(experiment.result.roi);
    });

    it("should redact cost fields from experiment", () => {
      const experiment = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Pricing Test",
        status: "completed",
        plan: {
          hypothesis: { statement: "Test hypothesis" },
          primaryMetric: "Margin",
          estimatedCost: 50000,
          actualCost: 45000,
        },
        createdAt: new Date().toISOString(),
      };

      const dto = toPublicExperimentDTO(experiment);

      expect((dto as any).plan?.estimatedCost).toBeUndefined();
      expect((dto as any).plan?.actualCost).toBeUndefined();
    });
  });

  describe("toPublicWorkspaceHealthDTO", () => {
    it("should convert workspace health to public DTO", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: "healthy",
        engagementCount: 5,
        healthyEngagements: 4,
        atRiskEngagements: 1,
        criticalEngagements: 0,
        onTrackKPICount: 18,
        activeKPICount: 20,
        completedThisWeek: 3,
        actionQueueSize: 10,
        averageExecutionCertainty: 80,
      };

      const dto = toPublicWorkspaceHealthDTO(health);

      expect(dto.workspaceId).toBe(health.workspaceId);
      expect(dto.overallStatus).toBe(health.overallStatus);
      expect(dto.engagementCount).toBe(health.engagementCount);
      expect(dto.averageExecutionCertainty).toBe(health.averageExecutionCertainty);
    });

    it("should calculate active engagement count from health/at-risk", () => {
      const health = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: "healthy",
        engagementCount: 5,
        healthyEngagements: 3,
        atRiskEngagements: 2,
        criticalEngagements: 0,
        onTrackKPICount: 18,
        activeKPICount: 20,
        averageExecutionCertainty: 80,
      };

      const dto = toPublicWorkspaceHealthDTO(health);

      expect(dto.activeEngagements).toBe(5);
    });
  });

  describe("PublicAPIError", () => {
    it("should construct error with code and message", () => {
      const error = new PublicAPIError("INVALID_DTO", "Test error");

      expect(error.code).toBe("INVALID_DTO");
      expect(error.message).toBe("Test error");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("assertPublicAccess", () => {
    it("should throw error if workspace ID missing", () => {
      expect(() => assertPublicAccess("capability", "")).toThrow(PublicAPIError);
    });

    it("should throw error if capability missing", () => {
      expect(() => assertPublicAccess("", "550e8400-e29b-41d4-a716-446655440000")).toThrow(PublicAPIError);
    });

    it("should not throw if both provided", () => {
      expect(() => assertPublicAccess("capability", "550e8400-e29b-41d4-a716-446655440000")).not.toThrow();
    });
  });

  describe("toPublicEngagementDTO — field completeness", () => {
    const engagement = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Market Expansion",
      status: "active",
      industry: "Tech",
      currentStage: "Execution",
      progress: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("includes industry field in DTO", () => {
      const dto = toPublicEngagementDTO(engagement);
      expect(dto.industry).toBe("Tech");
    });

    it("includes currentStage field in DTO", () => {
      const dto = toPublicEngagementDTO(engagement);
      expect(dto.currentStage).toBe("Execution");
    });
  });

  describe("toPublicActionDTO — field completeness", () => {
    const action = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      engagementId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Complete analysis",
      status: "in_progress",
      priority: "high",
      assignee: "john@example.com",
      dueDate: "2026-12-31T00:00:00.000Z",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("includes engagementId in action DTO", () => {
      const dto = toPublicActionDTO(action);
      expect(dto.engagementId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("includes dueDate in action DTO", () => {
      const dto = toPublicActionDTO(action);
      expect(dto.dueDate).toBe("2026-12-31T00:00:00.000Z");
    });
  });

  describe("toPublicKPIDTO — field completeness", () => {
    it("includes targetValue in KPI DTO", () => {
      const kpi = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Revenue Growth",
        currentValue: 100000,
        targetValue: 150000,
        direction: "increase",
        trend: "improving",
        updatedAt: new Date().toISOString(),
      };
      const dto = toPublicKPIDTO(kpi);
      expect(dto.targetValue).toBe(150000);
    });
  });
});
