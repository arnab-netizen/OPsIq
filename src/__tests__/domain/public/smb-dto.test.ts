import { describe, it, expect } from "vitest";
import {
  validatePublicEngagementDTO,
  validatePublicActionDTO,
  validatePublicKPIDTO,
  validatePublicExperimentDTO,
  validatePublicWorkspaceHealthDTO,
} from "@/domain/public/smb-dto";

describe("Public SMB DTOs", () => {
  describe("validatePublicEngagementDTO", () => {
    it("should accept valid engagement DTO", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Test Engagement",
        status: "active" as const,
        currentStage: "Phase 2",
        progress: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicEngagementDTO(dto);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid engagement ID", () => {
      const dto = {
        id: "invalid-uuid",
        name: "Test Engagement",
        status: "active" as const,
        currentStage: "Phase 2",
        progress: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicEngagementDTO(dto);
      expect(errors).toContain("Invalid engagement ID format");
    });

    it("should reject missing name", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "",
        status: "active" as const,
        currentStage: "Phase 2",
        progress: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicEngagementDTO(dto);
      expect(errors).toContain("Engagement name required");
    });

    it("should reject progress out of bounds", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Test Engagement",
        status: "active" as const,
        currentStage: "Phase 2",
        progress: 150,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicEngagementDTO(dto);
      expect(errors).toContain("Progress must be 0-100");
    });
  });

  describe("validatePublicActionDTO", () => {
    it("should accept valid action DTO", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Complete Analysis",
        status: "in_progress" as const,
        priority: "high" as const,
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicActionDTO(dto);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid action ID", () => {
      const dto = {
        id: "not-a-uuid",
        name: "Complete Analysis",
        status: "in_progress" as const,
        priority: "high" as const,
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicActionDTO(dto);
      expect(errors).toContain("Invalid action ID format");
    });

    it("should reject missing name", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "",
        status: "in_progress" as const,
        priority: "high" as const,
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const errors = validatePublicActionDTO(dto);
      expect(errors).toContain("Action name required");
    });
  });

  describe("validatePublicKPIDTO", () => {
    it("should accept valid KPI DTO with UUID", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Revenue Growth",
        currentValue: 100000,
        targetValue: 150000,
        direction: "increase" as const,
        trend: "improving" as const,
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
      };
      const errors = validatePublicKPIDTO(dto);
      expect(errors).toHaveLength(0);
    });

    it("should accept valid KPI DTO with slug ID", () => {
      const dto = {
        id: "revenue-growth-2024",
        name: "Revenue Growth",
        currentValue: 100000,
        direction: "increase" as const,
        trend: "improving" as const,
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
      };
      const errors = validatePublicKPIDTO(dto);
      expect(errors).toHaveLength(0);
    });

    it("should reject missing name", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "",
        direction: "increase" as const,
        trend: "improving" as const,
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
      };
      const errors = validatePublicKPIDTO(dto);
      expect(errors).toContain("KPI name required");
    });
  });

  describe("validatePublicExperimentDTO", () => {
    it("should accept valid experiment DTO", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Pricing Test",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        status: "completed" as const,
        hypothesis: {
          statement: "Increasing price by 10% will improve margin without reducing volume",
          type: "revenue_growth",
          successCriterion: "Margin increases by 5% or more",
          testDurationWeeks: 4,
        },
        primaryMetric: "Profit Margin",
        actualValue: 28,
        result: {
          classification: "success" as const,
          successThresholdMet: true,
          roi: 2.5,
        },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      const errors = validatePublicExperimentDTO(dto);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid experiment ID", () => {
      const dto = {
        id: "invalid",
        name: "Pricing Test",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        status: "completed" as const,
        hypothesis: {
          statement: "Test hypothesis statement here for validation",
          type: "revenue_growth",
          successCriterion: "Success criteria",
          testDurationWeeks: 4,
        },
        primaryMetric: "Metric",
        createdAt: new Date().toISOString(),
      };
      const errors = validatePublicExperimentDTO(dto);
      expect(errors).toContain("Invalid experiment ID format");
    });

    it("should reject short hypothesis statement", () => {
      const dto = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Pricing Test",
        engagementId: "550e8400-e29b-41d4-a716-446655440001",
        status: "completed" as const,
        hypothesis: {
          statement: "Short",
          type: "revenue_growth",
          successCriterion: "Success",
          testDurationWeeks: 4,
        },
        primaryMetric: "Metric",
        createdAt: new Date().toISOString(),
      };
      const errors = validatePublicExperimentDTO(dto);
      expect(errors).toContain("Hypothesis statement required (min 10 chars)");
    });
  });

  describe("validatePublicWorkspaceHealthDTO", () => {
    it("should accept valid workspace health DTO", () => {
      const dto = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: "healthy" as const,
        engagementCount: 5,
        activeEngagements: 3,
        completedEngagements: 2,
        onTrackKPICount: 18,
        totalKPICount: 20,
        actionCompletionRate: 0.75,
        averageExecutionCertainty: 80,
      };
      const errors = validatePublicWorkspaceHealthDTO(dto);
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid workspace ID", () => {
      const dto = {
        workspaceId: "not-a-uuid",
        assessedAt: new Date().toISOString(),
        overallStatus: "healthy" as const,
        engagementCount: 5,
        activeEngagements: 3,
        completedEngagements: 2,
        onTrackKPICount: 18,
        totalKPICount: 20,
        actionCompletionRate: 0.75,
        averageExecutionCertainty: 80,
      };
      const errors = validatePublicWorkspaceHealthDTO(dto);
      expect(errors).toContain("Invalid workspace ID format");
    });

    it("should reject negative engagement count", () => {
      const dto = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: "healthy" as const,
        engagementCount: -1,
        activeEngagements: 3,
        completedEngagements: 2,
        onTrackKPICount: 18,
        totalKPICount: 20,
        actionCompletionRate: 0.75,
        averageExecutionCertainty: 80,
      };
      const errors = validatePublicWorkspaceHealthDTO(dto);
      expect(errors).toContain("Engagement count must be non-negative");
    });

    it("should reject execution certainty out of bounds", () => {
      const dto = {
        workspaceId: "550e8400-e29b-41d4-a716-446655440000",
        assessedAt: new Date().toISOString(),
        overallStatus: "healthy" as const,
        engagementCount: 5,
        activeEngagements: 3,
        completedEngagements: 2,
        onTrackKPICount: 18,
        totalKPICount: 20,
        actionCompletionRate: 0.75,
        averageExecutionCertainty: 150,
      };
      const errors = validatePublicWorkspaceHealthDTO(dto);
      expect(errors).toContain("Execution certainty must be 0-100");
    });
  });
});
